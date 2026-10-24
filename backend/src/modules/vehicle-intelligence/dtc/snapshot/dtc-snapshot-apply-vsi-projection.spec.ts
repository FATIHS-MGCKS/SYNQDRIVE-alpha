import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { buildPollSignalsLatestProposal } from './dtc-snapshot-proposal.builder';

describe('DtcSnapshotApplyService VSI projection hook', () => {
  const binding = {
    provider: 'DIMO' as const,
    providerBindingId: 'link-1',
    dimoTokenId: 1,
  };

  function makePrismaTxMock() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      vehicleDtcSourceHead: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      vehicleDtcEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicleLatestState: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org',
          licensePlate: 'X',
          make: 'Audi',
          model: 'A4',
        }),
      },
      vehicleDtcSnapshotOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      vehicleDtcSnapshotOutbox: tx.vehicleDtcSnapshotOutbox,
    };
    return { prisma, tx };
  }

  it('triggers VSI materialization after confirmed complete poll apply', async () => {
    const { prisma } = makePrismaTxMock();
    const dtcService = {
      upsertDtc: jest.fn().mockResolvedValue({ id: 'e1', severity: 'WARNING' }),
      clearDtc: jest.fn(),
      findActive: jest.fn(),
      runEpisodeSideEffectsAfterCommit: jest.fn(),
    };
    const materializeFromPersistedEvidence = jest.fn().mockResolvedValue({});
    const svc = new DtcSnapshotApplyService(
      prisma as never,
      dtcService as never,
      undefined,
      undefined,
      { materializeFromPersistedEvidence } as never,
    );

    const built = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-24T06:46:10.000Z'),
      auditRef: 'audit-1',
      obdDtcListSignal: {
        timestamp: '2026-10-24T06:46:08.000Z',
        value: ['P0301'],
      },
    });
    await svc.applyBuiltProposal(built);
    expect(materializeFromPersistedEvidence).toHaveBeenCalledWith({
      organizationId: 'org',
      vehicleId: 'v1',
      providerSourceLinkId: 'link-1',
      lifecycleMode: 'DTC_CONFIRMED_COMPLETE_APPLIED',
    });
  });
});
