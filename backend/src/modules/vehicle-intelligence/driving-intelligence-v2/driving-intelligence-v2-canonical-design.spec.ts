import {
  assertDesignInvariants,
  BRAKE_FRICTION_USE_DIRECTLY_OBSERVABLE,
  BRAKE_LOAD_FOUNDATION,
  buildCanonicalDesignArtifacts,
  CANONICAL_DESIGN_EVIDENCE_ID,
  CANONICAL_PIPELINE_STAGES,
  CURRENT_PRODUCTION_COMPONENTS,
  DESIGN_INVARIANTS,
  EPISODE_CONFIDENCE_MODEL,
  EPISODE_TAXONOMY,
  LATERAL_TIRE_LOAD_DIRECTLY_OBSERVABLE,
  PHYSICAL_EVENT_TIME_AUTHORITY,
  PRODUCTION_DETECTORS_CHANGED,
  PRODUCTION_SCORE_CHANGED,
  QUALITY_GATE_DESIGN,
  SIGNAL_AUTHORITY_MODEL,
  TIRE_LOAD_FOUNDATION,
  TRIP_FEATURE_VECTOR,
} from './driving-intelligence-v2-canonical-design';

describe('DI-EV-0034F canonical driving intelligence design', () => {
  it('1) does not use synqReceivedAt as physical event authority', () => {
    expect(SIGNAL_AUTHORITY_MODEL.DELIVERY_DIAGNOSTIC_ONLY.forbiddenUse).toBe(
      'physical_event_time_authority',
    );
    expect(SIGNAL_AUTHORITY_MODEL.DELIVERY_DIAGNOSTIC_ONLY.timestamps).toContain('synqReceivedAt');
    expect(PHYSICAL_EVENT_TIME_AUTHORITY).toBe('providerTimestamp');
    expect(DESIGN_INVARIANTS.synqReceivedAtNotPhysicalAuthority).toBe(true);
  });

  it('2) does not assume 1 Hz physical cadence', () => {
    expect(SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.medianPhysicalCadenceSeconds).toBe(2.0);
    const preprocess = CURRENT_PRODUCTION_COMPONENTS.find((c) => c.id === 'hf_preprocessing');
    expect(preprocess?.rd003Conflict).toMatch(/2s|cadence/i);
    expect(DESIGN_INVARIANTS.noAssumed1HzPhysicalCadence).toBe(true);
  });

  it('3) does not differentiate across stale duplicates', () => {
    expect(QUALITY_GATE_DESIGN.rejectConditions).toContain('duplicate_physical_sample_for_derivative');
    expect(QUALITY_GATE_DESIGN.rejectConditions).toContain('stale_hold_sample_for_derivative');
    expect(DESIGN_INVARIANTS.noDerivativeAcrossStaleDuplicates).toBe(true);
  });

  it('4) does not classify every deceleration as braking', () => {
    expect(EPISODE_TAXONOMY.coreTypes).toContain('DECELERATION_EPISODE');
    expect(EPISODE_TAXONOMY.semanticDistinctions.BRAKING_LIKELIHOOD).toMatch(/NOT default/i);
    expect(BRAKE_LOAD_FOUNDATION.futureModel.ESTIMATED_FRICTION_BRAKE_LOAD.directlyObservable).toBe(false);
    expect(DESIGN_INVARIANTS.decelerationNotEquivalentToBraking).toBe(true);
  });

  it('5) does not use engine load as vehicle mass', () => {
    expect(SIGNAL_AUTHORITY_MODEL.POWERTRAIN_STRESS_CONTEXT.forbiddenInterpretation).toContain(
      'vehicle_mass',
    );
    expect(EPISODE_TAXONOMY.semanticDistinctions.ENGINE_LOAD).toMatch(/Powertrain demand/i);
    expect(BRAKE_LOAD_FOUNDATION.forbidden).toContain('infer_mass_from_obdEngineLoad');
    expect(DESIGN_INVARIANTS.engineLoadNotVehicleMass).toBe(true);
  });

  it('6) does not claim exact gear shift timing', () => {
    expect(SIGNAL_AUTHORITY_MODEL.STATE_CONTEXT.gearChangeTimingSupported).toBe(false);
    expect(EPISODE_TAXONOMY.semanticDistinctions.GEAR_SHIFT_TIME).toMatch(/NOT_SUPPORTED/i);
    expect(DESIGN_INVARIANTS.noExactGearShiftTiming).toBe(true);
  });

  it('7) does not treat raw jerk as direct authority', () => {
    expect(SIGNAL_AUTHORITY_MODEL.DERIVED_KINEMATICS.jerk.directHarshEventAuthority).toBe(false);
    expect(SIGNAL_AUTHORITY_MODEL.DERIVED_KINEMATICS.jerk.rating).toBe('EPISODE_CONTEXT_ONLY');
    expect(DESIGN_INVARIANTS.jerkNotDirectAuthority).toBe(true);
  });

  it('8) does not use LATEST_LIVE without freshness gating', () => {
    const note = SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.notes.join(' ');
    expect(note).toMatch(/freshness proven/i);
    expect(SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.acquisitionSurface).toBe('HF_HISTORICAL');
    expect(DESIGN_INVARIANTS.latestLiveRequiresFreshnessGating).toBe(true);
  });

  it('9) requires episode confidence before score calculation', () => {
    expect(EPISODE_CONFIDENCE_MODEL.rule).toMatch(/without episode confidence/i);
    expect(EPISODE_CONFIDENCE_MODEL.factors.length).toBeGreaterThanOrEqual(8);
    expect(DESIGN_INVARIANTS.scoreRequiresEpisodeConfidence).toBe(true);
  });

  it('10) does not use raw event count without exposure normalization', () => {
    expect(TRIP_FEATURE_VECTOR.normalization.rawEventCountAlone).toBe(false);
    expect(TRIP_FEATURE_VECTOR.normalization.per100Km).toBe(true);
    expect(TRIP_FEATURE_VECTOR.exposureNormalization).toMatch(/REQUIRED/i);
    expect(DESIGN_INVARIANTS.noRawEventCountWithoutExposureNormalization).toBe(true);
  });

  it('11) does not claim lateral tire load when lateral evidence unavailable', () => {
    expect(TIRE_LOAD_FOUNDATION.futureComponents.LATERAL_TIRE_LOAD.observable).toBe(
      'NOT_YET_OBSERVABLE',
    );
    expect(LATERAL_TIRE_LOAD_DIRECTLY_OBSERVABLE).toBe(false);
    expect(TIRE_LOAD_FOUNDATION.forbidden).toContain(
      'manufacture_cornering_load_from_insufficient_data',
    );
    expect(DESIGN_INVARIANTS.noLateralTireLoadWithoutEvidence).toBe(true);
  });

  it('12) does not modify production Driving Score or detectors', () => {
    expect(PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    const scorer = CURRENT_PRODUCTION_COMPONENTS.find((c) => c.id === 'driving_impact_scorer');
    expect(scorer?.note).toBe('PRODUCTION_UNCHANGED_DI_EV_0034F');
    expect(DESIGN_INVARIANTS.productionScoreUnchanged).toBe(true);
  });

  it('13) exports complete artifact bundle and passes aggregate invariant check', () => {
    const artifacts = buildCanonicalDesignArtifacts();
    expect(artifacts['design-summary.json']).toMatchObject({
      evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
      PRODUCTION_SCORE_CHANGED: 'NO',
    });
    expect(Object.keys(artifacts)).toHaveLength(14);
    expect(CANONICAL_PIPELINE_STAGES).toHaveLength(12);
    expect(() => assertDesignInvariants()).not.toThrow();
    expect(BRAKE_FRICTION_USE_DIRECTLY_OBSERVABLE).toBe(false);
  });
});
