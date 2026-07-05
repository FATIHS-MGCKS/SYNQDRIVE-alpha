import {
  DEFAULT_RPM_THRESHOLD,
  RpmWebhookCandidateService,
  RPM_WEBHOOK_DEDUP_WINDOW_MS,
} from './rpm-webhook-candidate.service';
import { RpmWebhookCandidateStatus } from '@prisma/client';

function mockPrisma() {
  return {
    rpmWebhookCandidate: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    vehicleTrip: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('RpmWebhookCandidateService — static helpers', () => {
  it('dedup buckets use 10s window', () => {
    const a = RpmWebhookCandidateService.dedupBucket(new Date(0));
    const b = RpmWebhookCandidateService.dedupBucket(
      new Date(RPM_WEBHOOK_DEDUP_WINDOW_MS - 1),
    );
    const c = RpmWebhookCandidateService.dedupBucket(
      new Date(RPM_WEBHOOK_DEDUP_WINDOW_MS),
    );
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

describe('RpmWebhookCandidateService.ingestRpmThresholdEvent', () => {
  const iceVehicle = {
    id: 'veh-1',
    organizationId: 'org-1',
    hardwareType: 'LTE_R1' as const,
    fuelType: 'PETROL',
  };

  it('skips Tesla/EV powertrains', async () => {
    const prisma = mockPrisma();
    const service = new RpmWebhookCandidateService(prisma as never);

    const result = await service.ingestRpmThresholdEvent({
      vehicle: { ...iceVehicle, fuelType: 'ELECTRIC' },
      tokenId: 1,
      observedAt: new Date('2026-07-05T12:00:00Z'),
      observedValue: 5200,
      rawPayload: {},
    });

    expect(result.outcome).toBe('skipped_powertrain');
    expect(prisma.rpmWebhookCandidate.upsert).not.toHaveBeenCalled();
  });

  it('ignores values below default threshold', async () => {
    const prisma = mockPrisma();
    const service = new RpmWebhookCandidateService(prisma as never);

    const result = await service.ingestRpmThresholdEvent({
      vehicle: iceVehicle,
      tokenId: 1,
      observedAt: new Date('2026-07-05T12:00:00Z'),
      observedValue: DEFAULT_RPM_THRESHOLD - 1,
      rawPayload: {},
    });

    expect(result.outcome).toBe('ignored');
    expect(prisma.rpmWebhookCandidate.upsert).not.toHaveBeenCalled();
  });

  it('creates candidate and enriches context', async () => {
    const prisma = mockPrisma();
    const observedAt = new Date('2026-07-05T12:00:00Z');
    prisma.rpmWebhookCandidate.upsert.mockResolvedValue({
      id: 'cand-1',
      createdAt: observedAt,
      updatedAt: observedAt,
      status: RpmWebhookCandidateStatus.RECEIVED,
    });
    prisma.rpmWebhookCandidate.update.mockResolvedValue({});

    const contextEnrichment = {
      enrichAnchorContext: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
      }),
    };

    const service = new RpmWebhookCandidateService(
      prisma as never,
      contextEnrichment as never,
    );

    const result = await service.ingestRpmThresholdEvent({
      vehicle: iceVehicle,
      tokenId: 42,
      observedAt,
      observedValue: 5400,
      rawPayload: { signal: { value: 5400 } },
    });

    expect(result.outcome).toBe('created');
    expect(result.candidateId).toBe('cand-1');
    expect(result.status).toBe(RpmWebhookCandidateStatus.CONTEXT_ENRICHED);
    expect(contextEnrichment.enrichAnchorContext).toHaveBeenCalled();
    expect(prisma.rpmWebhookCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cand-1' },
        data: expect.objectContaining({
          status: RpmWebhookCandidateStatus.CONTEXT_ENRICHED,
        }),
      }),
    );
  });

  it('returns duplicate for same dedup bucket', async () => {
    const prisma = mockPrisma();
    const created = new Date('2026-07-05T12:00:00Z');
    const updated = new Date('2026-07-05T12:00:05Z');
    prisma.rpmWebhookCandidate.upsert.mockResolvedValue({
      id: 'cand-2',
      createdAt: created,
      updatedAt: updated,
      status: RpmWebhookCandidateStatus.RECEIVED,
    });

    const service = new RpmWebhookCandidateService(prisma as never);
    const result = await service.ingestRpmThresholdEvent({
      vehicle: iceVehicle,
      tokenId: 42,
      observedAt: created,
      observedValue: 6000,
      rawPayload: {},
    });

    expect(result.outcome).toBe('duplicate');
    expect(result.candidateId).toBe('cand-2');
  });
});
