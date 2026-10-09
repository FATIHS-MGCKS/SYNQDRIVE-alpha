import {
  RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
  RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  buildCandidateIdentityKey,
  isSupportedCandidateDetectionVersionForIdentity,
  tryBuildCandidateIdentityKeyFromEvidence,
} from './raw-refuel-candidate-identity-key';
import { buildPhysicalCandidateIdentityKeyV1 } from './raw-refuel-candidate-physical-identity.authority';

describe('candidate identity routing (immutable anchors)', () => {
  const riseOnsetAt = new Date('2026-09-30T04:58:04.772Z');
  const vehicleId = 'veh-routing';

  it('routes v1 legacy anchor to legacy builder', () => {
    const key = tryBuildCandidateIdentityKeyFromEvidence({
      vehicleId,
      detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
      signalChannel: 'ABSOLUTE_LITERS',
      riseOnsetAt,
      preFuelAbsoluteLiters: 6,
    });
    expect(key).toBe(
      buildCandidateIdentityKey({
        vehicleId,
        detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
        signalChannel: 'ABSOLUTE_LITERS',
        prePlateauBucket: 6,
        riseOnsetAt,
      }),
    );
  });

  it('routes v2 planned anchor to physical identity v1', () => {
    const key = tryBuildCandidateIdentityKeyFromEvidence({
      vehicleId,
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      signalChannel: 'ABSOLUTE_LITERS',
      riseOnsetAt,
      preFuelAbsoluteLiters: 6,
    });
    expect(key).toBe(
      buildPhysicalCandidateIdentityKeyV1({
        vehicleId,
        signalChannel: 'ABSOLUTE_LITERS',
        prePlateauBucket: 6,
        riseOnsetAt,
      }),
    );
  });

  it('does not treat hypothetical active-runtime v2 string as legacy when only legacy anchor is registered', () => {
    expect(isSupportedCandidateDetectionVersionForIdentity('rfrf-rise-v2')).toBe(true);
    expect(isSupportedCandidateDetectionVersionForIdentity('rfrf-rise-v99')).toBe(false);
    expect(
      tryBuildCandidateIdentityKeyFromEvidence({
        vehicleId,
        detectionVersion: 'rfrf-rise-v99',
        signalChannel: 'ABSOLUTE_LITERS',
        riseOnsetAt,
        preFuelAbsoluteLiters: 6,
      }),
    ).toBeNull();
  });
});
