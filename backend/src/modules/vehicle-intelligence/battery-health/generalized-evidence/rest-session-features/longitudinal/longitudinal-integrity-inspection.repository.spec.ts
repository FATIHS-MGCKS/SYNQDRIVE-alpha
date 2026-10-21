import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import { D4InspectionDbRoundTripBudget } from './longitudinal-integrity-inspection.db-round-trips';
import { LongitudinalIntegrityInspectionRepository } from './longitudinal-integrity-inspection.repository';
import type { PrismaService } from '@shared/database/prisma.service';

function mockTx() {
  return {
    batteryLongitudinalProfileRevision: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'rev-1',
      } as BatteryLongitudinalProfileRevision),
    },
    batteryRestSessionFeature: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('LongitudinalIntegrityInspectionRepository (D4 round trips)', () => {
  it('loadInspectionBatch stays within DB round trip bound with mocked tx', async () => {
    const tx = mockTx();
    const db = {
      $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const repo = new LongitudinalIntegrityInspectionRepository(db);
    const loaded = await repo.loadInspectionBatch({
      request: {
        organizationId: '11111111-1111-1111-1111-111111111111',
        vehicleId: '22222222-2222-2222-2222-222222222222',
        revisionId: 'rev-1',
      },
      sessionKeys: [
        {
          organizationId: '11111111-1111-1111-1111-111111111111',
          vehicleId: '22222222-2222-2222-2222-222222222222',
          restSessionId: 's1',
          featureModelVersion: 'fm-v1',
          retentionPolicyVersion: 'ret-v1',
          chargeOpportunityPolicyVersion: 'chg-v1',
          canonicalFeatureRowId: 'row-s1',
        },
      ],
      referencedRowIds: ['row-s1'],
    });
    expect(loaded?.snapshot.revision.id).toBe('rev-1');
    expect(loaded?.dbRoundTrips).toBeLessThanOrEqual(4);
    expect(tx.batteryRestSessionFeature.findMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('readSourceEvidenceBatchInTransaction skips DB increments when no keys or ids', async () => {
    const tx = mockTx();
    const repo = new LongitudinalIntegrityInspectionRepository({} as PrismaService);
    const budget = new D4InspectionDbRoundTripBudget();
    await repo.readSourceEvidenceBatchInTransaction(
      tx as never,
      {
        request: {
          organizationId: '11111111-1111-1111-1111-111111111111',
          vehicleId: '22222222-2222-2222-2222-222222222222',
          revisionId: 'rev-1',
        },
        sessionKeys: [],
        referencedRowIds: [],
      },
      budget,
    );
    expect(budget.getCount()).toBe(0);
    expect(tx.batteryRestSessionFeature.findMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
