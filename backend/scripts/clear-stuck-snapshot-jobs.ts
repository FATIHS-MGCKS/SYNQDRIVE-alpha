/**
 * One-shot maintenance: remove failed jobs from the BullMQ
 * `dimo.snapshot.poll` queue so that future scheduler enqueues
 * are no longer blocked by jobId deduplication.
 *
 * Safe to run any time: it only touches jobs in state `failed` and
 * ignores active / waiting / completed jobs.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/clear-stuck-snapshot-jobs.ts
 */
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const queue = new Queue('dimo.snapshot.poll', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  });

  try {
    const failedBefore = await queue.getJobs(['failed'], 0, 1000);
    console.log(`[clear-stuck] Found ${failedBefore.length} failed jobs`);
    for (const j of failedBefore) {
      console.log(
        `  - ${j.id}  attempts=${j.attemptsMade}  reason="${(j.failedReason ?? '').slice(0, 120)}"`,
      );
    }

    // Remove every failed job regardless of age (0 = age threshold in ms).
    const removed = await queue.clean(0, 1000, 'failed');
    console.log(`[clear-stuck] Removed ${removed.length} failed jobs`);

    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
      'paused',
    );
    console.log('[clear-stuck] New queue counts:');
    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await queue.close();
  }
}

main().catch((err) => {
  console.error('[clear-stuck] Failed:', err);
  process.exit(1);
});
