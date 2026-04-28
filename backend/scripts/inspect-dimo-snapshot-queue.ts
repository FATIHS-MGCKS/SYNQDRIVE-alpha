/**
 * Diagnostic: inspect BullMQ "dimo.snapshot.poll" queue state.
 *
 * Prints:
 *   - Overall queue counts (waiting / active / delayed / failed / completed)
 *   - All FAILED jobs with their jobId and failedReason
 *   - Active and waiting jobIds
 *
 * Helpful when per-vehicle snapshots stop firing even though the scheduler
 * is still running: a failed job pinned at jobId=`snapshot-<vehicleId>`
 * silently deduplicates all future queue.add calls for that vehicle.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/inspect-dimo-snapshot-queue.ts
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
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
      'paused',
    );
    console.log('\n=== dimo.snapshot.poll — counts ===');
    console.log(JSON.stringify(counts, null, 2));

    const failed = await queue.getJobs(['failed'], 0, 500);
    console.log(`\n=== FAILED jobs (${failed.length}) ===`);
    for (const j of failed) {
      console.log(
        `  jobId=${j.id}  attemptsMade=${j.attemptsMade}  failedReason="${(j.failedReason ?? '').slice(0, 180)}"  finishedOn=${j.finishedOn ? new Date(j.finishedOn).toISOString() : '—'}`,
      );
    }

    const waiting = await queue.getJobs(['waiting'], 0, 50);
    console.log(`\n=== WAITING jobs (${waiting.length}) ===`);
    for (const j of waiting) {
      console.log(`  jobId=${j.id}  name=${j.name}`);
    }

    const active = await queue.getJobs(['active'], 0, 50);
    console.log(`\n=== ACTIVE jobs (${active.length}) ===`);
    for (const j of active) {
      console.log(
        `  jobId=${j.id}  name=${j.name}  processedOn=${j.processedOn ? new Date(j.processedOn).toISOString() : '—'}`,
      );
    }

    const delayed = await queue.getJobs(['delayed'], 0, 100);
    console.log(`\n=== DELAYED jobs (${delayed.length}) ===`);
    for (const j of delayed) {
      console.log(
        `  jobId=${j.id}  delay=${j.opts?.delay}ms  attemptsMade=${j.attemptsMade}`,
      );
    }
  } finally {
    await queue.close();
  }
}

main().catch((err) => {
  console.error('[inspect-queue] Failed:', err);
  process.exit(1);
});
