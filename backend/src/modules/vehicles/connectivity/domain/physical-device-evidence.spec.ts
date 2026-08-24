import { derivePhysicalDeviceEvidence, physicalDeviceStateToConnectionStatus } from './physical-device-evidence';
import { PhysicalDeviceState } from './connectivity-domain.types';
import { ConnectivityReasonCode } from './connectivity-domain.types';

const NOW = new Date('2026-08-24T12:00:00.000Z').getTime();

describe('derivePhysicalDeviceEvidence', () => {
  const base = {
    physicalObdApplicable: true,
    nowMs: NOW,
    latestValidSnapshotAt: null,
    latestAcceptedUnplugEventAt: null,
  };

  it('Test F — newer snapshot resolves older unplug', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      latestAcceptedUnplugEventAt: new Date('2026-07-20T12:00:00.000Z'),
      latestValidSnapshotAt: new Date('2026-07-20T12:08:00.000Z'),
    });
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_INFERRED);
    expect(result.winningEvidence).toBe('snapshot');
    expect(physicalDeviceStateToConnectionStatus(result.physicalDeviceState)).toBe('plugged');
  });

  it('Test G — newer unplug overrides snapshot', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      latestValidSnapshotAt: new Date('2026-08-24T11:55:00.000Z'),
      latestAcceptedUnplugEventAt: new Date('2026-08-24T12:00:00.000Z'),
    });
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.UNPLUGGED_CONFIRMED);
    expect(result.winningEvidence).toBe('unplug_event');
  });

  it('Test H — no unplug + >48h telemetry silence derives unknown + device_check_required', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      latestValidSnapshotAt: new Date('2026-07-01T12:00:00.000Z'),
      latestAcceptedUnplugEventAt: null,
    });
    expect(result.telemetryFreshness).toBe('offline');
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
    expect(result.physicalDeviceState).not.toBe(PhysicalDeviceState.UNPLUGGED_CONFIRMED);
    expect(result.reasonCodes).toContain(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
  });

  it('historical unplug followed by later snapshots resolves connected', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      latestAcceptedUnplugEventAt: new Date('2026-07-20T12:00:00.000Z'),
      latestValidSnapshotAt: new Date('2026-07-22T08:00:00.000Z'),
    });
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_INFERRED);
  });

  it('explicit plug event newer than unplug resolves connected', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      latestAcceptedUnplugEventAt: new Date('2026-07-11T18:39:45.000Z'),
      latestAcceptedPlugEventAt: new Date('2026-07-11T19:00:00.000Z'),
    });
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_CONFIRMED);
    expect(result.winningEvidence).toBe('plug_event');
    expect(physicalDeviceStateToConnectionStatus(result.physicalDeviceState)).toBe('plugged');
  });

  it('returns NOT_APPLICABLE when physical OBD does not apply', () => {
    const result = derivePhysicalDeviceEvidence({
      ...base,
      physicalObdApplicable: false,
    });
    expect(result.physicalDeviceState).toBe(PhysicalDeviceState.NOT_APPLICABLE);
  });
});
