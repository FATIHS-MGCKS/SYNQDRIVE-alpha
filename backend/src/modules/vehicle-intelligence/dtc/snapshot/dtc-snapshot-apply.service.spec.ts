import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { buildPollSignalsLatestProposal } from './dtc-snapshot-proposal.builder';

describe('DtcSnapshotApplyService', () => {
  const binding = {
    provider: 'DIMO' as const,
    providerBindingId: 'link-1',
    dimoTokenId: 1,
  };

  it('does not clear on rejected fetch-without-signal build', async () => {
    const prisma = {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({ rawPayloadJson: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const dtcService = { upsertDtc: jest.fn(), clearDtc: jest.fn(), findActive: jest.fn() };
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

  it('applies confirmed empty snapshot and clears prior code', async () => {
    const prisma = {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({
          rawPayloadJson: null,
          sourceTimestamp: null,
          providerBindingId: null,
        }),
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
      vehicleDtcEvent: {
        findMany: jest.fn().mockResolvedValue([{ dtcCode: 'P0301' }]),
      },
    };
    const dtcService = {
      upsertDtc: jest.fn().mockResolvedValue({ id: 'e1', severity: 'WARNING' }),
      clearDtc: jest.fn().mockResolvedValue({ count: 1 }),
      findActive: jest.fn().mockResolvedValue([]),
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
    expect(dtcService.clearDtc).toHaveBeenCalledWith('v1', 'P0301', expect.any(Object));
    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
  });
});
