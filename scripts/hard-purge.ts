import { db } from '../src/server/db';
import { users } from '../src/db/schema';
import { sql, lt, and, isNotNull } from 'drizzle-orm';

/**
 * Hard-purges all user accounts (and cascade tables) soft-deleted more than 30 days ago.
 */
export async function runHardPurge() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(`[Purge] Running hard-purge routine for accounts soft-deleted before ${thirtyDaysAgo.toISOString()}...`);

  const purged = await db
    .delete(users)
    .where(
      and(
        isNotNull(users.deletedAt),
        lt(users.deletedAt, thirtyDaysAgo)
      )
    )
    .returning();

  console.log(`[Purge] Permanent purge complete. Removed ${purged.length} accounts from database.`);
  return purged;
}

if (require.main === module) {
  runHardPurge()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Purge] Failed to run hard purge:', err);
      process.exit(1);
    });
}
