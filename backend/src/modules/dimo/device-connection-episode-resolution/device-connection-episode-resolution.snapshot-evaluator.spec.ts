import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import {
  buildSnapshotReferenceId,
  evaluateSnapshotPlugResolution,
  extractObdPlugSignalFromSnapshot,
  isPhysicalObdHardware,
  isPhysicalObdSnapshotSource,
} from './device-connection-episode-resolution.snapshot-evaluator';

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
    obdIsPluggedIn: true as boolean | null,
    providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    receivedAt: new Date('2026-07-08T17:22:05.000Z'),
    snapshotSource: 'dimo',
    providerBindingId: 'binding-1',
    snapshotReferenceId: 'vls:state-1:obd:2026-07-08T17:22:00.000Z',
    sourceSubtype: null,
    ...overrides,
  };
}

describe('device-connection-episode-resolution.snapshot-evaluator', () => {
  it('incident-like fresh true snapshot resolves', () => {
    const result = evaluateSnapshotPlugResolution(baseInput(), openEpisode());
    expect(result.action).toBe('resolve');
  });

  it('rejects false obdIsPluggedIn without resolution', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ obdIsPluggedIn: false }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'obd_false' });
  });

  it('rejects null obdIsPluggedIn', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ obdIsPluggedIn: null }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'obd_null' });
  });

  it('rejects snapshot observed before unplug even if received later', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({
        providerObservedAt: new Date('2026-07-08T17:00:00.000Z'),
        receivedAt: new Date('2026-07-08T18:00:00.000Z'),
      }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'observed_before_unplug' });
  });

  it('rejects received before unplug', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({
        providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
        receivedAt: new Date('2026-07-08T17:20:00.000Z'),
      }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'received_before_unplug' });
  });

  it('rejects binding mismatch', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ providerBindingId: 'binding-other' }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'binding_mismatch' });
  });

  it('rejects OEM hardware', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ hardwareType: 'SMART5' }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'non_physical_obd_hardware' });
  });

  it('rejects synthetic snapshot source', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ sourceSubtype: 'SYNTHETIC_DEVICE' }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'synthetic_snapshot_source' });
  });

  it('is idempotent for same snapshot on resolved episode', () => {
    const snapshotRef = 'vls:state-1:obd:2026-07-08T17:22:00.000Z';
    const result = evaluateSnapshotPlugResolution(
      baseInput({ snapshotReferenceId: snapshotRef }),
      openEpisode({
        status: DeviceConnectionEpisodeStatus.RESOLVED,
        resolutionSnapshotId: snapshotRef,
        resolutionMethod: DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
        resolvedAt: new Date('2026-07-08T17:22:00.000Z'),
      }),
    );
    expect(result).toEqual({ action: 'noop', reason: 'same_snapshot_already_applied' });
  });

  it('rejects cross-tenant organization mismatch', () => {
    const result = evaluateSnapshotPlugResolution(
      baseInput({ organizationId: 'org-b' }),
      openEpisode(),
    );
    expect(result).toEqual({ action: 'reject', reason: 'organization_mismatch' });
  });

  it('extracts obd plug signal and provider timestamp from snapshot payload', () => {
    const extracted = extractObdPlugSignalFromSnapshot({
      obdIsPluggedIn: { value: true, timestamp: '2026-07-08T17:21:28.000Z' },
    });
    expect(extracted.obdIsPluggedIn).toBe(true);
    expect(extracted.providerObservedAt?.toISOString()).toBe('2026-07-08T17:21:28.000Z');
  });

  it('builds stable snapshot reference ids', () => {
    const ref = buildSnapshotReferenceId({
      vehicleLatestStateId: 'vls-1',
      providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
    });
    expect(ref).toBe('vls:vls-1:obd:2026-07-08T17:22:00.000Z');
  });

  it('identifies physical OBD hardware and sources', () => {
    expect(isPhysicalObdHardware('LTE_R1')).toBe(true);
    expect(isPhysicalObdHardware('SMART5')).toBe(false);
    expect(isPhysicalObdSnapshotSource({ snapshotSource: 'dimo', sourceSubtype: null })).toBe(
      true,
    );
    expect(
      isPhysicalObdSnapshotSource({
        snapshotSource: 'dimo',
        sourceSubtype: 'SYNTHETIC_ONLY',
      }),
    ).toBe(false);
  });
});
