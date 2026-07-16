import {
  applyModelProfileToStressScores,
  areDrivingImpactModelProfilesComparable,
  buildDrivingImpactModelProfileManifest,
  hasBehavioralEvidenceForProfile,
  resolveDrivingImpactModelProfile,
} from './driving-impact-model-profile';
import { DRIVING_IMPACT_MODEL_PROFILES } from './driving-impact-model-profile.config';
import { readTripDrivingImpactModelProfile } from './driving-impact-model-profile.reader';

const SAME_TRIP_COUNTS = {
  hardAccel: 0,
  extremeAccel: 0,
  hardBrake: 0,
  extremeBrake: 0,
  fullBraking: 0,
  kickdown: 0,
  launchLike: 0,
  brakesTotal: 0,
};

const SAME_TRIP_RAW_SCORES = {
  longitudinalStressScore: 12,
  brakingStressScore: 8,
  stopGoStressScore: 15,
  highSpeedStressScore: 10,
  thermalBrakeStressScore: 6,
};

describe('resolveDrivingImpactModelProfile', () => {
  it('resolves LTE_R1_NATIVE for LTE_R1 without engine signals', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
      engineSignalsAvailable: false,
    });
    expect(profile.profile).toBe('LTE_R1_NATIVE');
    expect(profile.behavioralIngestionPath).toBe('TELEMETRY_EVENTS');
    expect(profile.nativeEventCapable).toBe(true);
  });

  it('resolves ICE_SIGNAL_CONTEXT for LTE_R1 with engine signals', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'LTE_R1',
      fuelType: 'DIESEL',
      engineSignalsAvailable: true,
    });
    expect(profile.profile).toBe('ICE_SIGNAL_CONTEXT');
    expect(profile.engineContextCapable).toBe(true);
    expect(profile.availableLoadComponents).toContain('engineLoad');
  });

  it('resolves SMART5_LIMITED for SMART5 hardware', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'SMART5',
      fuelType: 'PETROL',
    });
    expect(profile.profile).toBe('SMART5_LIMITED');
    expect(profile.nativeEventCapable).toBe(false);
    expect(profile.behavioralIngestionPath).toBe('HF_DERIVED');
  });

  it('resolves TESLA_LIMITED for EV with native path on LTE_R1', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'LTE_R1',
      fuelType: 'ELECTRIC',
    });
    expect(profile.profile).toBe('TESLA_LIMITED');
    expect(profile.behavioralIngestionPath).toBe('TELEMETRY_EVENTS');
    expect(profile.nativeEventCapable).toBe(true);
    expect(profile.comparabilityGroup).toBe('EV_LIMITED');
  });

  it('resolves TESLA_LIMITED HF path for SMART5 EV', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'SMART5',
      fuelType: 'BEV',
    });
    expect(profile.profile).toBe('TESLA_LIMITED');
    expect(profile.behavioralIngestionPath).toBe('HF_DERIVED');
    expect(profile.nativeEventCapable).toBe(false);
  });

  it('resolves UNKNOWN_LIMITED for unknown hardware', () => {
    const profile = resolveDrivingImpactModelProfile({
      hardwareType: 'UNKNOWN',
      fuelType: 'PETROL',
    });
    expect(profile.profile).toBe('UNKNOWN_LIMITED');
  });
});

describe('applyModelProfileToStressScores — same trip, different capabilities', () => {
  const evidence = {
    nativeEventCount: 0,
    hfEventCount: 0,
    primarySource: 'STRESS_ONLY',
    counts: SAME_TRIP_COUNTS,
  };

  it('LTE_R1_NATIVE: zero native events still yields assessable low stress (calm trip)', () => {
    const profile = DRIVING_IMPACT_MODEL_PROFILES.LTE_R1_NATIVE;
    const gated = applyModelProfileToStressScores({
      profile,
      evidence: { ...evidence, primarySource: 'PROVIDER_CLASSIFIED' },
      scores: SAME_TRIP_RAW_SCORES,
    });
    expect(gated.gatingApplied).toBe(false);
    expect(gated.drivingStressScore).toBe(10.9);
    expect(gated.longitudinalStressScore).toBe(12);
  });

  it('SMART5_LIMITED: zero HF events suppresses scores (not positive calm)', () => {
    const profile = DRIVING_IMPACT_MODEL_PROFILES.SMART5_LIMITED;
    expect(hasBehavioralEvidenceForProfile(profile, evidence)).toBe(false);
    const gated = applyModelProfileToStressScores({
      profile,
      evidence,
      scores: SAME_TRIP_RAW_SCORES,
    });
    expect(gated.gatingApplied).toBe(true);
    expect(gated.drivingStressScore).toBeNull();
    expect(gated.reasonCodes).toContain('BEHAVIORAL_EVIDENCE_ABSENT');
    expect(gated.reasonCodes).toContain('NATIVE_EVENTS_NOT_CAPABLE');
  });

  it('SMART5_LIMITED: HF events allow scoring', () => {
    const profile = DRIVING_IMPACT_MODEL_PROFILES.SMART5_LIMITED;
    const gated = applyModelProfileToStressScores({
      profile,
      evidence: {
        ...evidence,
        hfEventCount: 8,
        primarySource: 'RECONSTRUCTED',
      },
      scores: SAME_TRIP_RAW_SCORES,
    });
    expect(gated.drivingStressScore).toBe(10.9);
    expect(gated.gatingApplied).toBe(false);
  });

  it('UNKNOWN_LIMITED: zero counts and zero HF events suppresses scores', () => {
    const profile = DRIVING_IMPACT_MODEL_PROFILES.UNKNOWN_LIMITED;
    const gated = applyModelProfileToStressScores({
      profile,
      evidence: {
        nativeEventCount: 0,
        hfEventCount: 0,
        primarySource: 'STRESS_ONLY',
        counts: SAME_TRIP_COUNTS,
      },
      scores: SAME_TRIP_RAW_SCORES,
    });
    expect(gated.drivingStressScore).toBeNull();
  });

  it('UNKNOWN_LIMITED: canonical HF counters allow scoring', () => {
    const profile = DRIVING_IMPACT_MODEL_PROFILES.UNKNOWN_LIMITED;
    const gated = applyModelProfileToStressScores({
      profile,
      evidence: {
        nativeEventCount: 0,
        hfEventCount: 0,
        primarySource: 'STRESS_ONLY',
        counts: {
          ...SAME_TRIP_COUNTS,
          hardAccel: 4,
          hardBrake: 6,
        },
      },
      scores: SAME_TRIP_RAW_SCORES,
    });
    expect(gated.drivingStressScore).toBe(10.9);
  });
});

describe('cross-fleet comparability', () => {
  it('LTE_R1_NATIVE and ICE_SIGNAL_CONTEXT are comparable', () => {
    const lte = buildDrivingImpactModelProfileManifest(
      DRIVING_IMPACT_MODEL_PROFILES.LTE_R1_NATIVE,
      { gatingApplied: false, reasonCodes: [] },
    );
    const ice = buildDrivingImpactModelProfileManifest(
      DRIVING_IMPACT_MODEL_PROFILES.ICE_SIGNAL_CONTEXT,
      { gatingApplied: false, reasonCodes: [] },
    );
    expect(areDrivingImpactModelProfilesComparable(lte, ice)).toBe(true);
  });

  it('SMART5_LIMITED is not comparable with LTE_R1_NATIVE', () => {
    const lte = buildDrivingImpactModelProfileManifest(
      DRIVING_IMPACT_MODEL_PROFILES.LTE_R1_NATIVE,
      { gatingApplied: false, reasonCodes: [] },
    );
    const smart5 = buildDrivingImpactModelProfileManifest(
      DRIVING_IMPACT_MODEL_PROFILES.SMART5_LIMITED,
      { gatingApplied: false, reasonCodes: [] },
    );
    expect(areDrivingImpactModelProfilesComparable(lte, smart5)).toBe(false);
  });

  it('HF proxy path is not comparable with native telemetry path within EV group', () => {
    const evNative = buildDrivingImpactModelProfileManifest(
      resolveDrivingImpactModelProfile({
        hardwareType: 'LTE_R1',
        fuelType: 'ELECTRIC',
      }),
      { gatingApplied: false, reasonCodes: [] },
    );
    const evHf = buildDrivingImpactModelProfileManifest(
      resolveDrivingImpactModelProfile({
        hardwareType: 'SMART5',
        fuelType: 'ELECTRIC',
      }),
      { gatingApplied: false, reasonCodes: [] },
    );
    expect(areDrivingImpactModelProfilesComparable(evNative, evHf)).toBe(false);
  });
});

describe('readTripDrivingImpactModelProfile', () => {
  it('reads manifest from sourceSummaryJson', () => {
    const manifest = buildDrivingImpactModelProfileManifest(
      DRIVING_IMPACT_MODEL_PROFILES.SMART5_LIMITED,
      { gatingApplied: true, reasonCodes: ['BEHAVIORAL_EVIDENCE_ABSENT'] },
    );
    const read = readTripDrivingImpactModelProfile({ modelProfile: manifest });
    expect(read?.profile).toBe('SMART5_LIMITED');
    expect(read?.gatingApplied).toBe(true);
  });

  it('returns null for legacy rows without modelProfile', () => {
    expect(readTripDrivingImpactModelProfile({})).toBeNull();
  });
});
