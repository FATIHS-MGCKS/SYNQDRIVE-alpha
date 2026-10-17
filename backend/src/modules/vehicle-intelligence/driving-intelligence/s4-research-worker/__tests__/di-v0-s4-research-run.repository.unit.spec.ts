import { Prisma } from '@prisma/client';
import { DiV0S4ResearchRunRepository } from '../di-v0-s4-research-run.repository';

describe('DiV0S4ResearchRunRepository.insertRun', () => {
  it('treats unique idempotency index violation as duplicate', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2010',
          clientVersion: 'test',
          meta: { code: '23505', message: 'duplicate key di_v0_s4_research_runs_idempotency_uq' },
        }),
      ),
    };
    const repo = new DiV0S4ResearchRunRepository(prisma as never);
    const res = await repo.insertRun({
      organizationId: 'o',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      combinedInputIdentity: 'c',
      pinnedSnapshotHash: 'p',
      researchIntentKey: 'intent',
      result: {
        kind: 'NEUTRAL',
        id: 'r1',
        researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmContextKey: 'k',
        osmSnapshotSha256: null,
        summaryJson: {},
        windowsJson: [],
      },
    });
    expect(res).toEqual({ outcome: 'idempotent_duplicate' });
  });

  it('surfaces other SQL errors', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockRejectedValue(new Error('CHECK constraint failed')),
    };
    const repo = new DiV0S4ResearchRunRepository(prisma as never);
    const res = await repo.insertRun({
      organizationId: 'o',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      combinedInputIdentity: 'c',
      pinnedSnapshotHash: 'p',
      researchIntentKey: 'intent',
      result: {
        kind: 'NEUTRAL',
        id: 'r1',
        researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmContextKey: null,
        osmSnapshotSha256: null,
        summaryJson: {},
        windowsJson: [],
      },
    });
    expect(res.outcome).toBe('sql_error');
  });
});
