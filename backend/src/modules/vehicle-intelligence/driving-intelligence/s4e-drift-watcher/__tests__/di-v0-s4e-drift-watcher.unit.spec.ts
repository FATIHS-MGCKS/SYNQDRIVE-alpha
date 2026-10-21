import { classifyDriftSupersedeReason, scopeCorruptionForCandidate, type DiV0S4DriftWatchCandidate } from '../di-v0-s4e-drift-candidates';
import { DI_V0_S4E_DRIFT_HORIZON_SECONDS, isDiV0S4DriftWatcherConfigured } from '../di-v0-s4e-config';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';

describe('DI V0 S4E drift watcher (unit)', () => {
  it('uses the frozen 10-day drift horizon', () => {
    expect(DI_V0_S4E_DRIFT_HORIZON_SECONDS).toBe(864_000);
  });

  it('classifies supersession reasons from canonical trip status', () => {
    expect(classifyDriftSupersedeReason('COMPLETED')).toBe('BOUNDARY_CHANGED');
    expect(classifyDriftSupersedeReason('CANCELLED')).toBe('TRIP_CANCELLED');
    expect(classifyDriftSupersedeReason('ONGOING')).toBe('TRIP_NOT_COMPLETED');
  });

  it('S4E-D13 scope corruption — fail closed before T11', () => {
    const base: DiV0S4DriftWatchCandidate = {
      workItemId: 'wi',
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      tripId: 'trip',
      storedFingerprint: 'fp-old',
      status: 'PENDING',
      runPurpose: 'PRIMARY',
      leaseEpoch: BigInt(0),
      settlementAnchorAt: new Date(),
      tripStatus: 'COMPLETED',
      canonicalFingerprint: 'fp-new',
      canonicalOrganizationId: 'org-a',
      tripVehicleId: 'veh-a',
    };
    expect(scopeCorruptionForCandidate(base, base.tripVehicleId)).toBeNull();
    expect(scopeCorruptionForCandidate({ ...base, organizationId: 'org-b' }, base.tripVehicleId)).toBe('ORGANIZATION_MISMATCH');
    expect(scopeCorruptionForCandidate({ ...base, vehicleId: 'veh-b' }, 'veh-a')).toBe('VEHICLE_MISMATCH');
  });

  it('is configured only when S4 master is enabled', () => {
    const on = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
    const off = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'false' });
    expect(isDiV0S4DriftWatcherConfigured(on)).toBe(true);
    expect(isDiV0S4DriftWatcherConfigured(off)).toBe(false);
  });
});
