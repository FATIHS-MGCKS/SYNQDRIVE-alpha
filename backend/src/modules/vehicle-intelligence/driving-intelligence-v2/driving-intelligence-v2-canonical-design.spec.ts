import {
  assertDesignInvariants,
  artifactSha256,
  BRAKE_FRICTION_USE_DIRECTLY_OBSERVABLE,
  BRAKE_LOAD_FOUNDATION,
  buildCanonicalDesignArtifacts,
  buildExportManifest,
  CANONICAL_DESIGN_CLOSEOUT_REVISION,
  CANONICAL_DESIGN_EVIDENCE_ID,
  CANONICAL_PIPELINE_STAGES,
  canonicalDesignOutputSha256,
  computeForbiddenDeltaVSquaredMislabelMps2,
  computeSpecificKineticEnergyChangeMps2,
  CONTEXT_FAIRNESS,
  CURRENT_PRODUCTION_COMPONENTS,
  DESIGN_INVARIANTS,
  DRIVER_BEHAVIOR_DIMENSIONS,
  DRIVING_STATE_MODEL,
  EPISODE_CONFIDENCE_MODEL,
  EPISODE_TAXONOMY,
  HIGH_TIMEFRAME_AGGREGATION,
  LATERAL_TIRE_LOAD_DIRECTLY_OBSERVABLE,
  MIGRATION_PLAN,
  PHYSICAL_EVENT_TIME_AUTHORITY,
  PRODUCTION_DETECTORS_CHANGED,
  PRODUCTION_SCORE_CHANGED,
  PROVIDER_AGE_POLICY,
  QUALITY_GATE_DESIGN,
  RD003_AUTHORITY_PATH,
  RD004_VALIDATION_CONTRACT,
  SIGNAL_AUTHORITY_MODEL,
  TIRE_LOAD_FOUNDATION,
  TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED,
  TRIP_FEATURE_VECTOR,
  V2_AUTHORITY_CONTRACT_COMPATIBILITY,
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
    expect(EPISODE_CONFIDENCE_MODEL.rule).toMatch(/reconstruction confidence/i);
    expect(EPISODE_CONFIDENCE_MODEL.layers.RECONSTRUCTION_CONFIDENCE.factors.length).toBeGreaterThanOrEqual(8);
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

describe('DI-EV-0034F.1 architecture consistency closeout', () => {
  it('1) separates KINEMATIC_STATE from DIRECTION_CONTEXT and POWERTRAIN_DEMAND_STATE', () => {
    expect(DRIVING_STATE_MODEL.modelType).toBe('ORTHOGONAL_LAYERS');
    expect(DRIVING_STATE_MODEL.layers.KINEMATIC_STATE.values).toContain('ACCELERATING');
    expect(DRIVING_STATE_MODEL.layers.DIRECTION_CONTEXT.values).toContain('REVERSE');
    expect(DRIVING_STATE_MODEL.layers.POWERTRAIN_DEMAND_STATE.values).toContain('HIGH');
    expect(DRIVING_STATE_MODEL.layers.KINEMATIC_STATE.values).not.toContain('REVERSE');
    expect(DRIVING_STATE_MODEL.layers.TRANSITION_EPISODE_MARKERS.concepts).toContain('LAUNCH');
    expect(DESIGN_INVARIANTS.orthogonalStateLayers).toBe(true);
  });

  it('2) keeps physical severity independent from evidence confidence', () => {
    expect(EPISODE_TAXONOMY.physicalSeverityModel.forbiddenDimensions).toContain('confidence');
    expect(EPISODE_TAXONOMY.physicalSeverityModel.separatedFrom).toBe('RECONSTRUCTION_CONFIDENCE');
    expect(EPISODE_TAXONOMY.physicalSeverityModel.dimensions).not.toContain('confidence');
    expect(DESIGN_INVARIANTS.physicalSeveritySeparatedFromConfidence).toBe(true);
  });

  it('3) distinguishes RECONSTRUCTION_CONFIDENCE from ATTRIBUTION_CONFIDENCE', () => {
    expect(EPISODE_CONFIDENCE_MODEL.layers.RECONSTRUCTION_CONFIDENCE).toBeDefined();
    expect(EPISODE_CONFIDENCE_MODEL.layers.ATTRIBUTION_CONFIDENCE).toBeDefined();
    expect(CONTEXT_FAIRNESS.policy).toMatch(/ATTRIBUTION_CONFIDENCE/i);
    expect(CONTEXT_FAIRNESS.policy).not.toMatch(/reduce reconstruction confidence/i);
    expect(DESIGN_INVARIANTS.reconstructionConfidenceDistinctFromAttribution).toBe(true);
  });

  it('4) preserves native provider event authority separate from HF kinematic authority', () => {
    expect(SIGNAL_AUTHORITY_MODEL.HF_KINEMATIC_AUTHORITY_SCOPE.explicitlyNot).toBe(
      'PRIMARY_DRIVER_CONDUCT_AUTHORITY',
    );
    expect(SIGNAL_AUTHORITY_MODEL.NATIVE_PROVIDER_EVENT_AUTHORITY.evidenceClass).toBe(
      'PROVIDER_CLASSIFIED',
    );
    expect(V2_AUTHORITY_CONTRACT_COMPATIBILITY.normativeContract).toBe(
      'docs/architecture/driving-intelligence-v2.md',
    );
    expect(DESIGN_INVARIANTS.nativeEventAuthorityPreserved).toBe(true);
    expect(DESIGN_INVARIANTS.hfKinematicAuthorityScopeExplicit).toBe(true);
  });

  it('5) forbids derived HF events from silently becoming PROVIDER_CLASSIFIED', () => {
    expect(SIGNAL_AUTHORITY_MODEL.DERIVED_HF_EVENT_EVIDENCE_CLASS.forbiddenSilentUpgradeTo).toBe(
      'PROVIDER_CLASSIFIED',
    );
    expect(
      V2_AUTHORITY_CONTRACT_COMPATIBILITY.preservedDistinctions.forbiddenSilentUpgrade,
    ).toMatch(/PROVIDER_CLASSIFIED/);
    expect(DESIGN_INVARIANTS.derivedHfCannotBecomeProviderClassified).toBe(true);
  });

  it('6) defines episode hierarchy and overlap policy', () => {
    expect(EPISODE_TAXONOMY.compositionModel.primaryType).toBe('PRIMARY_KINEMATIC_EPISODE');
    expect(EPISODE_TAXONOMY.compositionModel.qualifiers).toContain('STRONG_ACCELERATION_CANDIDATE');
    expect(EPISODE_TAXONOMY.compositionModel.contextOverlays).toContain('HIGH_POWERTRAIN_DEMAND');
    expect(EPISODE_TAXONOMY.compositionModel.transitionTags).toContain('LAUNCH');
    expect(DESIGN_INVARIANTS.episodeOverlapPolicyDefined).toBe(true);
  });

  it('7) prevents primary exposure double counting from overlapping qualifiers/context', () => {
    expect(
      EPISODE_TAXONOMY.compositionModel.overlapPolicy
        .ONE_PHYSICAL_INTERVAL_CANNOT_CREATE_DUPLICATE_PRIMARY_EXPOSURE,
    ).toBe('YES');
    expect(
      EPISODE_TAXONOMY.compositionModel.overlapPolicy.qualifiersAndContextDoNotCreateSeparatePrimaryExposure,
    ).toBe(true);
    expect(DESIGN_INVARIANTS.primaryExposureDoubleCountPrevented).toBe(true);
  });

  it('8) separates positive acceleration and deceleration magnitude distributions', () => {
    expect(TRIP_FEATURE_VECTOR.dynamicsSeparation.positiveAccelerationStats).toContain(
      'positiveAccelMeanMps2',
    );
    expect(TRIP_FEATURE_VECTOR.dynamicsSeparation.decelerationMagnitudeStats).toContain(
      'decelMagnitudeMeanMps2',
    );
    expect(TRIP_FEATURE_VECTOR.features).not.toContain('accelMeanMps2');
    expect(DESIGN_INVARIANTS.positiveNegativeDynamicsSeparated).toBe(true);
  });

  it('9) uses explicitly mass-independent energy proxy semantics', () => {
    expect(TRIP_FEATURE_VECTOR.energyProxySemantics.massIndependent).toBe(true);
    expect(TRIP_FEATURE_VECTOR.energyProxySemantics.fieldNaming).toBe('SPECIFIC_KINETIC_ENERGY_CHANGE');
    expect(TRIP_FEATURE_VECTOR.features).toContain('positiveSpecificKineticEnergyChange');
    expect(TRIP_FEATURE_VECTOR.energyProxySemantics.forbidden).toContain('infer_mass_from_obdEngineLoad');
    expect(DESIGN_INVARIANTS.massIndependentEnergyProxyExplicit).toBe(true);
  });

  it('10) does not claim observed tire thermal load', () => {
    expect(TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED).toBe(false);
    expect(TIRE_LOAD_FOUNDATION.futureComponents.SPEED_DURATION_EXPOSURE).toBeDefined();
    expect(TIRE_LOAD_FOUNDATION.futureComponents.THERMAL_RISK_PROXY_UNVALIDATED.directlyObserved).toBe(
      false,
    );
    expect('SPEED_THERMAL_EXPOSURE' in TIRE_LOAD_FOUNDATION.futureComponents).toBe(false);
    expect(DESIGN_INVARIANTS.noObservedTireThermalLoad).toBe(true);
  });

  it('11) applies surface-aware provider-age confidence policy', () => {
    expect(PROVIDER_AGE_POLICY).toBe('SURFACE_AWARE');
    expect(EPISODE_CONFIDENCE_MODEL.PROVIDER_AGE_CONFIDENCE_POLICY).toBe('SURFACE_AWARE');
    expect(EPISODE_CONFIDENCE_MODEL.providerAgeSemantics.HF_HISTORICAL).toMatch(/NOT automatically reduce/i);
    expect(DESIGN_INVARIANTS.providerAgePolicySurfaceAware).toBe(true);
  });

  it('12) adds RD004 preprocessing filter-response validation', () => {
    expect(RD004_VALIDATION_CONTRACT.mustValidate).toContain('preprocessing_filter_response');
    expect(RD004_VALIDATION_CONTRACT.preprocessingFilterResponse.objective).toBe(
      'PREPROCESSING_FILTER_RESPONSE',
    );
    expect(RD004_VALIDATION_CONTRACT.preprocessingFilterResponse.runtimeChange).toBe(false);
    expect(DESIGN_INVARIANTS.rd004PreprocessingValidationAdded).toBe(true);
  });

  it('13) keeps production runtime unchanged and documents legacy scorer migration status', () => {
    expect(PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    const scorer = CURRENT_PRODUCTION_COMPONENTS.find((c) => c.id === 'driving_impact_scorer');
    expect(scorer?.classification).toBe('KEEP_LEGACY_UNTIL_V2_CUTOVER');
    expect(HIGH_TIMEFRAME_AGGREGATION.fleetRelativeComparison.FLEET_RELATIVE_COMPARISON_REQUIRES_COMPARABLE_COHORT).toBe(
      'YES',
    );
    expect(CANONICAL_DESIGN_CLOSEOUT_REVISION).toBe('DI-EV-0034F.2');
    expect(() => assertDesignInvariants()).not.toThrow();
    const artifacts = buildCanonicalDesignArtifacts();
    expect(artifacts['design-summary.json']).toMatchObject({
      closeoutRevision: 'DI-EV-0034F.2',
      ORTHOGONAL_STATE_MODEL_DESIGNED: 'YES',
    });
    expect(Object.keys(artifacts)).toHaveLength(14);
    expect(CANONICAL_PIPELINE_STAGES).toHaveLength(12);
  });
});

describe('DI-EV-0034F.2 final semantic + artifact integrity closeout', () => {
  it('1) uses specific kinetic energy change 0.5 * (vEnd² - vStart²)', () => {
    const vStart = 10;
    const vEnd = 20;
    const canonical = computeSpecificKineticEnergyChangeMps2(vStart, vEnd);
    const mislabel = computeForbiddenDeltaVSquaredMislabelMps2(vEnd - vStart);
    expect(canonical).toBe(0.5 * (vEnd ** 2 - vStart ** 2));
    expect(canonical).not.toBe(mislabel);
    expect(TRIP_FEATURE_VECTOR.energyProxySemantics.formula).toBe(
      'deltaSpecificKineticEnergy = 0.5 * (vEndMps² - vStartMps²)',
    );
    expect(DESIGN_INVARIANTS.specificKineticEnergyFormulaCorrect).toBe(true);
  });

  it('2) documents specific kinetic energy units as m²/s² / J/kg', () => {
    expect(TRIP_FEATURE_VECTOR.energyProxySemantics.units).toBe('m²/s² (equivalent to J/kg)');
  });

  it('3) keeps physical episode severity event-local', () => {
    expect(EPISODE_TAXONOMY.physicalSeverityModel.PHYSICAL_EPISODE_SEVERITY_IS_EVENT_LOCAL).toBe('YES');
    expect(DESIGN_INVARIANTS.physicalEpisodeSeverityIsEventLocal).toBe(true);
  });

  it('4) excludes repetition/exposure from physical episode severity', () => {
    expect(EPISODE_TAXONOMY.physicalSeverityModel.forbiddenDimensions).toContain(
      'repetitionExposureContext',
    );
    expect(EPISODE_TAXONOMY.physicalSeverityModel.REPETITION_EXPOSURE_NOT_PART_OF_EPISODE_SEVERITY).toBe(
      'YES',
    );
    expect(DESIGN_INVARIANTS.repetitionNotPartOfEpisodeSeverity).toBe(true);
  });

  it('5) makes driver behavior confidence requirements layer-explicit', () => {
    for (const dim of DRIVER_BEHAVIOR_DIMENSIONS.dimensions) {
      expect(dim).toHaveProperty('reconstructionConfidenceRequired');
      expect(dim).toHaveProperty('attributionConfidenceRequired');
      expect(dim).not.toHaveProperty('confidenceRequired');
    }
    expect(
      DRIVER_BEHAVIOR_DIMENSIONS.confidenceModel.DRIVER_BEHAVIOR_CONFIDENCE_REQUIREMENTS_ARE_LAYER_EXPLICIT,
    ).toBe('YES');
    expect(DESIGN_INVARIANTS.driverBehaviorConfidenceLayersExplicit).toBe(true);
  });

  it('6) applies surface-aware provider-age semantics to quality gate', () => {
    expect(QUALITY_GATE_DESIGN.PROVIDER_AGE_POLICY).toBe('SURFACE_AWARE');
    expect(QUALITY_GATE_DESIGN.factors).toContain('providerAgeMsSurfaceAware');
    expect(QUALITY_GATE_DESIGN.factors).not.toContain('providerAgeMs');
    expect(DESIGN_INVARIANTS.qualityGateProviderAgeSurfaceAware).toBe(true);
  });

  it('7) does not penalize HF_HISTORICAL merely for historical delivery age', () => {
    expect(QUALITY_GATE_DESIGN.providerAgeSemantics.HF_HISTORICAL_GENERIC_AGE_PENALTY).toBe('NO');
    expect(QUALITY_GATE_DESIGN.providerAgeSemantics.HF_HISTORICAL).toMatch(/NOT cause rejection/i);
    expect(DESIGN_INVARIANTS.hfHistoricalGenericAgePenalty).toBe(false);
  });

  it('8) uses reconstructionConfidence and attributionConfidence in episode conceptual fields', () => {
    expect(EPISODE_TAXONOMY.conceptualFields).toContain('reconstructionConfidence');
    expect(EPISODE_TAXONOMY.conceptualFields).toContain('attributionConfidence');
    expect(EPISODE_TAXONOMY.conceptualFields).not.toContain('confidence');
  });

  it('9) synchronizes legacy scorer/load classification as KEEP_LEGACY_UNTIL_V2_CUTOVER', () => {
    const scorer = CURRENT_PRODUCTION_COMPONENTS.find((c) => c.id === 'driving_impact_scorer');
    const load = CURRENT_PRODUCTION_COMPONENTS.find((c) => c.id === 'driving_impact_load_components');
    expect(scorer?.classification).toBe('KEEP_LEGACY_UNTIL_V2_CUTOVER');
    expect(load?.classification).toBe('KEEP_LEGACY_UNTIL_V2_CUTOVER');
  });

  it('10) marks F/F.1/F.2 complete and RD004 as NEXT', () => {
    expect(MIGRATION_PLAN.phases.find((p) => p.id === 'DI-EV-0034F')?.status).toBe('COMPLETE');
    expect(MIGRATION_PLAN.phases.find((p) => p.id === 'DI-EV-0034F.1')?.status).toBe('COMPLETE');
    expect(MIGRATION_PLAN.phases.find((p) => p.id === 'DI-EV-0034F.2')?.status).toBe('COMPLETE');
    expect(MIGRATION_PLAN.phases.find((p) => p.id === 'RD004')?.status).toBe('NEXT');
  });

  it('11) assigns distinct per-file SHA256 hashes to generated artifacts', () => {
    const artifacts = buildCanonicalDesignArtifacts();
    const manifest = buildExportManifest(artifacts, '2026-09-03T00:00:00.000Z') as {
      fileSha256: Record<string, string>;
      bundleSha256: string;
    };
    const hashes = Object.values(manifest.fileSha256);
    expect(hashes).toHaveLength(14);
    expect(new Set(hashes).size).toBeGreaterThan(1);
    for (const [filename, payload] of Object.entries(artifacts)) {
      expect(manifest.fileSha256[filename]).toBe(artifactSha256(payload));
    }
    expect(DESIGN_INVARIANTS.perFileArtifactSha256).toBe(true);
  });

  it('12) keeps bundle SHA256 separate from per-file hashes', () => {
    const artifacts = buildCanonicalDesignArtifacts();
    const manifest = buildExportManifest(artifacts, '2026-09-03T00:00:00.000Z') as {
      fileSha256: Record<string, string>;
      bundleSha256: string;
    };
    expect(manifest.bundleSha256).toBe(canonicalDesignOutputSha256());
    expect(Object.values(manifest.fileSha256)).not.toContain(manifest.bundleSha256);
  });

  it('13) persists no environment-specific authority paths in canonical manifest', () => {
    const manifest = buildExportManifest(buildCanonicalDesignArtifacts(), '2026-09-03T00:00:00.000Z');
    expect(manifest.rd003Authority).toBe(RD003_AUTHORITY_PATH);
    expect(String(manifest.rd003Authority)).not.toMatch(/^\/workspace/);
    expect(JSON.stringify(manifest)).not.toMatch(/\/workspace/);
    expect(manifest.ENVIRONMENT_SPECIFIC_PATHS_IN_CANONICAL_ARTIFACTS).toBe('NO');
    expect(DESIGN_INVARIANTS.noEnvironmentSpecificPathsInCanonicalArtifacts).toBe(true);
  });

  it('14) keeps production runtime unchanged', () => {
    expect(PRODUCTION_SCORE_CHANGED).toBe('NO');
    expect(PRODUCTION_DETECTORS_CHANGED).toBe('NO');
    expect(() => assertDesignInvariants()).not.toThrow();
    expect(CANONICAL_DESIGN_CLOSEOUT_REVISION).toBe('DI-EV-0034F.2');
  });
});
