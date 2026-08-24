import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import communicationRetentionConfig from '@config/communication-retention.config';
import voiceRetentionConfig from '@config/voice-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { createDocumentStoragePortMock } from '@modules/documents/storage/testing/document-storage-port.mock';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';
import { CommunicationRetentionService } from './communication-retention.service';
import { CommunicationRetentionMetrics } from './communication-retention.metrics';
import {
  COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY,
  COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE,
  COMMUNICATION_RETENTION_PURGE_RUN_STATUS,
  COMMUNICATION_RETENTION_RUN_SKIP_REASON,
} from './communication-retention.constants';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

class MemoryRedisLock {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private purge(key: string) {
    const row = this.store.get(key);
    if (row && Date.now() >= row.expiresAt) this.store.delete(key);
  }

  async set(key: string, value: string, mode: string, px: number, nx?: string): Promise<'OK' | null> {
    this.purge(key);
    if (nx === 'NX' && this.store.has(key)) return null;
    void mode;
    this.store.set(key, { value, expiresAt: Date.now() + px });
    return 'OK';
  }

  async eval(script: string, _numKeys: number, key: string, ...args: string[]): Promise<number> {
    if (script === RELEASE_SCRIPT) {
      const token = args[0];
      const row = this.store.get(key);
      if (row?.value === token) {
        this.store.delete(key);
        return 1;
      }
      return 0;
    }
    if (script === EXTEND_SCRIPT) {
      const token = args[0];
      const ttlMs = parseInt(args[1] ?? '0', 10);
      const row = this.store.get(key);
      if (row?.value === token) {
        row.expiresAt = Date.now() + ttlMs;
        return 1;
      }
      return 0;
    }
    return 0;
  }

  expireLock(key: string): void {
    this.store.delete(key);
  }
}

describe('CommunicationRetentionService distributed lock (C13.1)', () => {
  const redis = new MemoryRedisLock();
  const lockService = new RedisDistributedLockService(redis as never);
  const prisma = {
    communicationRetentionPurgeRun: {
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
  } as unknown as PrismaService;

  async function createService() {
    process.env.COMMUNICATION_RETENTION_ENABLED = 'true';
    process.env.COMMUNICATION_RETENTION_DRY_RUN = 'true';
    const voiceRetentionMock = {
      countEligibleForPurge: jest.fn().mockResolvedValue({ transcripts: 0, summaries: 0, webhookPayloads: 0 }),
      purgeOrganization: jest.fn().mockResolvedValue({ transcriptsCleared: 0, summariesCleared: 0, webhookPayloadsCleared: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [communicationRetentionConfig, voiceRetentionConfig],
        }),
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisDistributedLockService, useValue: lockService },
        { provide: DOCUMENTS_STORAGE, useValue: createDocumentStoragePortMock() },
        { provide: VoiceRetentionService, useValue: voiceRetentionMock },
        CommunicationRetentionMetrics,
        CommunicationRetentionService,
      ],
    }).compile();
    return moduleRef.get(CommunicationRetentionService);
  }

  beforeEach(() => {
    redis['store'].clear();
    jest.clearAllMocks();
    jest.useRealTimers();
    delete process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS;
    delete process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS;
    (prisma.communicationRetentionPurgeRun.create as jest.Mock).mockResolvedValue({ id: 'run-1' });
    (prisma.communicationRetentionPurgeRun.update as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.COMMUNICATION_RETENTION_ENABLED;
    delete process.env.COMMUNICATION_RETENTION_DRY_RUN;
    delete process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS;
    delete process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS;
    jest.useRealTimers();
  });

  it('allows only one global destructive run when two service instances compete for the lock', async () => {
    const serviceA = await createService();
    const serviceB = await createService();

    const first = await lockService.acquire(COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY, 60_000);
    expect(first.acquired).toBe(true);

    const blocked = await serviceB.runOnce({ trigger: 'cron', dryRun: true });
    expect(blocked.skipped).toBe(true);
    expect(blocked.skipReason).toBe(COMMUNICATION_RETENTION_RUN_SKIP_REASON.LOCK_CONTENTED);
    expect(prisma.communicationRetentionPurgeRun.create).not.toHaveBeenCalled();

    if (first.acquired) {
      await lockService.release(first.handle);
    }

    const allowed = await serviceA.runOnce({ trigger: 'cron', dryRun: true });
    expect(allowed.skipped).toBeFalsy();
    expect(prisma.communicationRetentionPurgeRun.create).toHaveBeenCalled();
  });

  it('does not require global lock for org-scoped manual runs', async () => {
    const service = await createService();
    await lockService.acquire(COMMUNICATION_RETENTION_GLOBAL_LOCK_KEY, 60_000);

    const orgRun = await service.runOnce({
      organizationId: 'org-1',
      trigger: 'manual',
      dryRun: true,
    });
    expect(orgRun.skipped).toBeFalsy();
    expect(prisma.communicationRetentionPurgeRun.create).toHaveBeenCalled();
  });

  it('extends global lock heartbeat so a second instance stays blocked past the original TTL', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS = '300';
    process.env.COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS = '100';

    const serviceA = await createService();
    const serviceB = await createService();
    const extendSpy = jest.spyOn(lockService, 'extend');

    let resolveFindMany!: (value: { id: string }[]) => void;
    const findManyPromise = new Promise<{ id: string }[]>((resolve) => {
      resolveFindMany = resolve;
    });
    (prisma.organization.findMany as jest.Mock).mockReturnValue(findManyPromise);

    const runPromise = serviceA.runOnce({ trigger: 'cron', dryRun: true });
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(350);

    const blocked = await serviceB.runOnce({ trigger: 'cron', dryRun: true });
    expect(blocked.skipped).toBe(true);
    expect(blocked.skipReason).toBe(COMMUNICATION_RETENTION_RUN_SKIP_REASON.LOCK_CONTENTED);
    expect(extendSpy.mock.calls.length).toBeGreaterThan(0);

    resolveFindMany([{ id: 'org-1' }]);
    await jest.advanceTimersByTimeAsync(0);
    const report = await runPromise;
    expect(report.skipped).toBeFalsy();
  }, 15_000);

  it('aborts safely when global lock extension fails during a multi-organization run', async () => {
    const service = await createService();
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);

    let extendCount = 0;
    const extendSpy = jest.spyOn(lockService, 'extend');
    extendSpy.mockImplementation(async () => {
      extendCount += 1;
      if (extendCount >= 7) return false;
      return true;
    });

    const report = await service.runOnce({ trigger: 'cron', dryRun: true });

    expect(report.aborted).toBe(true);
    expect(report.errorCode).toBe(COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST);
    expect(report.organizationsProcessed).toBeLessThan(2);
    expect(prisma.communicationRetentionPurgeRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: COMMUNICATION_RETENTION_PURGE_RUN_STATUS.ABORTED,
        }),
      }),
    );
    const persistedReport = (prisma.communicationRetentionPurgeRun.update as jest.Mock).mock.calls.find(
      (call) => call[0]?.data?.status === COMMUNICATION_RETENTION_PURGE_RUN_STATUS.ABORTED,
    )?.[0]?.data?.report;
    expect(persistedReport?.errorCode).toBe(COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST);
    expect(JSON.stringify(persistedReport)).not.toMatch(/redis|Redis/i);
  });
});
