import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods, foodServings } from '../src/db/schema';
import { SEED_FOODS } from '../src/db/seeds/foods';
import { sql } from 'drizzle-orm';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

const db = drizzle(pool);

async function run() {
  console.log('Seeding foods & servings into database...');

  for (const food of SEED_FOODS) {
    console.log(`Inserting food: ${food.name}...`);
    
    // Convert to tsvector search vector: name and brand
    const searchTerms = `${food.name} ${food.brand || ''}`.trim();
    
    const [insertedFood] = await db
      .insert(foods)
      .values({
        id: food.id,
        source: food.source,
        sourceId: food.sourceId,
        barcode: food.barcode,
        name: food.name,
        brand: food.brand,
        kcalPer100g: sql`${food.kcalPer100g}::numeric`,
        proteinPer100g: sql`${food.proteinPer100g}::numeric`,
        fatPer100g: sql`${food.fatPer100g}::numeric`,
        carbPer100g: sql`${food.carbPer100g}::numeric`,
        fiberPer100g: sql`${food.fiberPer100g}::numeric`,
        searchVector: sql`to_tsvector('english', ${searchTerms})`,
      })
      .onConflictDoUpdate({
        target: [foods.source, foods.sourceId],
        set: {
          barcode: food.barcode,
          name: food.name,
          brand: food.brand,
          kcalPer100g: sql`${food.kcalPer100g}::numeric`,
          proteinPer100g: sql`${food.proteinPer100g}::numeric`,
          fatPer100g: sql`${food.fatPer100g}::numeric`,
          carbPer100g: sql`${food.carbPer100g}::numeric`,
          fiberPer100g: sql`${food.fiberPer100g}::numeric`,
          searchVector: sql`to_tsvector('english', ${searchTerms})`,
        }
      })
      .returning();

    // Insert servings
    for (const serving of food.servings) {
      await db
        .insert(foodServings)
        .values({
          foodId: insertedFood.id,
          label: serving.label,
          grams: sql`${serving.grams}::numeric`,
          isDefault: serving.isDefault,
        })
        .onConflictDoNothing(); // ignore if already seeded
    }
  }

  console.log('Seeding completed successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
