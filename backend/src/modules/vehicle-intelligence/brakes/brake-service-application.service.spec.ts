import { ConflictException } from '@nestjs/common';
import {
  createBrakeLifecycleHarness,
  seedMeasuredBrakeBaseline,
} from './brake-lifecycle-test.harness';
import { BrakeServiceApplicationService } from './brake-service-application.service';
import { BrakeServiceOutboxService } from './brake-service-outbox.service';

describe('BrakeServiceApplicationService', () => {
  function createApplicationHarness() {
    const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 30000 });
    const recalcOrchestrator = {
      enqueue: jest.fn().mockImplementation(async (input: { vehicleId: string }) =>
        h.brakeHealth.recalculate(input.vehicleId),
      ),
    };
    const application = new BrakeServiceApplicationService(
      h.prisma as never,
      h.brakeHealth,
      new BrakeServiceOutboxService(h.prisma as never, recalcOrchestrator as never),
    );
    return { ...h, application };
  }

  it('applies a scoped pads service atomically', async () => {
    const h = createApplicationHarness();
    const result = await h.application.apply({
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-10T10:00:00Z',
      odometerKm: 30000,
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 11 },
      clientRequestId: 'app-success-front-pads',
    });

    expect(result.applicationStatus).toBe('APPLIED');
    expect(result.installationIds).toHaveLength(1);
    expect(h.store.brakeEvidence).toHaveLength(1);
    expect(h.store.brakeServiceOutbox.length).toBeGreaterThan(0);
    expect(h.store.vehicleServiceEvent[0].brakeApplicationStatus).toBe('APPLIED');
  });

  it('rejects cross-tenant vehicle access', async () => {
    const h = createApplicationHarness();
    await expect(
      h.application.apply({
        organizationId: 'org-other',
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-10T10:00:00Z',
        kind: 'inspection_only',
        clientRequestId: 'cross-tenant',
      }),
    ).rejects.toThrow('organization_vehicle_mismatch');
  });

  it('deduplicates identical client requests', async () => {
    const h = createApplicationHarness();
    const input = {
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-11T10:00:00Z',
      odometerKm: 30000,
      kind: 'inspection_only' as const,
      measured: { frontPadMm: 7.5 },
      clientRequestId: 'duplicate-client-req',
    };
    const first = await h.application.apply(input);
    const second = await h.application.apply(input);
    expect(second.replayed).toBe(true);
    expect(second.serviceEventId).toBe(first.serviceEventId);
    expect(h.store.vehicleServiceEvent).toHaveLength(1);
  });

  it('rejects concurrent duplicate with payload mismatch', async () => {
    const h = createApplicationHarness();
    await h.application.apply({
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-12T10:00:00Z',
      kind: 'inspection_only',
      clientRequestId: 'mismatch-key',
    });
    await expect(
      h.application.apply({
        organizationId: 'org-1',
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-13T10:00:00Z',
        kind: 'pads_service',
        scope: ['front_pads'],
        clientRequestId: 'mismatch-key',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back installation and health when evidence write fails', async () => {
    const h = createApplicationHarness();
    jest.spyOn(h.prisma.brakeEvidence, 'create').mockRejectedValueOnce(new Error('evidence failed'));

    await expect(
      h.application.apply({
        organizationId: 'org-1',
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-14T10:00:00Z',
        odometerKm: 30000,
        kind: 'pads_service',
        scope: ['front_pads'],
        measured: { frontPadMm: 10.5 },
        clientRequestId: 'evidence-fail',
      }),
    ).rejects.toThrow('evidence failed');

    expect(h.store.brakeComponentInstallations).toHaveLength(0);
    expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
    expect(h.store.brakeServiceApplications.some((a) => a.status === 'FAILED')).toBe(true);
  });

  it('retries a previously failed application idempotently', async () => {
    const h = createApplicationHarness();
    jest
      .spyOn(h.brakeHealth, 'applyScopedComponentAnchorsInTx')
      .mockRejectedValueOnce(new Error('health failed'))
      .mockResolvedValueOnce({ updated: true });

    await expect(
      h.application.apply({
        organizationId: 'org-1',
        vehicleId: h.vehicleId,
        serviceDate: '2026-06-15T10:00:00Z',
        odometerKm: 30000,
        kind: 'pads_service',
        scope: ['front_pads'],
        measured: { frontPadMm: 9.8 },
        clientRequestId: 'retry-key',
      }),
    ).rejects.toThrow('health failed');

    const retry = await h.application.apply({
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-15T10:00:00Z',
      odometerKm: 30000,
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 9.8 },
      clientRequestId: 'retry-key',
    });

    expect(retry.applicationStatus).toBe('APPLIED');
    expect(h.store.brakeComponentInstallations).toHaveLength(1);
  });

  it('processes outbox recalculation after commit', async () => {
    const h = createApplicationHarness();
    await seedMeasuredBrakeBaseline(h, { odometerKm: 25000 });
    const recalcSpy = jest.spyOn(h.brakeHealth, 'recalculate');

    await h.application.apply({
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-16T10:00:00Z',
      odometerKm: 30000,
      kind: 'pads_service',
      scope: ['front_pads'],
      measured: { frontPadMm: 11.2 },
      clientRequestId: 'outbox-recalc',
    });

    expect(recalcSpy).toHaveBeenCalled();
    expect(h.store.brakeServiceOutbox.every((row) => row.status === 'COMPLETED')).toBe(true);
  });

  it('does not create duplicate active installations on replay', async () => {
    const h = createApplicationHarness();
    const input = {
      organizationId: 'org-1',
      vehicleId: h.vehicleId,
      serviceDate: '2026-06-17T10:00:00Z',
      odometerKm: 30000,
      kind: 'pads_service' as const,
      scope: ['front_pads' as const],
      measured: { frontPadMm: 10.1 },
      clientRequestId: 'no-dup-install',
    };
    await h.application.apply(input);
    await h.application.apply(input);
    expect(h.store.brakeComponentInstallations).toHaveLength(1);
  });
});
