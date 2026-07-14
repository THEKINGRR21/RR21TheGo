import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

export const db = drizzle(pool, { schema });

/**
 * Wrapper for database transactions that enforces Row-Level Security
 * by setting the transaction-local app.current_user_id variable.
 */
export async function rlsTransaction<T>(
  userId: string,
  callback: (tx: any) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set the session variable for RLS using set_config which supports parameterization
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return await callback(tx);
  });
}
export { pool };
