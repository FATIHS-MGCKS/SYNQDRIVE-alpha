import {
  buildPhysicalCandidateIdentityKeyV1,
  RFRF_CANDIDATE_PHYSICAL_IDENTITY_AUTHORITY_V1,
} from './raw-refuel-candidate-physical-identity.authority';
import {
  classifyCandidateDetectionVersionCompatibility,
  listAuthorizedCrossVersionPairsV1,
  RFRF_CANDIDATE_CROSS_VERSION_COMPATIBILITY_V1,
  RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  classifyPostFuelAuthorityTransition,
  type RawRefuelPostFuelAuthority,
} from './raw-refuel-post-fuel-authority.types';
import {
  classifyVersionedTerminalConflict,
  crossVersionPrePlateauQualifiesForSame,
  mapNullPreCompatibilityForCrossVersion,
  NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT,
  VERSIONED_TERMINAL_CONFLICT_FAIL_CLOSED,
} from './raw-refuel-candidate-cross-version-overlap.contract';
import {
  parseRfrfSettledPostF3Activation,
  parseRfrfSettledPostF3ActivationIgnoringHybridEnv,
  RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
  RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV,
  RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON_ENV,
} from './rfrf-settled-post-f3-activation.authority';
import {
  assertCompleteProductionCalibrationBundle,
  RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1,
} from './rfrf-settled-post-production-calibration.types';
import { buildCandidateIdentityKey as legacyBuildCandidateIdentityKey } from './raw-refuel-candidate-identity-key';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

describe('EED OQ-014 R1 — physical identity authority', () => {
  const basePhysical = {
    vehicleId: 'veh-661',
    signalChannel: 'ABSOLUTE_LITERS' as const,
    prePlateauBucket: 6,
    riseOnsetAt: new Date('2026-09-30T14:15:00.000Z'),
  };

  it('P1 same physical input deterministic', () => {
    const a = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const b = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('P2 detectionVersion independence', () => {
    const physical = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const legacyV1 = legacyBuildCandidateIdentityKey({
      ...basePhysical,
      detectionVersion: RFRF_RISE_DETECTION_VERSION,
    });
    const legacyV2 = legacyBuildCandidateIdentityKey({
      ...basePhysical,
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    });
    expect(legacyV1).not.toBe(legacyV2);
    expect(physical).not.toBe(legacyV1);
    expect(physical).not.toBe(legacyV2);
  });

  it('P3 vehicle separation', () => {
    const a = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const b = buildPhysicalCandidateIdentityKeyV1({ ...basePhysical, vehicleId: 'veh-other' });
    expect(a).not.toBe(b);
  });

  it('P4 channel separation', () => {
    const a = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const b = buildPhysicalCandidateIdentityKeyV1({
      ...basePhysical,
      signalChannel: 'RELATIVE_PERCENT',
    });
    expect(a).not.toBe(b);
  });

  it('P5 pre bucket separation', () => {
    const a = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const b = buildPhysicalCandidateIdentityKeyV1({ ...basePhysical, prePlateauBucket: 7 });
    expect(a).not.toBe(b);
  });

  it('P6 rise bucket separation', () => {
    const a = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    const b = buildPhysicalCandidateIdentityKeyV1({
      ...basePhysical,
      riseOnsetAt: new Date('2026-09-30T14:09:00.000Z'),
    });
    expect(a).not.toBe(b);
  });

  it('P7 domain/version separation', () => {
    expect(RFRF_CANDIDATE_PHYSICAL_IDENTITY_AUTHORITY_V1).toContain('physical-identity');
    const key = buildPhysicalCandidateIdentityKeyV1(basePhysical);
    expect(key).not.toContain(RFRF_CANDIDATE_PHYSICAL_IDENTITY_AUTHORITY_V1);
  });

  it('P8 existing legacy builder unchanged', () => {
    const input = {
      vehicleId: 'veh-legacy',
      detectionVersion: 'rfrf-rise-v1',
      signalChannel: 'ABSOLUTE_LITERS' as const,
      prePlateauBucket: 6,
      riseOnsetAt: new Date('2026-09-30T14:15:00.000Z'),
    };
    expect(legacyBuildCandidateIdentityKey(input)).toBe(legacyBuildCandidateIdentityKey(input));
  });
});

describe('EED OQ-014 R1 — cross-version compatibility authority', () => {
  it('V1 same version', () => {
    expect(
      classifyCandidateDetectionVersionCompatibility({
        observationDetectionVersion: RFRF_RISE_DETECTION_VERSION,
        candidateDetectionVersion: RFRF_RISE_DETECTION_VERSION,
      }),
    ).toBe('SAME_VERSION');
  });

  it('V2 explicitly authorized v2→v1', () => {
    expect(
      classifyCandidateDetectionVersionCompatibility({
        observationDetectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
        candidateDetectionVersion: RFRF_RISE_DETECTION_VERSION,
      }),
    ).toBe('AUTHORIZED_CROSS_VERSION');
    expect(listAuthorizedCrossVersionPairsV1()).toEqual([
      {
        observationDetectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
        candidateDetectionVersion: RFRF_RISE_DETECTION_VERSION,
      },
    ]);
    expect(RFRF_CANDIDATE_CROSS_VERSION_COMPATIBILITY_V1).toBe(
      'rfrf-candidate-cross-version-compatibility-v1',
    );
  });

  it('V3 reverse direction not implicitly authorized', () => {
    expect(
      classifyCandidateDetectionVersionCompatibility({
        observationDetectionVersion: RFRF_RISE_DETECTION_VERSION,
        candidateDetectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      }),
    ).toBe('UNAUTHORIZED_VERSION_PAIR');
  });

  it('V4 unknown future version fails closed', () => {
    expect(
      classifyCandidateDetectionVersionCompatibility({
        observationDetectionVersion: 'rfrf-rise-v99',
        candidateDetectionVersion: RFRF_RISE_DETECTION_VERSION,
      }),
    ).toBe('UNAUTHORIZED_VERSION_PAIR');
  });

  it('V5 malformed/empty version fails closed', () => {
    expect(
      classifyCandidateDetectionVersionCompatibility({
        observationDetectionVersion: '  ',
        candidateDetectionVersion: RFRF_RISE_DETECTION_VERSION,
      }),
    ).toBe('UNAUTHORIZED_VERSION_PAIR');
  });
});

describe('EED OQ-014 R1 — post fuel authority transition', () => {
  const peak: RawRefuelPostFuelAuthority = 'PEAK_INSTANTANEOUS';
  const settled: RawRefuelPostFuelAuthority = 'SETTLED_MEDIAN';

  it('A1 PEAK→SETTLED permitted only under authorized pair', () => {
    expect(
      classifyPostFuelAuthorityTransition({
        observationAuthority: settled,
        candidateAuthority: peak,
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
      }),
    ).toBe('AUTHORIZED_AUTHORITY_SHIFT');
  });

  it('A2 SETTLED→PEAK not implicitly permitted', () => {
    expect(
      classifyPostFuelAuthorityTransition({
        observationAuthority: peak,
        candidateAuthority: settled,
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
      }),
    ).toBe('UNAUTHORIZED_AUTHORITY_SHIFT');
  });

  it('A3 same-version mismatch gets no special bridge', () => {
    expect(
      classifyPostFuelAuthorityTransition({
        observationAuthority: settled,
        candidateAuthority: peak,
        versionCompatibility: 'SAME_VERSION',
      }),
    ).toBe('UNAUTHORIZED_AUTHORITY_SHIFT');
  });
});

describe('EED OQ-014 R1 — terminal conflict contract', () => {
  it('T1 REJECTED maps conceptually to terminal conflict', () => {
    expect(
      classifyVersionedTerminalConflict({
        existingLifecycleState: 'REJECTED',
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
        physicalNeighborhoodCorresponds: true,
      }),
    ).toBe('VERSIONED_TERMINAL_CONFLICT');
  });

  it('T2 PROMOTED terminal', () => {
    expect(
      classifyVersionedTerminalConflict({
        existingLifecycleState: 'PROMOTED',
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
        physicalNeighborhoodCorresponds: true,
      }),
    ).toBe('VERSIONED_TERMINAL_CONFLICT');
  });

  it('T3 CONVERGED_NATIVE terminal', () => {
    expect(
      classifyVersionedTerminalConflict({
        existingLifecycleState: 'CONVERGED_NATIVE',
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
        physicalNeighborhoodCorresponds: true,
      }),
    ).toBe('VERSIONED_TERMINAL_CONFLICT');
  });

  it('T4 non-terminal does not produce terminal conflict', () => {
    expect(
      classifyVersionedTerminalConflict({
        existingLifecycleState: 'OBSERVED',
        versionCompatibility: 'AUTHORIZED_CROSS_VERSION',
        physicalNeighborhoodCorresponds: true,
      }),
    ).toBeNull();
    expect(VERSIONED_TERMINAL_CONFLICT_FAIL_CLOSED.SECOND_CANDIDATE_INSERTED).toBe(false);
  });
});

describe('EED OQ-014 R1 — cross-version pre plateau invariants', () => {
  it('NULL pre compatibility cannot SAME', () => {
    expect(crossVersionPrePlateauQualifiesForSame(null)).toBe(false);
    expect(mapNullPreCompatibilityForCrossVersion(null)).toBe(
      NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT,
    );
    expect(NULL_PRE_COMPATIBILITY_CROSS_VERSION_RESULT).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('EED OQ-014 R1 — settled F3 activation parser', () => {
  it('M1 missing OFF', () => {
    const parsed = parseRfrfSettledPostF3Activation({});
    expect(parsed.mode).toBe('OFF');
    expect(parsed.valid).toBe(true);
    expect(parsed.authorityVersion).toBe(RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1);
  });

  it('M2 OFF', () => {
    expect(
      parseRfrfSettledPostF3Activation({ [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'off' }).mode,
    ).toBe('OFF');
  });

  it('M3 SHADOW', () => {
    const parsed = parseRfrfSettledPostF3Activation({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'SHADOW',
    });
    expect(parsed.mode).toBe('SHADOW');
    expect(parsed.valid).toBe(true);
  });

  it('M4 ALPHA_ALLOWLIST', () => {
    const parsed = parseRfrfSettledPostF3Activation({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
      [RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON_ENV]: JSON.stringify({
        organizationIds: ['org-a'],
        vehicleIds: ['veh-661'],
      }),
    });
    expect(parsed.mode).toBe('ALPHA_ALLOWLIST');
    expect(parsed.valid).toBe(true);
    expect(parsed.alphaScope?.vehicleIds).toContain('veh-661');
  });

  it('M5 GLOBAL recognized but NOT authorized by R1', () => {
    const parsed = parseRfrfSettledPostF3Activation({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'GLOBAL',
    });
    expect(parsed.mode).toBe('OFF');
    expect(parsed.valid).toBe(false);
    expect(parsed.invalidReason).toBe('global_mode_not_authorized_in_r1');
  });

  it('M6 unknown fail closed', () => {
    const parsed = parseRfrfSettledPostF3Activation({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'YOLO',
    });
    expect(parsed.mode).toBe('OFF');
    expect(parsed.valid).toBe(false);
  });

  it('M7 malformed scope fail closed', () => {
    const parsed = parseRfrfSettledPostF3Activation({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
      [RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON_ENV]: '{not-json',
    });
    expect(parsed.mode).toBe('OFF');
    expect(parsed.valid).toBe(false);
  });

  it('M8 Hybrid activation has no effect', () => {
    const withHybrid = parseRfrfSettledPostF3ActivationIgnoringHybridEnv({
      [RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV]: 'SHADOW',
      RFRF_HYBRID_TRUST_ACTIVATION_ENABLED: 'true',
    });
    expect(withHybrid.mode).toBe('SHADOW');
  });
});

describe('EED OQ-014 R1 — production calibration firewall', () => {
  it('rejects incomplete bundles (no defaults)', () => {
    expect(assertCompleteProductionCalibrationBundle(null)).toBe(false);
    expect(assertCompleteProductionCalibrationBundle({})).toBe(false);
    expect(
      assertCompleteProductionCalibrationBundle({
        authorityVersion: RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1,
        maxPeakToSettledDropLiters: 1,
      }),
    ).toBe(false);
  });

  it('accepts fully specified bundle only', () => {
    expect(
      assertCompleteProductionCalibrationBundle({
        authorityVersion: RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1,
        maxPeakToSettledDropLiters: 1,
        maxPeakToSettledDropRatioOfRise: 0.1,
        maxPeakToSettledContinuityGapMs: 60_000,
      }),
    ).toBe(true);
  });
});

describe('EED OQ-014 R1 — runtime version invariance constants', () => {
  it('detector/detection versions unchanged on main', () => {
    expect(RFRF_RISE_DETECTION_VERSION).toBe('rfrf-rise-v1');
    expect(RFRF_RISE_DETECTOR_VERSION).toBe('rfrf-rise-detector-v1');
  });
});
