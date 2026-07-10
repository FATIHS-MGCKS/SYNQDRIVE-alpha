import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { buildExtractionJobId, buildExtractionJobOptions } from '@modules/document-extraction/document-extraction-queue.util';

const LIVE = process.env.DOCUMENT_EXTRACTION_LIVE_INTEGRATION === '1';

const liveDocConfig = {
  jobAttempts: 4,
  jobBackoffMs: 5_000,
} as Parameters<typeof buildExtractionJobOptions>[0];

function redisConnection() {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password, maxRetriesPerRequest: null as null };
}

async function probeRedis(): Promise<boolean> {
  const client = new IORedis({ ...redisConnection(), connectTimeout: 3_000, lazyConnect: true });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)('Document extraction live integration (Redis/DB)', () => {
  let redisOk = false;
  let dbOk = false;

  beforeAll(async () => {
    redisOk = await probeRedis();
    dbOk = await probeDatabase();
    if (!redisOk) {
      console.warn('[live-integration] Redis unreachable — run: npm run infra:up');
    }
    if (!dbOk) {
      console.warn('[live-integration] DATABASE_URL unreachable or unset');
    }
  }, 30_000);

  it('connects to Redis', () => {
    expect(redisOk).toBe(true);
  });

  it('connects to PostgreSQL when DATABASE_URL is set', () => {
    if (!process.env.DATABASE_URL) {
      expect(dbOk).toBe(false);
      return;
    }
    expect(dbOk).toBe(true);
  });

  it('roundtrips a BullMQ document.extraction job', async () => {
    expect(redisOk).toBe(true);
    const connection = redisConnection();
    const queue = new Queue(QUEUE_NAMES.DOCUMENT_EXTRACTION, { connection });
    const extractionId = `live-${Date.now()}`;
    const jobId = buildExtractionJobId(extractionId);

    try {
      const existing = await queue.getJob(jobId);
      if (existing) await existing.remove();

      const job = await queue.add(
        'extract',
        { extractionId, vehicleId: 'live-vehicle' },
        buildExtractionJobOptions(liveDocConfig, extractionId),
      );

      expect(job.id).toBe(jobId);
      const fetched = await queue.getJob(jobId);
      expect(fetched?.data).toMatchObject({ extractionId, vehicleId: 'live-vehicle' });
      await fetched?.remove();
    } finally {
      await queue.close();
    }
  }, 20_000);
});
