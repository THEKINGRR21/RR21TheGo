import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import path from 'path';
import { foods, foodServings } from '../src/db/schema';
import { SEED_FOODS } from '../src/db/seeds/foods';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

const db = drizzle(pool);

async function run() {
  console.log('Enabling citext extension...');
  // Enable the citext extension required by the email column
  await db.execute(sql`create extension if not exists citext;`);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  console.log('Migrations complete!');

  console.log('Checking food database counts...');
  const countRes = await db.execute(sql`select count(*)::int as count from foods`);
  const count = countRes.rows[0]?.count || 0;
  
  if (count === 0) {
    console.log('Food database is empty. Seeding standard foods...');
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
          .onConflictDoNothing();
      }
    }
    console.log('Food seeding completed successfully!');
  } else {
    console.log(`Foods table already has ${count} records. Skipping seeding.`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
