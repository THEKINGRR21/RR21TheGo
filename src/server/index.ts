import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { db, rlsTransaction } from './db';
import { users, targets, bodyMetrics, foods, foodServings, entries } from '../db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { computeTarget } from '../utils/nutrition';
import { calibrateTDEE } from '../utils/algorithm';
import { calculateWeightTrends } from '../utils/weight';

const app = new Hono();

// Enable CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * Middleware to extract and verify the auth subject claim from the request.
 * For local testing/dev, we support:
 *   - JWT-like subject in Authorization header: Bearer <subject>
 */
async function getAuthSubject(c: any): Promise<string> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid token format');
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new Error('Unauthorized: Token is empty');
  }
  return token;
}

// Helper to get authenticated user from subject
async function getAuthUser(c: any) {
  const authSubject = await getAuthSubject(c);
  const matchedUsers = await db
    .select()
    .from(users)
    .where(and(eq(users.authSubject, authSubject), sql`users.deleted_at is null`))
    .limit(1);

  if (matchedUsers.length === 0) {
    throw new Error('Unauthorized: User not found');
  }
  return matchedUsers[0];
}

// 1. Get User Profile with Dynamic TDEE Auto-Calibration
app.get('/api/user/profile', async (c) => {
  try {
    const authSubject = await getAuthSubject(c);
    
    // Find user by authSubject. 
    const matchedUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.authSubject, authSubject), sql`users.deleted_at is null`))
      .limit(1);

    if (matchedUsers.length === 0) {
      return c.json({ user: null, target: null });
    }

    const user = matchedUsers[0];

    // Fetch latest target
    const latestTarget = await rlsTransaction(user.id, async (tx) => {
      const rows = await tx
        .select()
        .from(targets)
        .where(eq(targets.userId, user.id))
        .orderBy(desc(targets.createdAt))
        .limit(1);
      return rows[0] || null;
    });

    let currentTarget = latestTarget;

    if (latestTarget) {
      // 1. Fetch weight history
      const weights = await rlsTransaction(user.id, async (tx) => {
        return await tx
          .select()
          .from(bodyMetrics)
          .where(eq(bodyMetrics.userId, user.id))
          .orderBy(desc(bodyMetrics.measuredOn));
      });
      const weightHistory = weights.map((w: any) => ({
        date: w.measuredOn,
        weightKg: Number(w.weightKg),
      }));

      // 2. Fetch daily calorie logs sum
      const foodLogs = await rlsTransaction(user.id, async (tx) => {
        const rows = await tx.execute(sql`
          select logged_for as date, sum(kcal) as "kcalLogged"
          from entries
          where user_id = ${user.id}::uuid
          group by logged_for
        `);
        return rows.rows || [];
      });
      const foodHistory = foodLogs.map((r: any) => ({
        date: r.date,
        kcalLogged: Number(r.kcalLogged),
      }));

      const bmrKcal = Number(latestTarget.bmrKcal) || 1500;
      const currentWeightKg = weightHistory[0] ? Number(weightHistory[0].weightKg) : Number(user.heightCm) - 100;

      // Run calibration algorithm (Algorithm M1)
      const calibration = calibrateTDEE({
        sex: user.sexAtBirth || 'female',
        weightHistory,
        foodHistory,
        bmrKcal,
        goal: 'cut', // assume cut goal from registered setup
        rateWeeklyPct: 0.5,
        currentWeightKg,
      });

      // If budget has adjusted, insert a new target row!
      if (calibration.basis === 'calibrated' && calibration.dailyCalorieBudget !== latestTarget.kcal) {
        currentTarget = await rlsTransaction(user.id, async (tx) => {
          const inserted = await tx
            .insert(targets)
            .values({
              userId: user.id,
              effectiveFrom: new Date().toISOString().split('T')[0],
              kcal: calibration.dailyCalorieBudget,
              proteinG: latestTarget.proteinG,
              fatG: latestTarget.fatG,
              carbG: latestTarget.carbG,
              basis: 'calibrated',
              bmrKcal: latestTarget.bmrKcal,
              tdeeKcal: calibration.calibratedTdee,
              formula: latestTarget.formula,
              rationale: calibration.rationale,
            })
            .returning();
          return inserted[0];
        });
      }
    }

    return c.json({ user, target: currentTarget });
  } catch (err: any) {
    console.error('Error fetching profile:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 2. Register/Onboard User
app.post('/api/auth/register', async (c) => {
  try {
    const authSubject = await getAuthSubject(c);
    const body = await c.req.json();

    const {
      email,
      birthDate,
      sexAtBirth,
      heightCm,
      weightKg,
      activity,
      goal,
      rateWeeklyPct,
      leanMassKg,
      goalWeightKg,
      displayName,
      timezone,
    } = body;

    // Validate inputs & compute target (satisfies §9 ceilings & floors)
    const calculation = computeTarget({
      sex: sexAtBirth,
      birthDate,
      heightCm: Number(heightCm),
      weightKg: Number(weightKg),
      activity,
      goal,
      rateWeeklyPct: Number(rateWeeklyPct),
      leanMassKg: leanMassKg ? Number(leanMassKg) : undefined,
      goalWeightKg: goalWeightKg ? Number(goalWeightKg) : undefined,
    });

    // Check if user already exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.authSubject, authSubject))
      .limit(1);

    let userId: string;
    let userRecord: any;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      // Update existing user details
      await db.update(users)
        .set({
          email,
          displayName: displayName || existingUsers[0].displayName,
          sexAtBirth,
          birthDate,
          heightCm: sql`${heightCm}::numeric`,
          timezone: timezone || 'UTC',
          deletedAt: null, // restore if soft deleted
        })
        .where(eq(users.id, userId));
      
      userRecord = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    } else {
      // Create new user record
      const insertedUsers = await db.insert(users).values({
        authSubject,
        email,
        displayName: displayName || '',
        sexAtBirth,
        birthDate,
        heightCm: sql`${heightCm}::numeric`,
        timezone: timezone || 'UTC',
      }).returning();
      
      userRecord = insertedUsers[0];
      userId = userRecord.id;
    }

    // Run insert targets & initial body metrics in an RLS-enforced transaction
    const targetRecord = await rlsTransaction(userId, async (tx) => {
      // Insert new target
      const insertedTargets = await tx.insert(targets).values({
        userId,
        effectiveFrom: new Date().toISOString().split('T')[0],
        kcal: calculation.clampedTarget,
        proteinG: 150, // default target distribution for active/lifter cohort
        fatG: 70,
        carbG: 300,
        basis: 'estimated',
        bmrKcal: calculation.bmr,
        tdeeKcal: calculation.tdee,
        formula: leanMassKg ? 'katch_mcardle' : 'mifflin_st_jeor',
        rationale: calculation.rationale,
      }).returning();

      // Insert initial body weight metric
      await tx.insert(bodyMetrics).values({
        userId,
        measuredOn: new Date().toISOString().split('T')[0],
        weightKg: sql`${weightKg}::numeric`,
        bodyFatPct: leanMassKg ? sql`NULL` : sql`NULL`,
        source: 'manual',
      }).onConflictDoUpdate({
        target: [bodyMetrics.userId, bodyMetrics.measuredOn, bodyMetrics.source],
        set: { weightKg: sql`${weightKg}::numeric` },
      });

      return insertedTargets[0];
    });

    return c.json({ user: userRecord, target: targetRecord });
  } catch (err: any) {
    console.error('Error during onboarding registration:', err);
    if (err.cause) {
      console.error('Underlying cause:', err.cause);
    }
    return c.json({ error: err.message }, err.message.includes('Age gate') || err.message.includes('BMI') ? 400 : 500);
  }
});

// 3. Search Foods (Recency & Frequency Ranked)
app.get('/api/foods/search', async (c) => {
  try {
    const user = await getAuthUser(c);
    const q = c.req.query('q') || '';
    const barcode = c.req.query('barcode') || '';

    let foodsList: any[] = [];

    if (barcode) {
      // 1. Search local database first
      foodsList = await db
        .select()
        .from(foods)
        .where(eq(foods.barcode, barcode))
        .limit(10);

      // 2. Query USDA API by barcode if not found locally
      if (foodsList.length === 0) {
        console.log(`[USDA API] Querying product details for barcode: ${barcode}`);
        try {
          const resUsda = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${barcode}&pageSize=1`);
          if (resUsda.status === 200) {
            const usdaPayload = await resUsda.json();
            const products = usdaPayload.foods || [];
            if (products.length > 0) {
              const prod = products[0];
              const kcal = Number(prod.foodNutrients.find((n: any) => n.unitName === 'KCAL' || n.nutrientName.toLowerCase().includes('energy'))?.value) || 0;
              const protein = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase() === 'protein')?.value) || 0;
              const fat = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('lipid') || n.nutrientName.toLowerCase() === 'fat')?.value) || 0;
              const carb = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('carbohydrate'))?.value) || 0;
              const fiber = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('fiber') || n.nutrientName.toLowerCase().includes('fibre'))?.value) || 0;

              const foodName = prod.description || 'Unknown Branded Food';
              const foodBrand = prod.brandName || prod.brandOwner || 'Generic';
              const sourceIdStr = String(prod.fdcId);

              // Check if it already exists locally
              const existing = await db
                .select()
                .from(foods)
                .where(and(eq(foods.source, 'usda'), eq(foods.sourceId, sourceIdStr)))
                .limit(1);

              let targetFood;
              if (existing.length > 0) {
                targetFood = existing[0];
              } else {
                // Insert new row (omit id so Postgres gen_random_uuid works)
                const [inserted] = await db.insert(foods).values({
                  source: 'usda',
                  sourceId: sourceIdStr,
                  barcode,
                  name: foodName,
                  brand: foodBrand,
                  kcalPer100g: sql`${kcal}::numeric`,
                  proteinPer100g: sql`${protein}::numeric`,
                  fatPer100g: sql`${fat}::numeric`,
                  carbPer100g: sql`${carb}::numeric`,
                  fiberPer100g: sql`${fiber}::numeric`,
                  searchVector: sql`to_tsvector('english', ${foodName + ' ' + foodBrand})`,
                }).returning();

                targetFood = inserted;

                // Add servings
                const servingsList = [{ label: '100g', grams: 100, isDefault: true }];
                const servingGrams = Number(prod.servingSize) || 0;
                if (servingGrams > 0) {
                  const label = prod.householdServingFullText ? `${prod.householdServingFullText} (${servingGrams}g)` : `1 serving (${servingGrams}g)`;
                  servingsList.push({ label, grams: servingGrams, isDefault: false });
                }

                for (const s of servingsList) {
                  await db.insert(foodServings).values({
                    foodId: targetFood.id,
                    label: s.label,
                    grams: sql`${s.grams}::numeric`,
                    isDefault: s.isDefault,
                  }).onConflictDoNothing();
                }
              }

              foodsList = await db.select().from(foods).where(eq(foods.id, targetFood.id));
            }
          }
        } catch (err) {
          console.error('Failed to resolve barcode from USDA API:', err);
        }
      }

      // 3. Fallback to Open Food Facts API (with headers) if still not found
      if (foodsList.length === 0) {
        console.log(`[OFF API] Querying product details for barcode: ${barcode}`);
        try {
          const resOff = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
            headers: {
              'User-Agent': 'GoTracker/1.0 (rishiraman212005@gmail.com)'
            }
          });
          if (resOff.status === 200) {
            const offPayload = await resOff.json();
            if (offPayload.status === 1 && offPayload.product) {
              const prod = offPayload.product;
              const nutriments = prod.nutriments || {};
              
              const kcal = Number(nutriments['energy-kcal_100g']) || 0;
              const protein = Number(nutriments.proteins_100g) || 0;
              const fat = Number(nutriments.fat_100g) || 0;
              const carb = Number(nutriments.carbohydrates_100g) || 0;
              const fiber = Number(nutriments.fiber_100g) || 0;
              
              const foodName = prod.product_name || 'Unknown Branded Food';
              const foodBrand = prod.brands || 'Generic';
              const sourceIdStr = prod.code || barcode;

              // Check if it already exists locally
              const existing = await db
                .select()
                .from(foods)
                .where(and(eq(foods.source, 'off'), eq(foods.sourceId, sourceIdStr)))
                .limit(1);

              let targetFood;
              if (existing.length > 0) {
                targetFood = existing[0];
              } else {
                const [inserted] = await db.insert(foods).values({
                  source: 'off',
                  sourceId: sourceIdStr,
                  barcode,
                  name: foodName,
                  brand: foodBrand,
                  kcalPer100g: sql`${kcal}::numeric`,
                  proteinPer100g: sql`${protein}::numeric`,
                  fatPer100g: sql`${fat}::numeric`,
                  carbPer100g: sql`${carb}::numeric`,
                  fiberPer100g: sql`${fiber}::numeric`,
                  searchVector: sql`to_tsvector('english', ${foodName + ' ' + foodBrand})`,
                }).returning();

                targetFood = inserted;

                const servingsList = [{ label: '100g', grams: 100, isDefault: true }];
                const netWeightGrams = Number(prod.product_quantity) || 0;
                if (netWeightGrams > 0) {
                  servingsList.push({ label: `1 package (${netWeightGrams}g)`, grams: netWeightGrams, isDefault: false });
                }

                for (const s of servingsList) {
                  await db.insert(foodServings).values({
                    foodId: targetFood.id,
                    label: s.label,
                    grams: sql`${s.grams}::numeric`,
                    isDefault: s.isDefault,
                  }).onConflictDoNothing();
                }
              }

              foodsList = await db.select().from(foods).where(eq(foods.id, targetFood.id));
            }
          }
        } catch (err) {
          console.error('Failed to resolve barcode from Open Food Facts API:', err);
        }
      }
    } else if (q) {
      // Text search: ranked by personal count desc, then recency desc, then alphabetical
      const searchLike = `%${q}%`;
      const result = await db.execute(sql`
        select 
          f.id,
          f.source,
          f.source_id as "sourceId",
          f.barcode,
          f.name,
          f.brand,
          f.kcal_per_100g as "kcalPer100g",
          f.protein_per_100g as "proteinPer100g",
          f.fat_per_100g as "fatPer100g",
          f.carb_per_100g as "carbPer100g",
          f.fiber_per_100g as "fiberPer100g",
          f.owner_user_id as "ownerUserId",
          coalesce(log_stats.log_count, 0) as log_count,
          coalesce(log_stats.last_logged, '1970-01-01'::timestamptz) as last_logged
        from foods f
        left join (
          select food_id, count(*) as log_count, max(logged_at) as last_logged
          from entries
          where user_id = ${user.id}::uuid
          group by food_id
        ) log_stats on f.id = log_stats.food_id
        where 
          (f.name ilike ${searchLike} or f.brand ilike ${searchLike})
          and (f.owner_user_id is null or f.owner_user_id = ${user.id}::uuid)
        order by 
          log_count desc, 
          last_logged desc, 
          f.name asc
        limit 25
      `);
      foodsList = result.rows || [];

      // 2. Query USDA API for text search if fewer than 5 local results
      if (foodsList.length < 5) {
        console.log(`[USDA API] Querying search terms for text: "${q}"`);
        try {
          const encodedQuery = encodeURIComponent(q);
          const resUsda = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodedQuery}&pageSize=10`);
          if (resUsda.status !== 200) {
            const errText = await resUsda.text();
            throw new Error(`USDA API returned status ${resUsda.status}: ${errText}`);
          }
          const usdaPayload = await resUsda.json();
          const products = usdaPayload.foods || [];
          
          for (const prod of products) {
            const kcal = Number(prod.foodNutrients.find((n: any) => n.unitName === 'KCAL' || n.nutrientName.toLowerCase().includes('energy'))?.value) || 0;
            const protein = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase() === 'protein')?.value) || 0;
            const fat = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('lipid') || n.nutrientName.toLowerCase() === 'fat')?.value) || 0;
            const carb = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('carbohydrate'))?.value) || 0;
            const fiber = Number(prod.foodNutrients.find((n: any) => n.nutrientName.toLowerCase().includes('fiber') || n.nutrientName.toLowerCase().includes('fibre'))?.value) || 0;

            const foodName = prod.description || 'Unknown Food';
            const foodBrand = prod.brandName || prod.brandOwner || 'Generic';
            const sourceIdStr = String(prod.fdcId);

            // Check if it already exists locally
            const existing = await db
              .select()
              .from(foods)
              .where(and(eq(foods.source, 'usda'), eq(foods.sourceId, sourceIdStr)))
              .limit(1);

            let targetFood;
            if (existing.length > 0) {
              targetFood = existing[0];
            } else {
              const [inserted] = await db.insert(foods).values({
                source: 'usda',
                sourceId: sourceIdStr,
                barcode: prod.gtinUpc || null,
                name: foodName,
                brand: foodBrand,
                kcalPer100g: sql`${kcal}::numeric`,
                proteinPer100g: sql`${protein}::numeric`,
                fatPer100g: sql`${fat}::numeric`,
                carbPer100g: sql`${carb}::numeric`,
                fiberPer100g: sql`${fiber}::numeric`,
                searchVector: sql`to_tsvector('english', ${foodName + ' ' + foodBrand})`,
              }).returning();

              targetFood = inserted;

              const servingsList = [{ label: '100g', grams: 100, isDefault: true }];
              const servingGrams = Number(prod.servingSize) || 0;
              if (servingGrams > 0) {
                const label = prod.householdServingFullText ? `${prod.householdServingFullText} (${servingGrams}g)` : `1 serving (${servingGrams}g)`;
                servingsList.push({ label, grams: servingGrams, isDefault: false });
              }

              for (const s of servingsList) {
                await db.insert(foodServings).values({
                  foodId: targetFood.id,
                  label: s.label,
                  grams: sql`${s.grams}::numeric`,
                  isDefault: s.isDefault,
                }).onConflictDoNothing();
              }
            }

            // Only append if it's not already in the list
            if (!foodsList.some(f => f.id === targetFood.id)) {
              foodsList.push({
                id: targetFood.id,
                source: targetFood.source,
                sourceId: targetFood.sourceId,
                barcode: targetFood.barcode,
                name: targetFood.name,
                brand: targetFood.brand,
                kcalPer100g: String(kcal),
                proteinPer100g: String(protein),
                fatPer100g: String(fat),
                carbPer100g: String(carb),
                fiberPer100g: String(fiber),
                ownerUserId: null,
                log_count: 0,
                last_logged: '1970-01-01T00:00:00.000Z',
              });
            }
          }
        } catch (err: any) {
          console.error('Failed to fetch from USDA API text search:', err);
          throw new Error(`USDA API text search failed: ${err.message}`);
        }
      }

      // 4. Secondary fallback: Query Open Food Facts if still fewer than 5 results
      if (foodsList.length < 5) {
        console.log(`[OFF API] Querying search terms for text: "${q}"`);
        try {
          const encodedQuery = encodeURIComponent(q);
          const resOff = await fetch(`https://world.openfoodfacts.org/api/v2/search?search_terms=${encodedQuery}&fields=code,product_name,brands,nutriments,product_quantity&page_size=10`, {
            headers: {
              'User-Agent': 'GoTracker/1.0 (rishiraman212005@gmail.com)'
            }
          });
          if (resOff.status !== 200) {
            const errText = await resOff.text();
            throw new Error(`Open Food Facts API returned status ${resOff.status}: ${errText}`);
          }
          const offPayload = await resOff.json();
          const products = offPayload.products || [];
          
          for (const prod of products) {
            const nutriments = prod.nutriments || {};
            const kcal = Number(nutriments['energy-kcal_100g']) || 0;
            const protein = Number(nutriments.proteins_100g) || 0;
            const fat = Number(nutriments.fat_100g) || 0;
            const carb = Number(nutriments.carbohydrates_100g) || 0;
            const fiber = Number(nutriments.fiber_100g) || 0;

            const foodName = prod.product_name || 'Unknown Branded Food';
            const foodBrand = prod.brands || 'Generic';
            const sourceIdStr = prod.code || Math.random().toString(36).substring(7);

            // Check if it already exists locally
            const existing = await db
              .select()
              .from(foods)
              .where(and(eq(foods.source, 'off'), eq(foods.sourceId, sourceIdStr)))
              .limit(1);

            let targetFood;
            if (existing.length > 0) {
              targetFood = existing[0];
            } else {
              const [inserted] = await db.insert(foods).values({
                source: 'off',
                sourceId: sourceIdStr,
                barcode: prod.code || null,
                name: foodName,
                brand: foodBrand,
                kcalPer100g: sql`${kcal}::numeric`,
                proteinPer100g: sql`${protein}::numeric`,
                fatPer100g: sql`${fat}::numeric`,
                carbPer100g: sql`${carb}::numeric`,
                fiberPer100g: sql`${fiber}::numeric`,
                searchVector: sql`to_tsvector('english', ${foodName + ' ' + foodBrand})`,
              }).returning();

              targetFood = inserted;

              const servingsList = [{ label: '100g', grams: 100, isDefault: true }];
              const netWeightGrams = Number(prod.product_quantity) || 0;
              if (netWeightGrams > 0) {
                servingsList.push({ label: `1 package (${netWeightGrams}g)`, grams: netWeightGrams, isDefault: false });
              }

              for (const s of servingsList) {
                await db.insert(foodServings).values({
                  foodId: targetFood.id,
                  label: s.label,
                  grams: sql`${s.grams}::numeric`,
                  isDefault: s.isDefault,
                }).onConflictDoNothing();
              }
            }

            // Only append if it's not already in the list
            if (!foodsList.some(f => f.id === targetFood.id)) {
              foodsList.push({
                id: targetFood.id,
                source: targetFood.source,
                sourceId: targetFood.sourceId,
                barcode: targetFood.barcode,
                name: targetFood.name,
                brand: targetFood.brand,
                kcalPer100g: String(kcal),
                proteinPer100g: String(protein),
                fatPer100g: String(fat),
                carbPer100g: String(carb),
                fiberPer100g: String(fiber),
                ownerUserId: null,
                log_count: 0,
                last_logged: '1970-01-01T00:00:00.000Z',
              });
            }
          }
        } catch (err: any) {
          console.error('Failed to fetch from Open Food Facts API text search:', err);
          throw new Error(`Open Food Facts API text search failed: ${err.message}`);
        }
      }
    } else {
      // Empty query state: return user's recently logged foods
      const result = await db.execute(sql`
        select 
          f.id,
          f.source,
          f.source_id as "sourceId",
          f.barcode,
          f.name,
          f.brand,
          f.kcal_per_100g as "kcalPer100g",
          f.protein_per_100g as "proteinPer100g",
          f.fat_per_100g as "fatPer100g",
          f.carb_per_100g as "carbPer100g",
          f.fiber_per_100g as "fiberPer100g",
          f.owner_user_id as "ownerUserId",
          coalesce(log_stats.log_count, 0) as log_count,
          coalesce(log_stats.last_logged, '1970-01-01'::timestamptz) as last_logged
        from foods f
        inner join (
          select food_id, count(*) as log_count, max(logged_at) as last_logged
          from entries
          where user_id = ${user.id}::uuid
          group by food_id
        ) log_stats on f.id = log_stats.food_id
        order by last_logged desc
        limit 25
      `);
      foodsList = result.rows || [];
    }

    // Attach food servings to each match
    if (foodsList.length > 0) {
      const foodIds = foodsList.map(f => f.id);
      const servings = await db
        .select()
        .from(foodServings)
        .where(inArray(foodServings.foodId, foodIds));

      foodsList = foodsList.map(f => ({
        ...f,
        servings: servings
          .filter(s => s.foodId === f.id)
          .map(s => ({
            id: s.id,
            foodId: s.foodId,
            label: s.label,
            grams: Number(s.grams),
            isDefault: s.isDefault
          }))
      }));
    }

    return c.json(foodsList);
  } catch (err: any) {
    console.error('Error searching foods:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 4. Get Logged Entries for Date
app.get('/api/entries', async (c) => {
  try {
    const user = await getAuthUser(c);
    const dateParam = c.req.query('date') || new Date().toISOString().split('T')[0];

    const entriesList = await rlsTransaction(user.id, async (tx) => {
      const rows = await tx
        .select({
          id: entries.id,
          foodId: entries.foodId,
          loggedFor: entries.loggedFor,
          meal: entries.meal,
          grams: entries.grams,
          kcal: entries.kcal,
          proteinG: entries.proteinG,
          fatG: entries.fatG,
          carbG: entries.carbG,
          clientId: entries.clientId,
          loggedAt: entries.loggedAt,
          foodName: foods.name,
          foodBrand: foods.brand,
        })
        .from(entries)
        .innerJoin(foods, eq(entries.foodId, foods.id))
        .where(and(eq(entries.userId, user.id), eq(entries.loggedFor, dateParam)))
        .orderBy(desc(entries.loggedAt));
      
      return rows;
    });

    return c.json(entriesList);
  } catch (err: any) {
    console.error('Error fetching entries:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 5. Create Food Entry (Idempotency Enforced)
app.post('/api/entries', async (c) => {
  try {
    const user = await getAuthUser(c);
    const body = await c.req.json();

    const {
      foodId,
      loggedFor,
      meal,
      grams,
      kcal,
      proteinG,
      fatG,
      carbG,
      clientId,
    } = body;

    const entryRecord = await rlsTransaction(user.id, async (tx) => {
      const inserted = await tx
        .insert(entries)
        .values({
          userId: user.id,
          foodId,
          loggedFor,
          meal,
          grams: sql`${grams}::numeric`,
          kcal: sql`${kcal}::numeric`,
          proteinG: proteinG ? sql`${proteinG}::numeric` : null,
          fatG: fatG ? sql`${fatG}::numeric` : null,
          carbG: carbG ? sql`${carbG}::numeric` : null,
          clientId,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        // Entry already created, query and return the existing one for idempotency
        const existing = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.userId, user.id), eq(entries.clientId, clientId)))
          .limit(1);
        return existing[0];
      }

      return inserted[0];
    });

    return c.json(entryRecord);
  } catch (err: any) {
    console.error('Error logging food entry:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 6. Delete Food Entry
app.delete('/api/entries/:id', async (c) => {
  try {
    const user = await getAuthUser(c);
    const entryId = c.req.param('id');

    await rlsTransaction(user.id, async (tx) => {
      await tx
        .delete(entries)
        .where(and(eq(entries.id, entryId), eq(entries.userId, user.id)));
    });

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting entry:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 8. Get Weight History
app.get('/api/weight/history', async (c) => {
  try {
    const user = await getAuthUser(c);
    const history = await rlsTransaction(user.id, async (tx) => {
      return await tx
        .select({
          id: bodyMetrics.id,
          date: bodyMetrics.measuredOn,
          weightKg: bodyMetrics.weightKg,
          bodyFatPct: bodyMetrics.bodyFatPct,
          source: bodyMetrics.source,
          createdAt: bodyMetrics.createdAt,
        })
        .from(bodyMetrics)
        .where(eq(bodyMetrics.userId, user.id))
        .orderBy(desc(bodyMetrics.measuredOn));
    });
    return c.json(history);
  } catch (err: any) {
    console.error('Error fetching weight history:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 8.5. Get Coaching Insights
app.get('/api/coaching/insights', async (c) => {
  try {
    const user = await getAuthUser(c);

    // Fetch latest target
    const latestTarget = await rlsTransaction(user.id, async (tx) => {
      const rows = await tx
        .select()
        .from(targets)
        .where(eq(targets.userId, user.id))
        .orderBy(desc(targets.createdAt))
        .limit(1);
      return rows[0] || null;
    });

    if (!latestTarget) {
      return c.json({ error: 'No target profile found. Please onboard first.' }, 400);
    }

    // Fetch weight history
    const weights = await rlsTransaction(user.id, async (tx) => {
      return await tx
        .select()
        .from(bodyMetrics)
        .where(eq(bodyMetrics.userId, user.id))
        .orderBy(desc(bodyMetrics.measuredOn));
    });
    const weightHistory = weights.map((w: any) => ({
      date: w.measuredOn,
      weightKg: Number(w.weightKg),
    }));

    // Fetch daily food logs
    const foodLogs = await rlsTransaction(user.id, async (tx) => {
      const rows = await tx.execute(sql`
        select logged_for as date, sum(kcal) as "kcalLogged"
        from entries
        where user_id = ${user.id}::uuid
        group by logged_for
      `);
      return rows.rows || [];
    });
    const foodHistory = foodLogs.map((r: any) => ({
      date: r.date,
      kcalLogged: Number(r.kcalLogged),
    }));

    const bmrKcal = Number(latestTarget.bmrKcal) || 1500;
    const currentWeightKg = weightHistory[0] ? Number(weightHistory[0].weightKg) : Number(user.heightCm) - 100;

    // Run calibration algorithm (Algorithm M1)
    const calibration = calibrateTDEE({
      sex: user.sexAtBirth || 'female',
      weightHistory,
      foodHistory,
      bmrKcal,
      goal: 'cut', // assume cut goal from registered setup
      rateWeeklyPct: 0.5,
      currentWeightKg,
    });

    // Generate smoothed weight trend
    const trendPoints = calculateWeightTrends(weightHistory);

    // Calculate weight change over trailing 14 days (or whatever trends we have)
    let weightChangeKg = 0;
    let averageLoggedKcal = bmrKcal * 1.55;

    if (trendPoints.length >= 2) {
      const sortedTrends = [...trendPoints].sort((a, b) => b.date.localeCompare(a.date)); // desc
      const endTrend = sortedTrends[0].trendKg;
      const endDate = new Date(sortedTrends[0].date);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 13);
      const startDateStr = startDate.toISOString().split('T')[0];
      const startTrendPoint = sortedTrends.find(p => p.date <= startDateStr) || sortedTrends[sortedTrends.length - 1];
      const startTrend = startTrendPoint.trendKg;
      weightChangeKg = endTrend - startTrend;

      const windowFood = foodHistory.filter((f: { date: string; kcalLogged: number }) => f.date >= startDateStr && f.date <= sortedTrends[0].date);
      const totalKcal = windowFood.reduce((sum: number, curr: { date: string; kcalLogged: number }) => sum + curr.kcalLogged, 0);
      averageLoggedKcal = windowFood.length > 0 ? totalKcal / windowFood.length : bmrKcal * 1.55;
    }

    return c.json({
      bmrKcal,
      calibratedTdee: calibration.calibratedTdee,
      dailyCalorieBudget: calibration.dailyCalorieBudget,
      basis: calibration.basis,
      rationale: calibration.rationale,
      weightChangeKg: Number(weightChangeKg.toFixed(2)),
      averageLoggedKcal: Math.round(averageLoggedKcal),
      isClampedToKcalFloor: calibration.isClampedToKcalFloor,
      isClampedToBmrFloor: calibration.isClampedToBmrFloor,
      trendPoints: trendPoints.slice(-30), // last 30 points
      foodHistory: foodHistory.slice(-14), // last 14 days
    });
  } catch (err: any) {
    console.error('Error fetching coaching insights:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 9. Create/Upsert Weight Entry
app.post('/api/weight', async (c) => {
  try {
    const user = await getAuthUser(c);
    const body = await c.req.json();
    const { weightKg, date, bodyFatPct } = body;

    const entry = await rlsTransaction(user.id, async (tx) => {
      const inserted = await tx
        .insert(bodyMetrics)
        .values({
          userId: user.id,
          measuredOn: date,
          weightKg: sql`${weightKg}::numeric`,
          bodyFatPct: bodyFatPct ? sql`${bodyFatPct}::numeric` : null,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [bodyMetrics.userId, bodyMetrics.measuredOn, bodyMetrics.source],
          set: {
            weightKg: sql`${weightKg}::numeric`,
            bodyFatPct: bodyFatPct ? sql`${bodyFatPct}::numeric` : null,
          }
        })
        .returning();
      return inserted[0];
    });
    return c.json(entry);
  } catch (err: any) {
    console.error('Error logging weight:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 10. Delete Weight Entry
app.delete('/api/weight/:id', async (c) => {
  try {
    const user = await getAuthUser(c);
    const weightId = c.req.param('id');

    await rlsTransaction(user.id, async (tx) => {
      await tx
        .delete(bodyMetrics)
        .where(and(eq(bodyMetrics.id, weightId), eq(bodyMetrics.userId, user.id)));
    });

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting weight entry:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 11. Update User Settings (Metric / Imperial Unit System toggle)
app.post('/api/user/settings', async (c) => {
  try {
    const user = await getAuthUser(c);
    const body = await c.req.json();
    const { units } = body;

    if (units !== 'metric' && units !== 'imperial') {
      return c.json({ error: 'Invalid unit selection. Use metric or imperial.' }, 400);
    }

    const updated = await db
      .update(users)
      .set({ units })
      .where(eq(users.id, user.id))
      .returning();

    return c.json({ success: true, user: updated[0] });
  } catch (err: any) {
    console.error('Error updating settings:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 12. Export User Data (Nested JSON including all logs)
app.get('/api/user/export', async (c) => {
  try {
    const user = await getAuthUser(c);
    
    // Fetch all logs in parallel under the user's RLS context
    const data = await rlsTransaction(user.id, async (tx) => {
      const userTargets = await tx
        .select()
        .from(targets)
        .where(eq(targets.userId, user.id))
        .orderBy(desc(targets.createdAt));

      const userMetrics = await tx
        .select()
        .from(bodyMetrics)
        .where(eq(bodyMetrics.userId, user.id))
        .orderBy(desc(bodyMetrics.measuredOn));

      const userEntries = await tx
        .select({
          id: entries.id,
          loggedFor: entries.loggedFor,
          meal: entries.meal,
          grams: entries.grams,
          kcal: entries.kcal,
          proteinG: entries.proteinG,
          fatG: entries.fatG,
          carbG: entries.carbG,
          foodName: foods.name,
          foodBrand: foods.brand,
          clientId: entries.clientId,
          loggedAt: entries.loggedAt,
        })
        .from(entries)
        .innerJoin(foods, eq(entries.foodId, foods.id))
        .where(eq(entries.userId, user.id))
        .orderBy(desc(entries.loggedAt));

      return {
        user: {
          email: user.email,
          displayName: user.displayName,
          sexAtBirth: user.sexAtBirth,
          birthDate: user.birthDate,
          heightCm: user.heightCm,
          units: user.units,
          timezone: user.timezone,
          createdAt: user.createdAt,
        },
        targets: userTargets,
        bodyMetrics: userMetrics,
        entries: userEntries,
      };
    });

    return c.json(data);
  } catch (err: any) {
    console.error('Error exporting data:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// 7. Delete User Account (Soft delete as per §9)
app.post('/api/user/delete', async (c) => {
  try {
    const authSubject = await getAuthSubject(c);

    // Find the user
    const matchedUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.authSubject, authSubject), sql`users.deleted_at is null`))
      .limit(1);

    if (matchedUsers.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = matchedUsers[0];

    // Perform soft delete
    await db.update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.id));

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Error soft-deleting account:', err.message);
    return c.json({ error: err.message }, err.message.includes('Unauthorized') ? 401 : 500);
  }
});

// Start the server
const port = 3000;
console.log(`Starting Hono server on port ${port}...`);
serve({
  fetch: app.fetch,
  port,
});
