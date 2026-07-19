import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  DeviceConnectionEpisodeResolutionOutboxEventType,
  type DeviceConnectionEpisode,
} from '@prisma/client';
import { OverallConnectivityState, PhysicalDeviceState } from '../../vehicles/connectivity/domain/connectivity-domain.types';
import { DeviceConnectionEpisodeResolutionService } from './device-connection-episode-resolution.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution-outbox.service';
import { VehicleConnectivityRuntimeProjectionService } from './vehicle-connectivity-runtime-projection.service';
import { DEFAULT_TELEMETRY_RECOVERY_POLICY } from './device-connection-telemetry-recovery.policy';
import type { TelemetryRecoverySignalInput } from './device-connection-telemetry-recovery.evaluator';

function openEpisode(overrides: Partial<DeviceConnectionEpisode> = {}): DeviceConnectionEpisode {
  return {
    id: 'ep-open-1',
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    deviceBindingId: 'binding-1',
    providerDeviceIdHash: 'hash-1',
    openedAt: new Date('2026-07-08T17:21:19.000Z'),
    openedByEventId: 'evt-unplug',
    openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
    status: DeviceConnectionEpisodeStatus.OPEN,
    resolvedAt: null,
    resolutionMethod: null,
    resolutionEvidenceAt: null,
    resolutionEventId: null,
    resolutionSnapshotId: null,
    reviewReasonCodes: [],
    stateVersion: 1,
    createdAt: new Date('2026-07-08T17:21:19.000Z'),
    updatedAt: new Date('2026-07-08T17:21:19.000Z'),
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    hardwareType: 'LTE_R1',
    obdIsPluggedIn: true as boolean | null,
    providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    receivedAt: new Date('2026-07-08T17:22:05.000Z'),
    snapshotSource: 'dimo',
    providerBindingId: 'binding-1',
    providerDeviceIdHash: 'hash-1',
    snapshotReferenceId: 'vls:state-1:obd:2026-07-08T17:22:00.000Z',
    sourceSubtype: null,
    ...overrides,
  };
}

function telemetryInput(overrides: Partial<TelemetryRecoverySignalInput> = {}): TelemetryRecoverySignalInput {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    hardwareType: 'LTE_R1',
    obdIsPluggedIn: null,
    providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    receivedAt: new Date('2026-07-08T17:22:05.000Z'),
    snapshotSource: 'dimo',
    providerBindingId: 'binding-1',
    providerDeviceIdHash: 'hash-1',
    snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:22:00.000Z',
    sourceSubtype: null,
    providerConnectionStatus: 'CONNECTED',
    hasOperationalSignal: true,
    ...overrides,
  };
}

function buildService(policy = DEFAULT_TELEMETRY_RECOVERY_POLICY) {
  const episodes: DeviceConnectionEpisode[] = [openEpisode()];
  const audits: unknown[] = [];
  const outbox: unknown[] = [];
  const observations: Array<Record<string, unknown>> = [];

  const tx = {
    deviceConnectionEpisode: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        episodes.find((episode) => episode.id === where.id) ?? null,
      ),
    },
    deviceConnectionEpisodeResolutionAudit: {
      create: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      }),
    },
    deviceConnectionEpisodeResolutionOutbox: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `outbox-${outbox.length}`, ...data };
        outbox.push(row);
        return row;
      }),
    },
    deviceConnectionTelemetryRecoveryObservation: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        observations.push(data);
        return { id: `obs-${observations.length}`, ...data };
      }),
      findMany: jest.fn().mockImplementation(async () =>
        observations.map((row) => ({
          providerObservedAt: row.providerObservedAt as Date,
          receivedAt: row.receivedAt as Date,
          hasOperationalSignal: row.hasOperationalSignal as boolean,
          connectionStatusActive: row.connectionStatusActive as boolean,
        })),
      ),
    },
    vehicleTrip: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const prisma = {
    deviceConnectionEpisode: {
      findFirst: jest.fn().mockImplementation(async () => episodes.find((e) => e.status === 'OPEN') ?? null),
      findMany: jest.fn().mockImplementation(async () => episodes.filter((e) => e.status === 'OPEN')),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        episodes.find((episode) => episode.id === where.id) ?? null,
      ),
    },
    deviceConnectionTelemetryRecoveryObservation: {
      count: jest.fn().mockResolvedValue(observations.length),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const runtimeProjection = {
    projectForVehicle: jest.fn().mockResolvedValue({
      overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
      physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      stateVersion: 2,
    }),
  } as unknown as VehicleConnectivityRuntimeProjectionService;

  const outboxService = new DeviceConnectionEpisodeResolutionOutboxService();
  const service = new DeviceConnectionEpisodeResolutionService(
    prisma as never,
    runtimeProjection,
    outboxService,
    policy,
  );

  return { service, prisma, tx, episodes, audits, outbox, observations, runtimeProjection };
}

describe('DeviceConnectionEpisodeResolutionService', () => {
  it('resolves open episode from incident-like snapshot true', async () => {
    const { service, tx, audits, outbox, runtimeProjection } = buildService();

    const result = await service.tryResolveFromSnapshotPlugSignal(baseInput());

    expect(result.outcome).toBe('resolved');
    expect(tx.deviceConnectionEpisode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeviceConnectionEpisodeStatus.RESOLVED,
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
        }),
      }),
    );
    expect(audits).toHaveLength(1);
    expect(outbox).toHaveLength(2);
    expect(runtimeProjection.projectForVehicle).toHaveBeenCalledWith('org-a', 'veh-1');
  });

  it('does not resolve on false snapshot', async () => {
    const { service, tx } = buildService();
    const result = await service.tryResolveFromSnapshotPlugSignal(
      baseInput({ obdIsPluggedIn: false }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'obd_false' });
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('does not resolve on null snapshot', async () => {
    const { service, tx } = buildService();
    const result = await service.tryResolveFromSnapshotPlugSignal(
      baseInput({ obdIsPluggedIn: null }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'obd_null' });
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('leaves episode open when no open episode exists', async () => {
    const { service, prisma, tx } = buildService();
    prisma.deviceConnectionEpisode.findFirst.mockResolvedValue(null);
    const result = await service.tryResolveFromSnapshotPlugSignal(baseInput());
    expect(result).toEqual({ outcome: 'no_open_episode' });
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent when episode already resolved with same snapshot', async () => {
    const { service, prisma, tx, episodes } = buildService();
    episodes[0] = {
      ...openEpisode(),
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      resolutionSnapshotId: 'vls:state-1:obd:2026-07-08T17:22:00.000Z',
      resolvedAt: new Date('2026-07-08T17:22:00.000Z'),
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
    };
    prisma.deviceConnectionEpisode.findFirst.mockResolvedValue(episodes[0]);

    const result = await service.tryResolveFromSnapshotPlugSignal(baseInput());
    expect(result.outcome).toBe('same_snapshot_applied');
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('returns already_resolved when episode closed by other method', async () => {
    const { service, prisma, tx, episodes } = buildService();
    episodes[0] = {
      ...openEpisode(),
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      resolutionSnapshotId: 'other-snapshot',
      resolvedAt: new Date('2026-07-08T18:00:00.000Z'),
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK,
    };
    prisma.deviceConnectionEpisode.findFirst.mockResolvedValue(episodes[0]);

    const result = await service.tryResolveFromSnapshotPlugSignal(baseInput());
    expect(result.outcome).toBe('already_resolved');
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('handles parallel resolution race via updateMany count 0', async () => {
    const { service, tx, episodes, prisma } = buildService();
    tx.deviceConnectionEpisode.updateMany.mockResolvedValue({ count: 0 });
    episodes[0] = {
      ...openEpisode(),
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      resolutionSnapshotId: 'vls:state-1:obd:2026-07-08T17:22:00.000Z',
    };
    tx.deviceConnectionEpisode.findUnique.mockResolvedValue(episodes[0]);
    prisma.deviceConnectionEpisode.findFirst.mockResolvedValue(openEpisode());

    const result = await service.tryResolveFromSnapshotPlugSignal(baseInput());
    expect(result.outcome).toBe('same_snapshot_applied');
  });

  it('enqueues runtime recalc and alert resolve prepared events', async () => {
    const { service, outbox } = buildService();
    await service.tryResolveFromSnapshotPlugSignal(baseInput());
    const eventTypes = outbox.map(
      (row) => (row as { eventType: DeviceConnectionEpisodeResolutionOutboxEventType }).eventType,
    );
    expect(eventTypes).toContain(
      DeviceConnectionEpisodeResolutionOutboxEventType.CONNECTIVITY_RUNTIME_RECALCULATE,
    );
    expect(eventTypes).toContain(
      DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
    );
  });

  it('rejects cross-tenant resolution attempt', async () => {
    const { service, tx } = buildService();
    const result = await service.tryResolveFromSnapshotPlugSignal(
      baseInput({ organizationId: 'org-b' }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'organization_mismatch' });
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });
});

describe('DeviceConnectionEpisodeResolutionService telemetry recovery', () => {
  it('accumulates a single fresh snapshot without closing episode', async () => {
    const { service, tx } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(telemetryInput());
    expect(result).toEqual({
      outcome: 'accumulated',
      episodeId: 'ep-open-1',
      observationCount: 1,
    });
    expect(tx.deviceConnectionEpisode.updateMany).not.toHaveBeenCalled();
  });

  it('resolves via span policy after multiple fresh snapshots', async () => {
    const { service, tx, audits, outbox } = buildService();

    await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
        receivedAt: new Date('2026-07-08T17:22:05.000Z'),
        snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:22:00.000Z',
      }),
    );

    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:23:30.000Z'),
        receivedAt: new Date('2026-07-08T17:23:35.000Z'),
        snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:23:30.000Z',
      }),
    );

    expect(result.outcome).toBe('resolved');
    expect(tx.deviceConnectionEpisode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeviceConnectionEpisodeStatus.RESOLVED,
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
        }),
      }),
    );
    expect(audits).toHaveLength(1);
    expect(outbox).toHaveLength(2);
    expect(
      (outbox[1] as { payload: { recoverySource: string } }).payload.recoverySource,
    ).toBe('telemetry_resumed');
  });

  it('resolves via trip policy with one snapshot and post-unplug trip', async () => {
    const { service, tx } = buildService();
    tx.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1' });

    const result = await service.tryResolveFromSustainedTelemetry(telemetryInput());
    expect(result.outcome).toBe('resolved');
    expect(tx.deviceConnectionEpisode.updateMany).toHaveBeenCalled();
  });

  it('rejects wrong binding', async () => {
    const { service, tx } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({ providerBindingId: 'binding-other' }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'binding_mismatch' });
    expect(tx.deviceConnectionTelemetryRecoveryObservation.create).not.toHaveBeenCalled();
  });

  it('rejects OEM parallel source', async () => {
    const { service } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({ sourceSubtype: 'OEM_API' }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'oem_only_snapshot_source' });
  });

  it('rejects synthetic parallel source', async () => {
    const { service } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({ sourceSubtype: 'SYNTHETIC_ONLY' }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'synthetic_snapshot_source' });
  });

  it('rejects delayed old data', async () => {
    const { service } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
        receivedAt: new Date('2026-07-10T00:00:00.000Z'),
      }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'backfill_replay' });
  });

  it('rejects connection status alone without operational snapshots', async () => {
    const { service } = buildService();
    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({ hasOperationalSignal: false }),
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'no_operational_signal' });
  });

  it('is idempotent on repeated snapshot reference', async () => {
    const { service, episodes, prisma } = buildService();
    episodes[0] = {
      ...openEpisode(),
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
      resolutionSnapshotId: 'vls:state-1:tel:2026-07-08T17:22:00.000Z',
      resolvedAt: new Date('2026-07-08T17:22:00.000Z'),
    };
    prisma.deviceConnectionEpisode.findFirst.mockResolvedValue(episodes[0]);

    const result = await service.tryResolveFromSustainedTelemetry(telemetryInput());
    expect(result.outcome).toBe('same_snapshot_applied');
  });

  it('handles parallel worker race on resolve', async () => {
    const { service, tx } = buildService();
    tx.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1' });

    await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
        snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:22:00.000Z',
      }),
    );

    tx.deviceConnectionEpisode.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.deviceConnectionEpisode.findUnique.mockResolvedValue({
      ...openEpisode(),
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
      resolutionSnapshotId: 'vls:state-1:tel:2026-07-08T17:23:30.000Z',
    });

    const result = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:23:30.000Z'),
        receivedAt: new Date('2026-07-08T17:23:35.000Z'),
        snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:23:30.000Z',
      }),
    );
    expect(result.outcome).toBe('same_snapshot_applied');
  });
});

describe('INCIDENT_VEHICLE_001 telemetry replay', () => {
  it('closes open unplug episode from sustained telemetry plus trip without plug webhook', async () => {
    const { service, tx } = buildService();
    tx.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-post-1' });

    const first = await service.tryResolveFromSustainedTelemetry(
      telemetryInput({
        providerObservedAt: new Date('2026-07-08T17:21:41.000Z'),
        receivedAt: new Date('2026-07-08T17:21:41.313Z'),
        snapshotReferenceId: 'vls:incident:tel:2026-07-08T17:21:41.000Z',
        obdIsPluggedIn: null,
      }),
    );
    expect(first.outcome).toBe('resolved');
    expect(first).toMatchObject({
      policyVariant: 'TRIP',
      episodeId: 'ep-open-1',
    });
    expect(tx.deviceConnectionEpisode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
          resolutionEvidenceAt: new Date('2026-07-08T17:21:41.000Z'),
        }),
      }),
    );
  });
});
