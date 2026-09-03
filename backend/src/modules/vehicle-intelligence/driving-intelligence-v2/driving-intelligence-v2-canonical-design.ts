/**
 * DI-EV-0034F — Canonical Driving Intelligence V2 Design.
 * Architecture design only — does NOT modify production Driving Score,
 * detectors, tire/brake runtime, or deploy any scoring logic.
 *
 * Authority: docs/audits/driving-intelligence-rd003-signal-quality-interpretation-2026-09.md
 *            docs/audits/data/rd003-signal-quality/signal-quality-summary.json
 */
import * as crypto from 'crypto';

export const CANONICAL_DESIGN_EVIDENCE_ID = 'DI-EV-0034F';
export const CANONICAL_DESIGN_CLOSEOUT_REVISION = 'DI-EV-0034F.1';
export const CANONICAL_DESIGN_MODE = 'DRIVING_INTELLIGENCE_V2_CANONICAL_DESIGN';
export const CANONICAL_DESIGN_EVIDENCE_CLASS =
  'ARCHITECTURE_DESIGN+DRIVING_INTELLIGENCE_V2_FOUNDATION';

export const RD003_AUTHORITY_PATH =
  'docs/audits/data/rd003-signal-quality/signal-quality-summary.json';

export const PRODUCTION_SCORE_CHANGED = 'NO' as const;
export const PRODUCTION_DETECTORS_CHANGED = 'NO' as const;
export const TIRE_RUNTIME_CHANGED = 'NO' as const;
export const BRAKE_RUNTIME_CHANGED = 'NO' as const;
export const DEPLOYED = 'NO' as const;

/** Stable stringify for artifact hashing (matches reference-capture convention). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

export function artifactSha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

// ── Canonical pipeline stages ─────────────────────────────────────────────────

export const CANONICAL_PIPELINE_STAGES = [
  'RAW_TELEMETRY',
  'PHYSICAL_SAMPLE_NORMALIZATION',
  'SIGNAL_QUALITY_FRESHNESS_GATE',
  'KINEMATIC_RECONSTRUCTION',
  'MULTI_SIGNAL_CONTEXT',
  'DRIVING_STATE_SEGMENTATION',
  'DRIVING_EPISODE_RECONSTRUCTION',
  'EPISODE_CONFIDENCE',
  'TRIP_FEATURE_EXTRACTION',
  'BEHAVIOR_LOAD_DIMENSIONS',
  'FUTURE_DRIVING_SCORE',
  'TIRE_BRAKE_LOAD_MODELS',
] as const;

// ── Signal authority (RD003-grounded) ─────────────────────────────────────────

export const SIGNAL_AUTHORITY_MODEL = {
  evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
  rd003Authority: RD003_AUTHORITY_PATH,
  PRIMARY_KINEMATIC_AUTHORITY: {
    signal: 'speed',
    acquisitionSurface: 'HF_HISTORICAL',
    physicalEventTime: 'providerTimestamp',
    rating: 'USEFUL_WITH_GATING',
    medianPhysicalCadenceSeconds: 2.0,
    notes: [
      'Unsigned magnitude only; direction requires gear/state context',
      'LATEST_LIVE supplements only when freshness proven — not by surface name',
    ],
  },
  SECONDARY_DYNAMIC_CONFIRMATION: {
    signals: ['powertrainCombustionEngineSpeed'],
    acquisitionSurface: 'HF_HISTORICAL',
    rating: 'USEFUL_WITH_GATING',
    role: 'Confirms powered acceleration/deceleration episodes; does not override kinematics',
  },
  DRIVER_POWERTRAIN_DEMAND_CONTEXT: {
    signals: ['obdThrottlePosition', 'powertrainCombustionEngineTPS'],
    rating: 'SECONDARY_DEMAND_CONTEXT',
    role: 'Separate channels; refine driver-demand interpretation; not interchangeable',
  },
  POWERTRAIN_STRESS_CONTEXT: {
    signals: ['obdEngineLoad', 'powertrainCombustionEngineSpeed', 'obdThrottlePosition', 'powertrainCombustionEngineTPS'],
    rating: 'POWERTRAIN_DEMAND_CONTEXT_ONLY',
    forbiddenInterpretation: ['vehicle_mass', 'payload', 'road_load'],
  },
  STATE_CONTEXT: {
    signals: ['powertrainTransmissionActualGear', 'powertrainTransmissionActualGearRatio'],
    acquisitionSurface: 'LATEST_SLOW',
    rating: 'CONTEXT_ONLY',
    gearChangeTimingSupported: false,
  },
  DELIVERY_DIAGNOSTIC_ONLY: {
    timestamps: ['synqReceivedAt', 'requestStartedAt'],
    rating: 'NOT_RELIABLE',
    forbiddenUse: 'physical_event_time_authority',
  },
  DERIVED_KINEMATICS: {
    longitudinalAcceleration: {
      formula: 'a = Δv / Δt using providerTimestamp',
      rating: 'USEFUL_WITH_GATING',
      provisionalQualifiedFractionAt2s: 0.63,
      productionMaxGapSelected: false,
    },
    jerk: {
      formula: 'j = Δa / Δt using providerTimestamp',
      rating: 'EPISODE_CONTEXT_ONLY',
      directHarshEventAuthority: false,
    },
  },
  fusionPrinciple:
    'Speed is primary kinematic evidence; secondary signals refine interpretation and confidence — missing secondary context must not invalidate coherent kinematic episodes',
  HF_KINEMATIC_AUTHORITY_SCOPE: {
    scope: 'POST_TRIP_KINEMATIC_RECONSTRUCTION',
    explicitlyNot: 'PRIMARY_DRIVER_CONDUCT_AUTHORITY',
    note:
      'PRIMARY_KINEMATIC_AUTHORITY establishes HF speed / derived episodes as the primary source for kinematic reconstruction — not automatic driver-conduct authority',
  },
  NATIVE_PROVIDER_EVENT_AUTHORITY: {
    evidenceClass: 'PROVIDER_CLASSIFIED',
    scope: 'PRIMARY_DRIVER_CONDUCT_AUTHORITY_WHEN_CAPABILITY_EXISTS',
    contract: 'docs/architecture/driving-intelligence-v2.md',
    rule: 'Native DIMO behavior events retain Driver Conduct primary evidence semantics until explicit migration/calibration upgrades them',
  },
  DERIVED_HF_EVENT_EVIDENCE_CLASS: {
    default: 'ESTIMATED_PROXY',
    mayUpgradeTo: 'RECONSTRUCTED',
    forbiddenSilentUpgradeTo: 'PROVIDER_CLASSIFIED',
    rule: 'HF-derived episodes must never silently become PROVIDER_CLASSIFIED',
  },
} as const;

export const PHYSICAL_EVENT_TIME_AUTHORITY = 'providerTimestamp' as const;

// ── Physical sample normalization (conceptual) ────────────────────────────────

export const PHYSICAL_SAMPLE_NORMALIZATION = {
  conceptualType: 'PhysicalSignalSample',
  requiredFields: [
    'signal',
    'value',
    'providerTimestamp',
    'synqReceivedAt',
    'acquisitionSurface',
    'physicalSampleIdentity',
    'providerAgeMs',
    'physicalDeltaMs',
    'duplicate',
    'staleHold',
    'outOfOrder',
    'quality',
  ],
  surfaceMergePolicy: {
    HF_HISTORICAL: 'PRIMARY_POST_TRIP_RECONSTRUCTION',
    LATEST_LIVE: 'SUPPLEMENT_ONLY_WITH_PROVEN_FRESHNESS',
    LATEST_SLOW: 'STATE_CONTEXT_ONLY',
    rule: 'Different acquisition surfaces must NOT be blindly merged',
  },
  deduplication: {
    authority: 'physicalSampleFingerprint + providerTimestamp',
    staleHoldDetection: 'REQUIRED_BEFORE_DERIVATIVES',
    duplicateExclusion: 'REQUIRED_BEFORE_CADENCE_AND_DERIVATIVES',
  },
} as const;

// ── Quality gate design ───────────────────────────────────────────────────────

export const QUALITY_GATE_DESIGN = {
  purpose: 'Reusable gate BEFORE any derivative or event detector',
  qualityLevels: ['HIGH', 'MEDIUM', 'LOW', 'REJECTED'],
  factors: [
    'physicalSampleCadence',
    'providerAgeMs',
    'staleHoldExposure',
    'duplicatePhysicalSample',
    'missingData',
    'outOfOrderSample',
    'acquisitionSurface',
    'largeSampleGap',
    'interpolationDependence',
    'signalSpecificLimitation',
  ],
  gapPolicy: {
    productionMaxGapSeconds: null,
    rd003ProvisionalAnalysisAnchorSeconds: 2.0,
    rd004MustValidate: [
      'candidate_max_gap_seconds',
      'qualified_derivative_fraction',
      'false_dynamics_on_stable_cruise',
    ],
  },
  rejectConditions: [
    'duplicate_physical_sample_for_derivative',
    'stale_hold_sample_for_derivative',
    'invalid_ordering',
    'unqualified_large_gap',
    'synqReceivedAt_as_physical_time',
  ],
} as const;

// ── Driving state model (orthogonal layers — DI-EV-0034F.1) ─────────────────

export const DRIVING_STATE_MODEL = {
  purpose:
    'Orthogonal parallel state layers — multiple conditions may coexist (e.g. REVERSE + ACCELERATING + HIGH demand)',
  antiPattern: 'flat_single_state_list_mixing_kinematics_direction_powertrain_transitions',
  modelType: 'ORTHOGONAL_LAYERS',
  layers: {
    KINEMATIC_STATE: {
      question: 'What is the vehicle doing kinematically?',
      mutuallyExclusive: true,
      values: [
        'STANDSTILL',
        'LOW_SPEED_MOTION',
        'CRUISE_STABLE',
        'ACCELERATING',
        'DECELERATING',
        'UNKNOWN_LOW_CONFIDENCE',
      ],
      semantics: {
        STANDSTILL:
          'Persistent kinematic state — speed near zero for a qualified window (not a one-sample flip)',
        note: 'STOPPED is not a duplicate kinematic state — see TRANSITION_EPISODE_MARKERS / STANDSTILL_EPISODE',
      },
    },
    DIRECTION_CONTEXT: {
      question: 'What is the travel direction context?',
      mutuallyExclusive: true,
      values: ['FORWARD', 'REVERSE', 'UNKNOWN_DIRECTION'],
    },
    POWERTRAIN_DEMAND_STATE: {
      question: 'What is the powertrain demand level?',
      mutuallyExclusive: true,
      values: ['LOW', 'NORMAL', 'HIGH', 'UNKNOWN'],
    },
    TRANSITION_EPISODE_MARKERS: {
      question: 'Which transition/episode concepts apply as overlays (not exclusive kinematic states)?',
      mutuallyExclusive: false,
      concepts: [
        'LAUNCH',
        'STOP_APPROACH',
        'LIFT_OFF_COASTING',
        'STRONG_ACCELERATION_CANDIDATE',
        'STRONG_DECELERATION_CANDIDATE',
      ],
      note: 'Markers annotate intervals; they compose with kinematic/direction/powertrain layers',
    },
  },
  persistence: {
    minimumDurationMs: 'RD004_TO_VALIDATE',
    hysteresis: 'REQUIRED',
    stateTransitionEvidence: 'multi_sample_coherent_window',
  },
} as const;

// ── Episode taxonomy ──────────────────────────────────────────────────────────

export const EPISODE_TAXONOMY = {
  purpose: 'Multi-sample temporal objects — NOT one event per derivative sample',
  compositionModel: {
    primaryType: 'PRIMARY_KINEMATIC_EPISODE',
    mutuallyExclusivePrimaryTypes: [
      'ACCELERATION_EPISODE',
      'DECELERATION_EPISODE',
      'CRUISE_EPISODE',
      'STANDSTILL_EPISODE',
    ],
    qualifiers: [
      'STRONG_ACCELERATION_CANDIDATE',
      'STRONG_DECELERATION_CANDIDATE',
    ],
    contextOverlays: ['HIGH_POWERTRAIN_DEMAND'],
    transitionTags: ['LAUNCH', 'STOP_APPROACH', 'LIFT_OFF_COASTING'],
    example: {
      primaryType: 'ACCELERATION_EPISODE',
      qualifiers: ['STRONG_ACCELERATION_CANDIDATE'],
      context: ['HIGH_POWERTRAIN_DEMAND'],
      transitionTags: ['LAUNCH'],
    },
    overlapPolicy: {
      rule: 'One physical time interval maps to at most one primary kinematic episode for exposure counting',
      qualifiersAndContextDoNotCreateSeparatePrimaryExposure: true,
      ONE_PHYSICAL_INTERVAL_CANNOT_CREATE_DUPLICATE_PRIMARY_EXPOSURE: 'YES',
      aggregation: 'Count duration/exposure once on primaryType; qualifiers/context enrich interpretation only',
    },
  },
  coreTypes: [
    'ACCELERATION_EPISODE',
    'DECELERATION_EPISODE',
    'CRUISE_EPISODE',
    'STANDSTILL_EPISODE',
  ],
  semanticDistinctions: {
    DECELERATION_EPISODE: 'Observed vehicle slowing from kinematics',
    BRAKING_LIKELIHOOD: 'Only when friction-brake evidence exists — NOT default from deceleration',
    ACCELERATION_EPISODE: 'Vehicle motion change',
    AGGRESSIVE_DRIVER_INPUT: 'Requires throttle/TPS/RPM demand context — separate layer',
    ENGINE_LOAD: 'Powertrain demand context only',
    VEHICLE_LOAD_PAYLOAD: 'NOT inferable from obdEngineLoad',
    GEAR_STATE: 'Observable state context',
    GEAR_SHIFT_TIME: 'NOT_SUPPORTED at current cadence',
  },
  conceptualFields: [
    'type',
    'startedAt',
    'endedAt',
    'duration',
    'speedStart',
    'speedEnd',
    'deltaSpeed',
    'peakSpeed',
    'accelMean',
    'accelPeak',
    'accelP95',
    'rpmContext',
    'throttleContext',
    'tpsContext',
    'engineLoadContext',
    'gearContext',
    'sourceCoverage',
    'reconstructionConfidence',
    'attributionConfidence',
    'evidenceFlags',
    'physicalSeverity',
    'provenance',
    'qualifiers',
    'contextOverlays',
    'transitionTags',
  ],
  physicalSeverityModel: {
    type: 'PHYSICAL_EPISODE_SEVERITY',
    separatedFrom: 'RECONSTRUCTION_CONFIDENCE',
    principle:
      'An episode may be HIGH severity + LOW reconstruction confidence — severity does not absorb evidence confidence',
    dimensions: [
      'peakLongitudinalAcceleration',
      'sustainedAcceleration',
      'duration',
      'deltaSpeed',
      'startingSpeed',
      'endingSpeed',
      'specificKineticEnergyChangeProxy',
      'repetitionExposureContext',
    ],
    forbiddenDimensions: ['confidence', 'reconstructionConfidence', 'attributionConfidence'],
    futureScoreGating:
      'Later calibration may confidence-gate or confidence-weight score contribution — not part of physical severity',
    productionThresholdsSelected: false,
    examples: [
      '0→50 km/h moderate accel differs from 80→130 km/h at same m/s²',
      '300ms spike differs from 3s sustained strong acceleration',
    ],
  },
} as const;

// ── Episode confidence model ───────────────────────────────────────────────────

export const EPISODE_CONFIDENCE_MODEL = {
  layers: {
    RECONSTRUCTION_CONFIDENCE: {
      question: 'How certain are we that this physical driving episode occurred as reconstructed?',
      factors: [
        'KINEMATIC_COVERAGE',
        'PHYSICAL_CADENCE_QUALITY',
        'MAX_SAMPLE_GAP',
        'STALE_HOLD_EXPOSURE',
        'PROVIDER_AGE_SURFACE_AWARE',
        'SUPPORTING_SIGNAL_COUNT',
        'SUPPORTING_SIGNAL_AGREEMENT',
        'INTERPOLATION_DEPENDENCE',
        'EPISODE_DURATION',
        'SURFACE_AUTHORITY',
        'MISSINGNESS',
        'OUT_OF_ORDER_EXPOSURE',
      ],
    },
    ATTRIBUTION_CONFIDENCE: {
      question: 'How safely can this physical event be interpreted as driver behavior?',
      alias: 'BEHAVIOR_INTERPRETATION_CONFIDENCE',
      factors: [
        'TRAFFIC_CONTEXT_AVAILABILITY',
        'ROAD_GRADIENT_CONTEXT',
        'ROAD_TYPE_CONTEXT',
        'SPEED_LIMIT_CONTEXT',
        'WEATHER_CONTEXT',
        'PAYLOAD_TRAILER_CONTEXT',
        'DRIVER_ASSISTANCE_CONTEXT',
        'REGENERATIVE_BRAKING_CONTEXT',
        'URBAN_MOTORWAY_CONTEXT',
      ],
      rule:
        'Unknown external context lowers attribution/behavior confidence — NOT reconstruction confidence for well-observed kinematic events',
    },
  },
  output: {
    continuous: '0.0–1.0 per layer',
    categorical: ['HIGH', 'MEDIUM', 'LOW'],
  },
  PROVIDER_AGE_CONFIDENCE_POLICY: 'SURFACE_AWARE',
  providerAgeSemantics: {
    LATEST_LIVE: 'Provider sample age is a direct freshness concern — may reduce reconstruction confidence',
    HF_HISTORICAL:
      'Historical delivery/ingestion age must NOT automatically reduce physical-event reconstruction confidence merely because data is historical',
    validUses: [
      'stale_physical_identity',
      'freshness_failure',
      'incorrect_physical_sample_association',
    ],
    invalidUses: ['generic_elapsed_ingestion_delay_on_post_trip_hf'],
  },
  productionWeightsSelected: false,
  rd004MustValidate: [
    'factor_weight_calibration',
    'reconstruction_vs_attribution_separation',
    'provider_age_surface_aware_policy',
    'confidence_vs_false_positive_tradeoff',
    'stable_cruise_confidence_floor',
    'episode_count_sensitivity_to_confidence_threshold',
  ],
  rule: 'No score calculation without reconstruction confidence; attribution confidence gates behavioral judgement only',
} as const;

export const PROVIDER_AGE_POLICY = 'SURFACE_AWARE' as const;

// ── Trip feature vector ───────────────────────────────────────────────────────

export const TRIP_FEATURE_VECTOR = {
  purpose: 'Comparable trip-level features for history, benchmarking, future scoring',
  normalization: {
    per100Km: true,
    perDrivingHour: true,
    rawEventCountAlone: false,
  },
  features: [
    'distanceKm',
    'durationSeconds',
    'movingTimeSeconds',
    'standstillTimeSeconds',
    'cruiseFraction',
    'accelerationEpisodeCount',
    'decelerationEpisodeCount',
    'strongDynamicEpisodeExposure',
    'accelerationDurationFraction',
    'decelerationDurationFraction',
    'positiveAccelMeanMps2',
    'positiveAccelMedianMps2',
    'positiveAccelP90Mps2',
    'positiveAccelP95Mps2',
    'decelMagnitudeMeanMps2',
    'decelMagnitudeMedianMps2',
    'decelMagnitudeP90Mps2',
    'decelMagnitudeP95Mps2',
    'positiveSpecificKineticEnergyChangeProxy',
    'negativeSpecificKineticEnergyChangeProxy',
    'speedVariability',
    'stopCount',
    'launchCount',
    'highPowertrainDemandFraction',
    'reconstructionConfidenceDistribution',
    'attributionConfidenceDistribution',
    'telemetryCoverage',
    'tripReconstructionConfidence',
  ],
  dynamicsSeparation: {
    rule: 'Positive acceleration and deceleration magnitude statistics are computed separately — signed values must not cancel',
    positiveAccelerationStats: [
      'positiveAccelMeanMps2',
      'positiveAccelMedianMps2',
      'positiveAccelP90Mps2',
      'positiveAccelP95Mps2',
    ],
    decelerationMagnitudeStats: [
      'decelMagnitudeMeanMps2',
      'decelMagnitudeMedianMps2',
      'decelMagnitudeP90Mps2',
      'decelMagnitudeP95Mps2',
    ],
  },
  energyProxySemantics: {
    fieldNaming: 'SPECIFIC_KINETIC_ENERGY_CHANGE_PROXY',
    alias: 'DELTA_V_SQUARED_ENERGY_PROXY',
    massIndependent: true,
    units: 'm²/s² aggregate (½Δv² per episode interval — no vehicle mass)',
    rule: 'Without trusted vehicle mass, do NOT call values physical kinetic energy (Joules)',
    futurePhysicalEnergy:
      'If trusted vehicle mass becomes available later, physical energy may be added as a separate field',
    forbidden: ['infer_mass_from_obdEngineLoad'],
  },
  exposureNormalization: 'REQUIRED — 5 km city vs 500 km motorway must be comparable',
} as const;

// ── Driver behavior dimensions ────────────────────────────────────────────────

export const DRIVER_BEHAVIOR_DIMENSIONS = {
  purpose: 'Interpretable dimensions BEFORE opaque Driving Score',
  dimensions: [
    {
      id: 'SMOOTHNESS',
      inputs: ['acceleration_episodes', 'deceleration_episodes', 'jerk_context'],
      confidenceRequired: 'MEDIUM',
      limitations: ['HF cadence ~2s masks sub-second smoothness'],
    },
    {
      id: 'ACCELERATION_STYLE',
      inputs: ['acceleration_episodes', 'throttle_context', 'rpm_context'],
      confidenceRequired: 'MEDIUM',
    },
    {
      id: 'DECELERATION_STYLE',
      inputs: ['deceleration_episodes'],
      confidenceRequired: 'MEDIUM',
      limitations: ['Deceleration ≠ braking; no friction-brake direct observation'],
    },
    {
      id: 'ANTICIPATION_STOP_APPROACH',
      inputs: ['stop_approach_episodes', 'deceleration_episodes'],
      confidenceRequired: 'MEDIUM',
    },
    {
      id: 'SPEED_STABILITY',
      inputs: ['cruise_episodes', 'speed_variability'],
      confidenceRequired: 'HIGH',
    },
    {
      id: 'POWERTRAIN_DEMAND_STYLE',
      inputs: ['throttle_context', 'tps_context', 'engine_load_context', 'rpm_context'],
      confidenceRequired: 'MEDIUM',
      limitations: ['Engine load ≠ vehicle load'],
    },
    {
      id: 'DRIVING_CONSISTENCY',
      inputs: ['trip_feature_vector_over_time'],
      confidenceRequired: 'HIGH',
    },
    {
      id: 'HIGH_DYNAMIC_EXPOSURE',
      inputs: ['strong_dynamic_episodes', 'exposure_normalized_counts'],
      confidenceRequired: 'MEDIUM',
    },
    {
      id: 'STOP_LAUNCH_BEHAVIOR',
      inputs: ['launch_episodes', 'stop_episodes'],
      confidenceRequired: 'MEDIUM',
    },
  ],
} as const;

// ── High-timeframe aggregation ────────────────────────────────────────────────

export const HIGH_TIMEFRAME_AGGREGATION = {
  windows: {
    calendar: ['7d', '30d', '90d'],
    rolling: ['rolling_distance_km', 'rolling_driving_hours'],
  },
  objective: 'Distinguish single unusual trip from persistent driver behavior',
  methods: [
    'weighted_rolling_distributions',
    'trend',
    'personal_baseline',
    'deviation_from_own_baseline',
    'fleet_relative_comparison',
  ],
  fleetRelativeComparison: {
    FLEET_RELATIVE_COMPARISON_REQUIRES_COMPARABLE_COHORT: 'YES',
    requirement:
      'Fleet benchmarking must use a comparable peer cohort and minimum exposure — not raw cross-fleet ranking without context',
    potentialPeerFactors: [
      'vehicle_class',
      'powertrain',
      'route_environment_context',
      'telemetry_capability',
      'trip_mix',
    ],
    productionCohortRulesSelected: false,
  },
  antiPatterns: ['overreact_to_single_trip', 'raw_event_count_without_exposure', 'incomparable_fleet_ranking'],
  productionScoring: false,
} as const;

// ── Brake load foundation ─────────────────────────────────────────────────────

export const BRAKE_LOAD_FOUNDATION = {
  currentProductionAudit: {
    module: 'driving-impact-load-components.ts + hf-braking.ts + driving-impact-scorer.ts',
    currentBehavior:
      'Braking stress score from hard/extreme braking event counts per 100km + p95 deceleration; braking events inferred from speed deceleration',
    rd003Conflict:
      'Deceleration treated as braking; no friction-brake torque/pedal observation; EV regen not distinguished',
    classification: 'KEEP_WITH_GATE → future REPLACE_WITH_EPISODE_MODEL',
  },
  futureModel: {
    LONGITUDINAL_DECELERATION_LOAD: {
      observable: true,
      proxies: [
        'speed_reduction_magnitude',
        'initial_speed',
        'deceleration_intensity',
        'sustained_duration',
        'specific_kinetic_energy_change_proxy',
        'frequency',
      ],
    },
    ESTIMATED_FRICTION_BRAKE_LOAD: {
      directlyObservable: false,
      reason: 'No brake pedal / brake pressure / friction-brake torque in current DIMO surface',
      evHybridNote: 'Regenerative braking may dominate — deceleration ≠ friction brake usage',
    },
  },
  upgradeSignals: [
    'brake_pedal_position',
    'brake_pressure',
    'friction_brake_torque',
    'regen_brake_torque',
    'brake_light_state',
  ],
  forbidden: ['infer_mass_from_obdEngineLoad'],
} as const;

export const BRAKE_FRICTION_USE_DIRECTLY_OBSERVABLE = false;

// ── Tire load foundation ────────────────────────────────────────────────────────

export const TIRE_LOAD_FOUNDATION = {
  currentProductionAudit: {
    module: 'driving-impact-load-components.ts (tireLoad from composite stress)',
    currentBehavior: 'Tire load derived from longitudinal/braking/stop-go/speed stress composite',
    rd003Conflict: 'No lateral kinematics; composite may overstate from deceleration-as-braking',
    classification: 'KEEP_WITH_GATE',
  },
  futureComponents: {
    LONGITUDINAL_TIRE_LOAD: { observable: 'PROXY_FROM_KINEMATICS', confidence: 'GATED' },
    LATERAL_TIRE_LOAD: { observable: 'NOT_YET_OBSERVABLE', reason: 'No reliable lateral accel/yaw/curvature' },
    SPEED_DURATION_EXPOSURE: {
      observable: 'PROXY_FROM_SPEED_DURATION',
      confidence: 'MEDIUM',
      note: 'Derived from speed duration only — no tire temperature measured',
    },
    THERMAL_RISK_PROXY_UNVALIDATED: {
      observable: 'PROXY_ONLY',
      directlyObserved: false,
      note: 'If retained as risk proxy, explicitly unvalidated — never call temperature/thermal load directly observed',
    },
    STOP_LAUNCH_LOAD: { observable: 'PROXY_FROM_LAUNCH_STOP_EPISODES', confidence: 'GATED' },
  },
  upgradeSignals: [
    'lateral_acceleration',
    'yaw_rate',
    'steering_angle',
    'gps_curvature',
    'vehicle_mass_from_trusted_metadata',
    'tire_metadata',
    'tire_temperature',
  ],
  forbidden: ['manufacture_cornering_load_from_insufficient_data'],
} as const;

export const LATERAL_TIRE_LOAD_DIRECTLY_OBSERVABLE = false;

export const TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED = false;

// ── Context fairness ──────────────────────────────────────────────────────────

export const CONTEXT_FAIRNESS = {
  confounders: [
    'traffic',
    'road_gradient',
    'speed_limits',
    'road_type',
    'weather',
    'vehicle_payload',
    'trailer',
    'driver_assistance',
    'regenerative_braking',
    'urban_vs_motorway',
  ],
  contextLevels: ['CONTEXT_KNOWN', 'CONTEXT_PARTIAL', 'CONTEXT_UNKNOWN'],
  policy:
    'Unknown external context lowers ATTRIBUTION_CONFIDENCE (behavior interpretation) — not RECONSTRUCTION_CONFIDENCE for well-observed kinematic events',
  attributionVsReconstruction:
    'Context fairness applies to driver-behavior attribution; it must not reduce certainty that a kinematic episode physically occurred',
} as const;

// ── V2 authority contract compatibility ───────────────────────────────────────

export const V2_AUTHORITY_CONTRACT_COMPATIBILITY = {
  normativeContract: 'docs/architecture/driving-intelligence-v2.md',
  preservedDistinctions: {
    PRIMARY_KINEMATIC_AUTHORITY: 'HF_HISTORICAL speed + derived episodes for post-trip kinematic reconstruction',
    PRIMARY_DRIVER_CONDUCT_AUTHORITY:
      'Native provider behavior events (PROVIDER_CLASSIFIED) when capability exists',
    HF_DERIVED_DEFAULT_EVIDENCE_CLASS: 'ESTIMATED_PROXY',
    forbiddenSilentUpgrade: 'ESTIMATED_PROXY → PROVIDER_CLASSIFIED',
  },
  coexistence: {
    nativeEvents: 'Retain explicit PROVIDER_CLASSIFIED evidence class and Driver Conduct authority',
    hfReconstruction: 'Secondary kinematic reconstruction layer — may upgrade to RECONSTRUCTED with evidence, never silently to PROVIDER_CLASSIFIED',
  },
  invariant: 'PRIMARY_KINEMATIC_AUTHORITY does NOT overwrite native Provider Event / Driver Conduct authority',
} as const;

// ── Current production audit map ──────────────────────────────────────────────

export const CURRENT_PRODUCTION_COMPONENTS = [
  {
    id: 'dimo_hf_ingest',
    path: 'dimo-segments.service.ts / HF interval 1s query',
    stage: 'RAW_INPUT',
    inputSignal: 'DIMO signals(interval:"1s")',
    timestampUsed: 'provider timestamp from DIMO (mapped to Date)',
    cadenceAssumption: 'Implicit ~1 Hz from query interval — RD003 median physical ~2s',
    classification: 'KEEP_WITH_GATE',
    rd003Conflict: 'Nominal 1s query ≠ physical sample cadence; no stale-hold dedupe at ingest',
  },
  {
    id: 'hf_preprocessing',
    path: 'trips/hf-preprocessing.ts',
    stage: 'TRANSFORMATION',
    inputSignal: 'speedKmh, rpm, throttle, load',
    timestampUsed: 'r.timestamp (provider)',
    cadenceAssumption: 'Consecutive pairs; 5s gap split; 3-point smooth',
    threshold: 'MAX_ACCEL_MS2=25 spike filter; dt<3s',
    classification: 'KEEP_WITH_GATE',
    rd003Conflict: 'No duplicate/stale-hold exclusion; smoothing without cadence qualification',
  },
  {
    id: 'hf_acceleration_detector',
    path: 'trips/hf-acceleration.ts',
    stage: 'EVENT_DETECTOR',
    inputSignal: 'smoothed speed pairs',
    timestampUsed: 'provider ts',
    cadenceAssumption: 'Comments say 1-second HF; pairs across any positive dt',
    threshold: 'ENTRY 1.5 m/s²; HARD 3.5; EXTREME 5.0',
    output: 'LIGHT|MODERATE|HARD|EXTREME acceleration events',
    confidenceHandling: 'NONE',
    classification: 'REPLACE_WITH_EPISODE_MODEL',
    rd003Conflict: 'Point Δv/Δt at ~2s cadence; no gap gate; no confidence',
  },
  {
    id: 'hf_braking_detector',
    path: 'trips/hf-braking.ts',
    stage: 'EVENT_DETECTOR',
    inputSignal: 'smoothed speed pairs',
    timestampUsed: 'provider ts',
    threshold: 'ENTRY 1.5 m/s² decel; EXTREME 7.0',
    output: 'BrakingEvent (deceleration labeled braking)',
    confidenceHandling: 'NONE',
    classification: 'REPLACE_WITH_EPISODE_MODEL',
    rd003Conflict: 'Deceleration ≡ braking semantically; no friction-brake evidence',
  },
  {
    id: 'hf_abuse_detector',
    path: 'trips/hf-abuse.ts',
    stage: 'EVENT_DETECTOR',
    inputSignal: 'HF segment + rpm/throttle/coolant',
    output: 'KICKDOWN, LAUNCH_LIKE, FULL_BRAKING, POSSIBLE_IMPACT, etc.',
    classification: 'KEEP_WITH_GATE',
    rd003Conflict: 'FULL_BRAKING from kinematics only; LTE_R1 sparse cadence noted but detectors still run',
  },
  {
    id: 'trip_behavior_enrichment',
    path: 'trips/trip-behavior-enrichment.service.ts',
    stage: 'AGGREGATION',
    inputSignal: 'HF detectors + native DIMO events',
    output: 'Trip behavior summary, event counts, abuse score',
    classification: 'KEEP_WITH_GATE',
    rd003Conflict: 'Count-based harsh metrics without exposure normalization at detector level',
  },
  {
    id: 'driving_impact_scorer',
    path: 'driving-impact/driving-impact-scorer.ts',
    stage: 'SCORE',
    inputSignal: 'per-100km event rates + p95 decel',
    output: 'longitudinal/braking/stopGo/highSpeed/thermal scores → drivingStressScore',
    classification: 'KEEP_LEGACY_UNTIL_V2_CUTOVER',
    legacyScope: 'Harsh-event scoring logic and event-input model superseded by DI-V2 episode architecture at cutover',
    frameworkPersistence: 'Score persistence framework / rolling aggregation may remain; formula inputs will migrate',
    rd003Conflict: 'Uses engine load component; deceleration-as-braking weights — unchanged this phase',
    note: 'PRODUCTION_UNCHANGED_DI_EV_0034F',
  },
  {
    id: 'driving_impact_load_components',
    path: 'driving-impact/driving-impact-load-components.ts',
    stage: 'UI_DOWNSTREAM',
    inputSignal: 'scores + provenance',
    output: 'tireLoad, brakingLoad, engineLoad components',
    classification: 'KEEP_LEGACY_UNTIL_V2_CUTOVER',
    legacyScope: 'Load component derivation from legacy harsh-event inputs superseded at V2 cutover',
    frameworkPersistence: 'Provenance / assessability framework may remain',
    rd003Conflict: 'engineLoad from avgEngineLoad; BRAKING_PROXY_KINEMATICS acknowledged',
    note: 'PRODUCTION_UNCHANGED_DI_EV_0034F',
  },
  {
    id: 'lte_r1_behavior_enrichment',
    path: 'trips/lte-r1-behavior-enrichment.service.ts',
    stage: 'EVENT_DETECTOR',
    classification: 'KEEP_WITH_GATE',
    rd003Conflict: 'Sparse HF still fed to HF abuse path on some vehicles',
  },
] as const;

// ── RD004 validation contract ─────────────────────────────────────────────────

export const RD004_VALIDATION_CONTRACT = {
  status: 'PLANNED_NOT_STARTED',
  capture: {
    type: 'ONE_continuous_master_video',
    durationMinutes: '20-25',
    scenarios: 'S1-S13',
    independentTimeReference: 'second_phone_visible_at_start_and_end',
    focus: 'instrument_cluster',
  },
  mustValidate: [
    'absolute_speed_accuracy',
    'providerTimestamp_offset',
    'providerTimestamp_drift',
    'true_event_timing_error',
    'stable_cruise_false_dynamics',
    'acceleration_reconstruction',
    'candidate_cadence_gate',
    'rpm_confirmation',
    'throttle_confirmation',
    'tps_confirmation',
    'stop_launch_reconstruction',
    'deceleration_reconstruction',
    'gear_state',
    'direction_reverse_support',
    'long_continuous_telemetry_behavior',
    'stale_hold_behavior',
    'preprocessing_filter_response',
  ],
  preprocessingFilterResponse: {
    objective: 'PREPROCESSING_FILTER_RESPONSE',
    compare: ['qualified_raw_hf_speed', 'legacy_3_point_smoothed_preprocessed_speed'],
    measure: [
      'peak_attenuation',
      'event_start_shift',
      'event_end_shift',
      'duration_distortion',
      'false_event_suppression',
      'false_event_creation',
    ],
    runtimeChange: false,
    note: 'RD004 validation requirement only — do not change preprocessing runtime in design phase',
  },
  mustNotInvent: 'RD004 results — contract only',
  gatesNextPhases: ['DI-EV-0034G', 'DI-EV-0034H', 'DI-EV-0034I'],
} as const;

// ── Migration plan ────────────────────────────────────────────────────────────

export const MIGRATION_PLAN = {
  phases: [
    { id: 'DI-EV-0034F', title: 'Canonical Driving Intelligence Design', status: 'COMPLETE' },
    { id: 'DI-EV-0034F.1', title: 'Canonical Architecture Consistency Closeout', status: 'CURRENT' },
    { id: 'RD004', title: 'Controlled validation drive', status: 'PLANNED' },
    { id: 'DI-EV-0034G', title: 'RD004 Evidence Ingestion + Validation', status: 'PLANNED' },
    { id: 'DI-EV-0034H', title: 'Detector / Episode Parameter Calibration', status: 'PLANNED' },
    { id: 'DI-EV-0034I', title: 'Driving Behavior Dimension Calibration', status: 'PLANNED' },
    { id: 'DI-EV-0034J', title: 'Driving Score V2 Design', status: 'PLANNED' },
    { id: 'DI-EV-0034K', title: 'Brake / Tire Load Model Integration', status: 'PLANNED' },
  ],
  cutoverPolicy: 'Shadow validation before production score replacement',
  productionUnchangedInPhaseF: true,
} as const;

// ── Design invariants (for spec tests) ────────────────────────────────────────

export const DESIGN_INVARIANTS = {
  synqReceivedAtNotPhysicalAuthority: true,
  noAssumed1HzPhysicalCadence: true,
  noDerivativeAcrossStaleDuplicates: true,
  decelerationNotEquivalentToBraking: true,
  engineLoadNotVehicleMass: true,
  noExactGearShiftTiming: true,
  jerkNotDirectAuthority: true,
  latestLiveRequiresFreshnessGating: true,
  scoreRequiresEpisodeConfidence: true,
  noRawEventCountWithoutExposureNormalization: true,
  noLateralTireLoadWithoutEvidence: true,
  productionScoreUnchanged: true,
  tireRuntimeUnchanged: true,
  brakeRuntimeUnchanged: true,
  orthogonalStateLayers: true,
  physicalSeveritySeparatedFromConfidence: true,
  reconstructionConfidenceDistinctFromAttribution: true,
  nativeEventAuthorityPreserved: true,
  hfKinematicAuthorityScopeExplicit: true,
  derivedHfCannotBecomeProviderClassified: true,
  episodeOverlapPolicyDefined: true,
  primaryExposureDoubleCountPrevented: true,
  positiveNegativeDynamicsSeparated: true,
  massIndependentEnergyProxyExplicit: true,
  noObservedTireThermalLoad: true,
  providerAgePolicySurfaceAware: true,
  rd004PreprocessingValidationAdded: true,
  fleetComparableCohortRequired: true,
} as const;

export function assertDesignInvariants(): void {
  const violations: string[] = [];

  if (SIGNAL_AUTHORITY_MODEL.DELIVERY_DIAGNOSTIC_ONLY.forbiddenUse !== 'physical_event_time_authority') {
    violations.push('synqReceivedAt must not be physical event authority');
  }
  if (SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.medianPhysicalCadenceSeconds !== 2.0) {
    violations.push('must not assume 1 Hz physical cadence');
  }
  if (!QUALITY_GATE_DESIGN.rejectConditions.includes('duplicate_physical_sample_for_derivative')) {
    violations.push('must reject derivatives across stale duplicates');
  }
  if (EPISODE_TAXONOMY.semanticDistinctions.BRAKING_LIKELIHOOD.includes('NOT default')) {
    // ok
  } else {
    violations.push('deceleration must not default to braking');
  }
  if (!SIGNAL_AUTHORITY_MODEL.POWERTRAIN_STRESS_CONTEXT.forbiddenInterpretation.includes('vehicle_mass')) {
    violations.push('engine load must not be vehicle mass');
  }
  if (SIGNAL_AUTHORITY_MODEL.STATE_CONTEXT.gearChangeTimingSupported !== false) {
    violations.push('exact gear shift timing not supported');
  }
  if (SIGNAL_AUTHORITY_MODEL.DERIVED_KINEMATICS.jerk.directHarshEventAuthority !== false) {
    violations.push('jerk must not be direct harsh-event authority');
  }
  if (SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.notes.some((n) => n.includes('freshness proven'))) {
    // ok
  } else {
    violations.push('LATEST_LIVE must require freshness gating');
  }
  if (!EPISODE_CONFIDENCE_MODEL.rule.includes('reconstruction confidence')) {
    violations.push('score requires reconstruction confidence');
  }
  if (TRIP_FEATURE_VECTOR.normalization.rawEventCountAlone !== false) {
    violations.push('raw event count alone forbidden');
  }
  if (TIRE_LOAD_FOUNDATION.futureComponents.LATERAL_TIRE_LOAD.observable !== 'NOT_YET_OBSERVABLE') {
    violations.push('lateral tire load not directly observable');
  }
  if (PRODUCTION_SCORE_CHANGED !== 'NO' || PRODUCTION_DETECTORS_CHANGED !== 'NO') {
    violations.push('production must be unchanged');
  }
  if (TIRE_RUNTIME_CHANGED !== 'NO' || BRAKE_RUNTIME_CHANGED !== 'NO') {
    violations.push('tire/brake runtime must be unchanged');
  }
  if (DRIVING_STATE_MODEL.modelType !== 'ORTHOGONAL_LAYERS') {
    violations.push('state model must use orthogonal layers');
  }
  if (EPISODE_TAXONOMY.physicalSeverityModel.forbiddenDimensions.includes('confidence')) {
    // ok
  } else {
    violations.push('physical severity must not include confidence');
  }
  if (!EPISODE_CONFIDENCE_MODEL.layers.RECONSTRUCTION_CONFIDENCE) {
    violations.push('reconstruction confidence layer required');
  }
  if (!EPISODE_CONFIDENCE_MODEL.layers.ATTRIBUTION_CONFIDENCE) {
    violations.push('attribution confidence layer required');
  }
  if (
    SIGNAL_AUTHORITY_MODEL.DERIVED_HF_EVENT_EVIDENCE_CLASS.forbiddenSilentUpgradeTo !==
    'PROVIDER_CLASSIFIED'
  ) {
    violations.push('derived HF cannot silently become PROVIDER_CLASSIFIED');
  }
  if (
    EPISODE_TAXONOMY.compositionModel.overlapPolicy
      .ONE_PHYSICAL_INTERVAL_CANNOT_CREATE_DUPLICATE_PRIMARY_EXPOSURE !== 'YES'
  ) {
    violations.push('primary exposure double-count prevention required');
  }
  if (!TRIP_FEATURE_VECTOR.dynamicsSeparation.positiveAccelerationStats.length) {
    violations.push('positive acceleration stats must be separate');
  }
  if (!TRIP_FEATURE_VECTOR.energyProxySemantics.massIndependent) {
    violations.push('energy proxy must be mass-independent');
  }
  if (TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED !== false) {
    violations.push('tire thermal load must not be claimed as directly observed');
  }
  if (PROVIDER_AGE_POLICY !== 'SURFACE_AWARE') {
    violations.push('provider age policy must be surface-aware');
  }
  if (!RD004_VALIDATION_CONTRACT.mustValidate.includes('preprocessing_filter_response')) {
    violations.push('RD004 must include preprocessing filter response validation');
  }
  if (
    HIGH_TIMEFRAME_AGGREGATION.fleetRelativeComparison
      .FLEET_RELATIVE_COMPARISON_REQUIRES_COMPARABLE_COHORT !== 'YES'
  ) {
    violations.push('fleet comparison requires comparable cohort');
  }

  if (violations.length > 0) {
    throw new Error(`Design invariant violations: ${violations.join('; ')}`);
  }
}

// ── Export bundle ─────────────────────────────────────────────────────────────

export type CanonicalDesignArtifacts = {
  'current-vs-future-architecture.json': typeof CURRENT_PRODUCTION_COMPONENTS & {
    pipeline: typeof CANONICAL_PIPELINE_STAGES;
    migration: typeof MIGRATION_PLAN;
  };
  'signal-authority-model.json': typeof SIGNAL_AUTHORITY_MODEL;
  'quality-gate-design.json': typeof QUALITY_GATE_DESIGN;
  'driving-state-model.json': typeof DRIVING_STATE_MODEL;
  'episode-taxonomy.json': typeof EPISODE_TAXONOMY;
  'episode-confidence-model.json': typeof EPISODE_CONFIDENCE_MODEL;
  'trip-feature-vector.json': typeof TRIP_FEATURE_VECTOR;
  'driver-behavior-dimensions.json': typeof DRIVER_BEHAVIOR_DIMENSIONS;
  'high-timeframe-aggregation.json': typeof HIGH_TIMEFRAME_AGGREGATION;
  'brake-load-foundation.json': typeof BRAKE_LOAD_FOUNDATION;
  'tire-load-foundation.json': typeof TIRE_LOAD_FOUNDATION;
  'rd004-validation-contract.json': typeof RD004_VALIDATION_CONTRACT;
  'migration-plan.json': typeof MIGRATION_PLAN;
};

export function buildCanonicalDesignArtifacts(): Record<string, unknown> {
  return {
    'design-summary.json': {
      evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
      closeoutRevision: CANONICAL_DESIGN_CLOSEOUT_REVISION,
      mode: CANONICAL_DESIGN_MODE,
      evidenceClass: CANONICAL_DESIGN_EVIDENCE_CLASS,
      rd003Authority: RD003_AUTHORITY_PATH,
      PRIMARY_KINEMATIC_AUTHORITY: SIGNAL_AUTHORITY_MODEL.PRIMARY_KINEMATIC_AUTHORITY.signal,
      PHYSICAL_EVENT_TIME_AUTHORITY,
      ORTHOGONAL_STATE_MODEL_DESIGNED: 'YES',
      PHYSICAL_SEVERITY_SEPARATED_FROM_CONFIDENCE: 'YES',
      RECONSTRUCTION_CONFIDENCE_DESIGNED: 'YES',
      ATTRIBUTION_CONFIDENCE_DESIGNED: 'YES',
      NATIVE_EVENT_AUTHORITY_CONTRACT_PRESERVED: 'YES',
      HF_KINEMATIC_AUTHORITY_SCOPE_EXPLICIT: 'YES',
      EPISODE_OVERLAP_POLICY_DESIGNED: 'YES',
      PRIMARY_EXPOSURE_DOUBLE_COUNT_PREVENTED: 'YES',
      POSITIVE_NEGATIVE_DYNAMICS_SEPARATED: 'YES',
      MASS_INDEPENDENT_ENERGY_PROXY_EXPLICIT: 'YES',
      TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED: false,
      PROVIDER_AGE_POLICY,
      RD004_PREPROCESSING_RESPONSE_VALIDATION_ADDED: 'YES',
      FLEET_COMPARABLE_COHORT_REQUIREMENT_ADDED: 'YES',
      PRODUCTION_SCORE_CHANGED,
      PRODUCTION_DETECTORS_CHANGED,
      TIRE_RUNTIME_CHANGED,
      BRAKE_RUNTIME_CHANGED,
      DEPLOYED,
      BRAKE_FRICTION_USE_DIRECTLY_OBSERVABLE,
      LATERAL_TIRE_LOAD_DIRECTLY_OBSERVABLE,
      DESIGN_INVARIANTS,
      READY_FOR_RD004_CONTROLLED_VALIDATION: 'YES',
    },
    'current-vs-future-architecture.json': {
      evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
      closeoutRevision: CANONICAL_DESIGN_CLOSEOUT_REVISION,
      currentProduction: CURRENT_PRODUCTION_COMPONENTS,
      proposedPipeline: CANONICAL_PIPELINE_STAGES,
      physicalSampleNormalization: PHYSICAL_SAMPLE_NORMALIZATION,
      contextFairness: CONTEXT_FAIRNESS,
      v2AuthorityContractCompatibility: V2_AUTHORITY_CONTRACT_COMPATIBILITY,
      migration: MIGRATION_PLAN,
    },
    'signal-authority-model.json': SIGNAL_AUTHORITY_MODEL,
    'quality-gate-design.json': QUALITY_GATE_DESIGN,
    'driving-state-model.json': DRIVING_STATE_MODEL,
    'episode-taxonomy.json': EPISODE_TAXONOMY,
    'episode-confidence-model.json': EPISODE_CONFIDENCE_MODEL,
    'trip-feature-vector.json': TRIP_FEATURE_VECTOR,
    'driver-behavior-dimensions.json': DRIVER_BEHAVIOR_DIMENSIONS,
    'high-timeframe-aggregation.json': HIGH_TIMEFRAME_AGGREGATION,
    'brake-load-foundation.json': BRAKE_LOAD_FOUNDATION,
    'tire-load-foundation.json': TIRE_LOAD_FOUNDATION,
    'rd004-validation-contract.json': RD004_VALIDATION_CONTRACT,
    'migration-plan.json': MIGRATION_PLAN,
  };
}

export function canonicalDesignOutputSha256(): string {
  return artifactSha256(buildCanonicalDesignArtifacts());
}
