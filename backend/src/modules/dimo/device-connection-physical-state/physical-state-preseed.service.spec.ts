import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalStatePreseedService } from './physical-state-preseed.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import type { PhysicalStatePreseedScope } from './physical-state-preseed.types';

describe('PhysicalStatePreseedService metrics DI', () => {
  function createMetricsStub() {
    const preseedInc = jest.fn();
    return {
      connectivityPhysicalStatePreseedTotal: { inc: preseedInc },
      preseedInc,
    } as unknown as TripMetricsService & { preseedInc: jest.Mock };
  }

  function createService(metrics: TripMetricsService) {
    const prisma = {
      deviceConnectionPhysicalState: { findFirst: jest.fn().mockResolvedValue(null) },
      dimoDeviceConnectionEvent: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleLatestState: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const coordinator = {
      reconcileInOuterTransaction: jest.fn(),
    } as unknown as PhysicalStateReconcileCoordinator;

    return {
      service: new PhysicalStatePreseedService(prisma, coordinator, metrics),
      prisma,
      coordinator,
    };
  }

  const scope: PhysicalStatePreseedScope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    tokenId: 42,
  };

  it('receives TripMetricsService as a required runtime dependency', () => {
    const metrics = createMetricsStub();
    const { service } = createService(metrics);
    expect((service as unknown as { metrics: TripMetricsService }).metrics).toBe(metrics);
  });

  it('dry-run records connectivityPhysicalStatePreseedTotal with low-cardinality labels', async () => {
    const metrics = createMetricsStub();
    const { service } = createService(metrics);

    await service.dryRunPhysicalStatePreseed(scope);

    expect(metrics.preseedInc).toHaveBeenCalledWith({
      result: 'INSUFFICIENT_EVIDENCE',
      provider: 'DIMO',
      dry_run: 'true',
    });

    const labels = metrics.preseedInc.mock.calls[0]?.[0] as Record<string, string>;
    expect(Object.keys(labels).sort()).toEqual(['dry_run', 'provider', 'result']);
    expect(labels.vehicleId).toBeUndefined();
    expect(labels.organizationId).toBeUndefined();
    expect(labels.tokenId).toBeUndefined();
    expect(labels.bindingKey).toBeUndefined();
  });

  it('apply records connectivityPhysicalStatePreseedTotal when coordinator establishes', async () => {
    const metrics = createMetricsStub();
    const { service, prisma, coordinator } = createService(metrics);
    const observedAt = new Date('2026-09-12T15:02:29.000Z');

    jest.spyOn(prisma.dimoDeviceConnectionEvent, 'findMany').mockResolvedValue([
      {
        id: 'event-1',
        tokenId: 42,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt,
        provider: 'DIMO',
      },
    ] as never);

    jest.spyOn(coordinator, 'reconcileInOuterTransaction').mockResolvedValue({
      kind: 'reconciled',
      reconcile: {
        enabled: true,
        decision: DeviceConnectionPhysicalTransitionDecision.ESTABLISHED,
        projection: {
          effectiveState: 'UNPLUGGED',
          evidenceObservedAt: observedAt,
          evidenceSource: 'WEBHOOK',
          evidenceReferenceId: 'event-1',
          stateVersion: 1,
        },
        transitionId: 'transition-1',
        episodeAction: 'none',
        alertAction: 'none',
        context: {} as never,
      },
      canonicalEventId: null,
      outboxId: null,
      outboxDuplicate: false,
    });

    await service.applyPhysicalStatePreseed(scope);

    expect(metrics.preseedInc).toHaveBeenCalledWith({
      result: 'ESTABLISHED',
      provider: 'DIMO',
      dry_run: 'false',
    });
  });
});
