import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { buildPollSignalsLatestProposal } from './dtc-snapshot-proposal.builder';

describe('DtcSnapshotApplyService', () => {
  const binding = {
    provider: 'DIMO' as const,
    providerBindingId: 'link-1',
    dimoTokenId: 1,
  };

  function makePrismaTxMock(overrides: Record<string, unknown> = {}) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      vehicleDtcSourceHead: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      vehicleDtcEvent: {
        findMany: jest.fn().mockResolvedValue([{ dtcCode: 'P0301' }]),
      },
      vehicleLatestState: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org',
          licensePlate: 'X',
          make: 'VW',
          model: 'Golf',
        }),
      },
      vehicleDtcSnapshotOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      vehicleDtcSnapshotOutbox: tx.vehicleDtcSnapshotOutbox,
    };
    return { prisma, tx };
  }

  it('does not clear on rejected fetch-without-signal build', async () => {
    const { prisma } = makePrismaTxMock();
    const dtcService = {
      upsertDtc: jest.fn(),
      clearDtc: jest.fn(),
      findActive: jest.fn(),
      runEpisodeSideEffectsAfterCommit: jest.fn(),
    };
    const svc = new DtcSnapshotApplyService(prisma as any, dtcService as any);

    const built = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date(),
      auditRef: 't',
      obdDtcListSignal: null,
    });
    const result = await svc.applyBuiltProposal(built);
    expect(result.cleared).toEqual([]);
    expect(dtcService.clearDtc).not.toHaveBeenCalled();
    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
  });

  it('applies confirmed empty snapshot and clears prior code without touching global VLS provenance fields', async () => {
    const { prisma, tx } = makePrismaTxMock();
    const dtcService = {
      upsertDtc: jest.fn().mockResolvedValue({ id: 'e1', severity: 'WARNING' }),
      clearDtc: jest.fn().mockResolvedValue({ count: 1 }),
      findActive: jest.fn().mockResolvedValue([]),
      runEpisodeSideEffectsAfterCommit: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new DtcSnapshotApplyService(prisma as any, dtcService as any);

    const built = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 't',
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: [] },
    });
    const result = await svc.applyBuiltProposal(built);
    expect(result.decision.apply).toBe(true);
    expect(dtcService.clearDtc).toHaveBeenCalledWith(
      'v1',
      'P0301',
      expect.objectContaining({ deferDownstreamSideEffects: true }),
    );
    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
    const vlsUpdate = tx.vehicleLatestState.updateMany.mock.calls[0][0];
    expect(vlsUpdate.data).toMatchObject({
      obdDtcList: [],
      lastDtcSuccessfulCheckAt: expect.any(Date),
    });
    expect(vlsUpdate.data).not.toHaveProperty('sourceTimestamp');
    expect(vlsUpdate.data).not.toHaveProperty('providerFetchedAt');
    expect(vlsUpdate.data).not.toHaveProperty('rawPayloadJson');
  });
});
