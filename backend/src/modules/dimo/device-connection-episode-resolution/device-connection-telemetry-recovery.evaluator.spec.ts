import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import {
  buildTelemetrySnapshotReferenceId,
  evaluateSustainedTelemetryPolicy,
  evaluateTelemetryObservationGuard,
  isProviderConnectionStatusActive,
} from './device-connection-telemetry-recovery.evaluator';
import { DEFAULT_TELEMETRY_RECOVERY_POLICY } from './device-connection-telemetry-recovery.policy';

function openEpisode(overrides: Record<string, unknown> = {}) {
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
    obdIsPluggedIn: null as boolean | null,
    providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    receivedAt: new Date('2026-07-08T17:22:05.000Z'),
    snapshotSource: 'dimo',
    sourceSubtype: null,
    providerBindingId: 'binding-1',
    snapshotReferenceId: 'vls:state-1:tel:2026-07-08T17:22:00.000Z',
    providerConnectionStatus: 'CONNECTED',
    hasOperationalSignal: true,
    ...overrides,
  };
}

const policy = DEFAULT_TELEMETRY_RECOVERY_POLICY;

describe('device-connection-telemetry-recovery.evaluator', () => {
  it('accepts recordable telemetry when guards pass', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput(),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({
      action: 'record',
      providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    });
  });

  it('rejects false obdIsPluggedIn', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({ obdIsPluggedIn: false }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'obd_false' });
  });

  it('rejects binding mismatch', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({ providerBindingId: 'binding-other' }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'binding_mismatch' });
  });

  it('rejects OEM-only source subtype', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({ sourceSubtype: 'OEM_API' }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'oem_only_snapshot_source' });
  });

  it('rejects synthetic source subtype', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({ sourceSubtype: 'SYNTHETIC_ONLY' }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'synthetic_snapshot_source' });
  });

  it('rejects delayed backfill replay', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
        receivedAt: new Date('2026-07-10T00:00:00.000Z'),
      }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'backfill_replay' });
  });

  it('rejects stale provider timestamps before unplug', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({
        providerObservedAt: new Date('2026-07-08T17:00:00.000Z'),
      }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'observed_before_unplug' });
  });

  it('rejects snapshot without operational signal', () => {
    const result = evaluateTelemetryObservationGuard(
      baseInput({ hasOperationalSignal: false }),
      openEpisode(),
      policy,
    );
    expect(result).toEqual({ action: 'reject', reason: 'no_operational_signal' });
  });

  it('variant A — multiple fresh snapshots over min span', () => {
    const result = evaluateSustainedTelemetryPolicy({
      observations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T17:22:05.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
        {
          providerObservedAt: new Date('2026-07-08T17:23:30.000Z'),
          receivedAt: new Date('2026-07-08T17:23:35.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
      ],
      tripStartedOrCompletedAfterUnplug: false,
      referenceReceivedAt: new Date('2026-07-08T17:23:35.000Z'),
      policy,
    });
    expect(result.satisfied).toBe(true);
    expect(result.variant).toBe('SPAN');
  });

  it('variant B — single snapshot plus trip evidence', () => {
    const result = evaluateSustainedTelemetryPolicy({
      observations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T17:22:05.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
      ],
      tripStartedOrCompletedAfterUnplug: true,
      referenceReceivedAt: new Date('2026-07-08T17:22:05.000Z'),
      policy,
    });
    expect(result.satisfied).toBe(true);
    expect(result.variant).toBe('TRIP');
  });

  it('variant C — connection status plus multiple fresh snapshots', () => {
    const receivedAt = new Date('2026-07-08T17:22:30.000Z');
    const result = evaluateSustainedTelemetryPolicy({
      observations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt,
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
        {
          providerObservedAt: new Date('2026-07-08T17:22:20.000Z'),
          receivedAt,
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
      ],
      tripStartedOrCompletedAfterUnplug: false,
      referenceReceivedAt: receivedAt,
      policy,
    });
    expect(result.satisfied).toBe(true);
    expect(result.variant).toBe('CONNECTION_STATUS');
  });

  it('does not satisfy on single snapshot without trip', () => {
    const result = evaluateSustainedTelemetryPolicy({
      observations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T17:22:05.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
      ],
      tripStartedOrCompletedAfterUnplug: false,
      referenceReceivedAt: new Date('2026-07-08T17:22:05.000Z'),
      policy,
    });
    expect(result.satisfied).toBe(false);
  });

  it('does not satisfy on connection status alone', () => {
    const result = evaluateSustainedTelemetryPolicy({
      observations: [],
      tripStartedOrCompletedAfterUnplug: false,
      referenceReceivedAt: new Date('2026-07-08T17:22:05.000Z'),
      policy,
    });
    expect(result.satisfied).toBe(false);
  });

  it('rejects snapshot series with gaps exceeding policy', () => {
    const result = evaluateSustainedTelemetryPolicy({
      observations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T17:22:05.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
        {
          providerObservedAt: new Date('2026-07-08T18:00:00.000Z'),
          receivedAt: new Date('2026-07-08T18:00:05.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
        },
      ],
      tripStartedOrCompletedAfterUnplug: false,
      referenceReceivedAt: new Date('2026-07-08T18:00:05.000Z'),
      policy,
    });
    expect(result.satisfied).toBe(false);
  });

  it('builds telemetry snapshot reference ids', () => {
    expect(
      buildTelemetrySnapshotReferenceId({
        vehicleLatestStateId: 'vls-1',
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
      }),
    ).toBe('vls:vls-1:tel:2026-07-08T17:22:00.000Z');
  });

  it('detects active provider connection status', () => {
    expect(isProviderConnectionStatusActive('CONNECTED')).toBe(true);
    expect(isProviderConnectionStatusActive('DISCONNECTED')).toBe(false);
  });
});
