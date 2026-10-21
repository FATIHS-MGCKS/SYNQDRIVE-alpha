import { ReferenceCaptureSessionStatus } from '@prisma/client';
import {
  assessPrearmFreshness,
  describeFastGoStatusRejection,
} from './reference-capture-prearm.policy';

describe('reference-capture-prearm.policy', () => {
  const baseReadiness = {
    deploymentPreflightReady: true,
    referenceDriveReady: false,
    blockers: ['reference_drive_canary_not_executed'],
    warnings: [],
    checks: {},
    assessedAt: new Date().toISOString(),
  };

  const basePreflight = {
    availableSignals: ['speed'],
    broadObservationFields: [],
    broadObservationFieldCount: 1,
    manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
    manifestVersion: '1.1.0',
    connectionProfile: 'DIMO_LTE_R1',
    powertrainProfile: 'ICE_GASOLINE',
    hardwareProfile: 'LTE_R1',
    checkedAt: new Date().toISOString(),
  };

  it('accepts fresh READY session within prearm max age', () => {
    const result = assessPrearmFreshness({
      status: ReferenceCaptureSessionStatus.READY,
      vehicleId: 'veh-1',
      expectedVehicleId: 'veh-1',
      readiness: baseReadiness,
      preflight: basePreflight,
      manifestVersion: '1.1.0',
      featureEnabled: true,
      preflightMaxAgeMs: 15 * 60 * 1000,
    });
    expect(result.fresh).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('rejects stale prearm beyond configured max age', () => {
    const staleAssessedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const result = assessPrearmFreshness({
      status: ReferenceCaptureSessionStatus.READY,
      vehicleId: 'veh-1',
      expectedVehicleId: 'veh-1',
      readiness: { ...baseReadiness, assessedAt: staleAssessedAt },
      preflight: basePreflight,
      manifestVersion: '1.1.0',
      featureEnabled: true,
      preflightMaxAgeMs: 15 * 60 * 1000,
    });
    expect(result.fresh).toBe(false);
    expect(result.blockers).toContain('prearm_stale_requires_new_prearm');
  });

  it('describes non-READY statuses for fast go rejection', () => {
    expect(describeFastGoStatusRejection(ReferenceCaptureSessionStatus.CREATED)).toBe(
      'session_not_prearmed_run_prearm_first',
    );
    expect(describeFastGoStatusRejection(ReferenceCaptureSessionStatus.FAILED)).toBe(
      'session_failed_requires_new_prearm',
    );
  });
});
