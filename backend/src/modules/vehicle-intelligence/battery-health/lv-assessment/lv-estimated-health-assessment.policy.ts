import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { BatteryPolicyProfile } from '../../battery-policy-profile/battery-policy-profile.types';
import {
  isCrankMeasurementType,
  isRestMeasurementType,
  LV_WORKSHOP_MEASUREMENT_TYPES,
} from '../../battery-policy-profile/battery-policy-profile.measurement-sets';
import type { ChemistryRestingBands } from '../../battery-policy-profile/battery-policy-profile.types';
import type { BatteryDataQualityStatus } from '../battery-data-quality';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
} from '../battery-freshness.policy';
import {
  BatteryEvidenceStrength,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import { LV_START_PROXY_SCORE_WEIGHT_PERCENT } from '../lv-start-proxy/lv-start-proxy-diagnostic.policy';
import {
  isLvRestShadowMeasurementContext,
} from '../lv-rest-window/lv-rest-shadow.policy';
import {
  LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION,
  LV_ESTIMATED_HEALTH_SCORE_WEIGHTS,
  LV_SHADOW_REST_SCORE_WEIGHT,
} from './lv-assessment-thresholds';
import {
  buildLvChemistryAssessmentContext,
  type LvAssessmentConfidenceLevel,
} from './lv-chemistry-assessment-context.policy';
import {
  selectLvAssessmentEvidence,
  type LvAssessmentEvidenceCandidate,
  type LvEvidenceSelectionResult,
  type SelectedLvAssessmentEvidence,
} from './lv-evidence-selection.policy';

export const LV_ESTIMATED_HEALTH_ASSESSMENT_POLICY_VERSION = '1.0.0';

export const LV_ASSESSMENT_TRACKS = ['TELEMETRY', 'WORKSHOP_OVERRIDE'] as const;
export type LvAssessmentTrack = (typeof LV_ASSESSMENT_TRACKS)[number];

export const LV_ASSESSMENT_MODES = ['CANONICAL', 'SHADOW'] as const;
export type LvAssessmentMode = (typeof LV_ASSESSMENT_MODES)[number];

export interface LvEstimatedHealthAssessmentReason {
  code: string;
  labelDe: string;
}

export interface LvMeasurementCoverage {
  selectedCount: number;
  rejectedCount: number;
  restMeasurementCount: number;
  startProxyCount: number;
  workshopMeasurementCount: number;
  shadowExperimentalCount: number;
  weightedInputCount: number;
  coverageRatio: number;
}

export interface LvEstimatedHealthAssessment {
  assessmentType: 'LV_ESTIMATED_HEALTH';
  /** Explicit marker — not workshop SOH %. */
  scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH';
  assessmentTrack: LvAssessmentTrack;
  assessmentMode: LvAssessmentMode;
  modelVersion: number;
  estimatedHealthScore: number | null;
  confidence: LvAssessmentConfidenceLevel;
  confidenceScore: number;
  evidenceStrength: BatteryEvidenceStrength;
  dataQuality: BatteryDataQualityStatus;
  measurementCoverage: LvMeasurementCoverage;
  validFrom: string;
  validUntil: string | null;
  publicationEligible: boolean;
  reasons: LvEstimatedHealthAssessmentReason[];
  idempotencyKey: string;
  inputSummary: Record<string, unknown>;
}

export interface ComputeLvEstimatedHealthAssessmentInput {
  vehicleId: string;
  policy: ResolvedBatteryPolicy;
  candidates: LvAssessmentEvidenceCandidate[];
  assessmentTrack?: LvAssessmentTrack | 'AUTO';
  assessmentMode?: LvAssessmentMode;
  now?: Date;
  ambientTemperatureC?: number | null;
  ambientTemperatureSource?: 'EXTERIOR_AIR' | 'TRIP_CONTEXT' | null;
}

export interface ComputeLvEstimatedHealthAssessmentResult {
  ok: boolean;
  unsupportedProfile: boolean;
  assessments: LvEstimatedHealthAssessment[];
  reasons: LvEstimatedHealthAssessmentReason[];
}

const WORKSHOP_TYPES = new Set<BatteryMeasurementType>(LV_WORKSHOP_MEASUREMENT_TYPES);

function reason(code: string, labelDe: string): LvEstimatedHealthAssessmentReason {
  return { code, labelDe };
}

function isWorkshopType(type: BatteryMeasurementType): boolean {
  return WORKSHOP_TYPES.has(type);
}

function isStartProxyType(type: BatteryMeasurementType): boolean {
  return (
    isCrankMeasurementType(type) || type === BatteryMeasurementType.PRE_START_VOLTAGE
  );
}

function isShadowExperimentalRest(
  candidate: LvAssessmentEvidenceCandidate,
): boolean {
  return (
    isRestMeasurementType(candidate.type) &&
    candidate.quality === BatteryMeasurementQuality.SHADOW &&
    isLvRestShadowMeasurementContext(candidate.context)
  );
}

function collectShadowRestCandidates(
  candidates: LvAssessmentEvidenceCandidate[],
): LvAssessmentEvidenceCandidate[] {
  return candidates.filter(isShadowExperimentalRest);
}

function scoreWeightForType(
  type: BatteryMeasurementType,
  shadowExperimental: boolean,
): number {
  if (shadowExperimental) {
    return LV_SHADOW_REST_SCORE_WEIGHT;
  }

  const weights = LV_ESTIMATED_HEALTH_SCORE_WEIGHTS;
  switch (type) {
    case BatteryMeasurementType.REST_6H:
      return weights.REST_6H;
    case BatteryMeasurementType.REST_60M:
      return weights.REST_60M;
    case BatteryMeasurementType.REST_AFTER_SHUTDOWN:
      return weights.REST_AFTER_SHUTDOWN;
    case BatteryMeasurementType.START_DIP_PROXY:
      return weights.START_DIP_PROXY;
    case BatteryMeasurementType.PRE_START_VOLTAGE:
      return weights.PRE_START_VOLTAGE;
    case BatteryMeasurementType.RECOVERY_5S_VOLTAGE:
      return weights.RECOVERY_5S_VOLTAGE;
    case BatteryMeasurementType.RECOVERY_30S_VOLTAGE:
      return weights.RECOVERY_30S_VOLTAGE;
    case BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE:
      return weights.RECOVERY_PROXY_VOLTAGE;
    case BatteryMeasurementType.WORKSHOP_OCV:
      return weights.WORKSHOP_OCV;
    case BatteryMeasurementType.WORKSHOP_LOAD_TEST:
      return weights.WORKSHOP_LOAD_TEST;
    default:
      return 0;
  }
}

function restingVoltageToHealthScore(
  voltageV: number,
  bands: ChemistryRestingBands,
): number {
  const { goodMinV, watchMinV, warningMinV } = bands;
  if (voltageV >= goodMinV) {
    return Math.min(100, Math.round(90 + (voltageV - goodMinV) * 40));
  }
  if (voltageV >= watchMinV) {
    const ratio = (voltageV - watchMinV) / (goodMinV - watchMinV);
    return Math.round(60 + ratio * 29);
  }
  if (voltageV >= warningMinV) {
    const ratio = (voltageV - warningMinV) / (watchMinV - warningMinV);
    return Math.round(40 + ratio * 19);
  }
  return Math.max(0, Math.round((voltageV / warningMinV) * 39));
}

function candidateNumericValue(
  measurementId: string,
  candidates: LvAssessmentEvidenceCandidate[],
): number | null {
  const row = candidates.find((c) => c.measurementId === measurementId);
  if (row?.numericValue == null || !Number.isFinite(row.numericValue)) {
    return null;
  }
  return row.numericValue;
}

function scoreFromEvidence(
  evidence: SelectedLvAssessmentEvidence,
  candidates: LvAssessmentEvidenceCandidate[],
  bands: ChemistryRestingBands | null,
  shadowExperimental: boolean,
): number | null {
  const numericValue = candidateNumericValue(evidence.measurementId, candidates);
  if (numericValue == null || !bands) return null;
  return restingVoltageToHealthScore(numericValue, bands);
}

function buildMeasurementCoverage(input: {
  selection: LvEvidenceSelectionResult;
  shadowExperimentalCount: number;
  weightedInputCount: number;
}): LvMeasurementCoverage {
  const selected = input.selection.selectedEvidence;
  const restMeasurementCount = selected.filter((row) =>
    isRestMeasurementType(row.type),
  ).length;
  const startProxyCount = selected.filter((row) => isStartProxyType(row.type)).length;
  const workshopMeasurementCount = selected.filter((row) =>
    isWorkshopType(row.type),
  ).length;
  const eligibleSlots = 3;
  const coverageRatio =
    input.weightedInputCount > 0
      ? Math.min(1, input.weightedInputCount / eligibleSlots)
      : 0;

  return {
    selectedCount: selected.length,
    rejectedCount: input.selection.rejectedEvidence.length,
    restMeasurementCount,
    startProxyCount,
    workshopMeasurementCount,
    shadowExperimentalCount: input.shadowExperimentalCount,
    weightedInputCount: input.weightedInputCount,
    coverageRatio,
  };
}

function buildEvidenceFingerprint(
  track: LvAssessmentTrack,
  mode: LvAssessmentMode,
  selection: LvEvidenceSelectionResult,
  shadowIds: string[],
): string {
  const ids = [
    ...selection.selectedEvidence.map((row) => row.measurementId),
    ...shadowIds,
  ].sort();
  return `${mode}:${track}:${ids.join('|') || 'none'}`;
}

export function buildLvEstimatedHealthAssessmentIdempotencyKey(input: {
  vehicleId: string;
  assessmentTrack: LvAssessmentTrack;
  assessmentMode: LvAssessmentMode;
  modelVersion?: number;
  evidenceFingerprint: string;
}): string {
  const version = input.modelVersion ?? LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION;
  return [
    'lv-estimated-health',
    input.vehicleId,
    input.assessmentMode,
    input.assessmentTrack,
    `m${version}`,
    input.evidenceFingerprint,
  ].join(':');
}

function filterSelectionForTrack(
  selection: LvEvidenceSelectionResult,
  track: LvAssessmentTrack,
): LvEvidenceSelectionResult {
  if (track === 'WORKSHOP_OVERRIDE') {
    const selected = selection.selectedEvidence.filter((row) =>
      isWorkshopType(row.type),
    );
    return {
      ...selection,
      selectedEvidence: selected,
      evidenceStrength:
        selected.length > 0
          ? BatteryEvidenceStrength.OVERRIDE
          : BatteryEvidenceStrength.NONE,
    };
  }

  const selected = selection.selectedEvidence.filter(
    (row) => !isWorkshopType(row.type),
  );
  return {
    ...selection,
    selectedEvidence: selected,
  };
}

function appendShadowEvidence(
  selection: LvEvidenceSelectionResult,
  shadowCandidates: LvAssessmentEvidenceCandidate[],
): SelectedLvAssessmentEvidence[] {
  const existing = new Set(selection.selectedEvidence.map((row) => row.measurementId));
  const appended: SelectedLvAssessmentEvidence[] = [];

  for (const candidate of shadowCandidates) {
    if (existing.has(candidate.measurementId)) continue;
    appended.push({
      measurementId: candidate.measurementId,
      type: candidate.type,
      quality: candidate.quality,
      observedAt: new Date(candidate.observedAt).toISOString(),
      evidenceStrength: BatteryEvidenceStrength.SUPPLEMENTARY,
      cycleKey: candidate.cycleKey ?? candidate.sessionId ?? null,
      sessionType:
        typeof candidate.sessionType === 'string' ? candidate.sessionType : null,
    });
  }

  return [...selection.selectedEvidence, ...appended];
}

function computeTrackAssessment(input: {
  vehicleId: string;
  policy: ResolvedBatteryPolicy;
  candidates: LvAssessmentEvidenceCandidate[];
  selection: LvEvidenceSelectionResult;
  track: LvAssessmentTrack;
  mode: LvAssessmentMode;
  shadowCandidates: LvAssessmentEvidenceCandidate[];
  now: Date;
  ambientTemperatureC?: number | null;
  ambientTemperatureSource?: 'EXTERIOR_AIR' | 'TRIP_CONTEXT' | null;
}): LvEstimatedHealthAssessment | null {
  const filtered = filterSelectionForTrack(input.selection, input.track);
  const selectedEvidence =
    input.mode === 'SHADOW'
      ? appendShadowEvidence(filtered, input.shadowCandidates)
      : filtered.selectedEvidence;

  if (selectedEvidence.length === 0) {
    return null;
  }

  const primaryRest = selectedEvidence.find((row) =>
    isRestMeasurementType(row.type),
  );
  const primaryWorkshop = selectedEvidence.find((row) => isWorkshopType(row.type));
  const primaryMeasurement = primaryWorkshop ?? primaryRest ?? selectedEvidence[0];

  const chemistryContext = buildLvChemistryAssessmentContext({
    policy: input.policy,
    restingVoltageV: candidateNumericValue(
      primaryMeasurement.measurementId,
      input.candidates,
    ),
    ambientTemperatureC: input.ambientTemperatureC,
    ambientTemperatureSource: input.ambientTemperatureSource,
    measurementType: primaryMeasurement.type,
    evidenceStrength: primaryMeasurement.evidenceStrength,
  });

  const bands = chemistryContext.restingBands;
  let weightedSum = 0;
  let totalWeight = 0;
  let weightedInputCount = 0;

  for (const evidence of selectedEvidence) {
    const shadowExperimental = input.shadowCandidates.some(
      (row) => row.measurementId === evidence.measurementId,
    );
    const weight = scoreWeightForType(evidence.type, shadowExperimental);
    if (weight <= 0) continue;

    const partial = scoreFromEvidence(
      evidence,
      input.candidates,
      bands,
      shadowExperimental,
    );
    if (partial == null) continue;

    weightedSum += partial * weight;
    totalWeight += weight;
    weightedInputCount += 1;
  }

  const estimatedHealthScore =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

  const reasons: LvEstimatedHealthAssessmentReason[] = [
    reason('score_is_not_soh', 'Geschätzter Verhaltenszustand — kein Werkstatt-SOH'),
  ];

  if (LV_START_PROXY_SCORE_WEIGHT_PERCENT === 0) {
    reasons.push(
      reason(
        'start_proxy_zero_weight',
        'Start-Proxy trägt initial 0 % zum Score bei',
      ),
    );
  }

  if (input.mode === 'SHADOW') {
    reasons.push(
      reason(
        'shadow_experimental_rest',
        'Shadow-Assessment mit experimentellen Ruhemessungen — nicht publizierbar',
      ),
    );
  }

  if (input.track === 'WORKSHOP_OVERRIDE') {
    reasons.push(
      reason(
        'workshop_override_track',
        'Separates Werkstatt-Assessment mit höherwertiger Evidence',
      ),
    );
  }

  if (chemistryContext.temperatureUncertainty) {
    reasons.push(
      reason(
        'temperature_uncertain',
        chemistryContext.temperatureUncertaintyLabelDe ??
          'Temperaturbedingte Unsicherheit',
      ),
    );
  }

  if (estimatedHealthScore == null) {
    reasons.push(
      reason('insufficient_weighted_inputs', 'Keine gewichteten Score-Inputs'),
    );
  }

  const shadowExperimentalCount = selectedEvidence.filter((row) =>
    input.shadowCandidates.some((c) => c.measurementId === row.measurementId),
  ).length;

  const measurementCoverage = buildMeasurementCoverage({
    selection: { ...filtered, selectedEvidence },
    shadowExperimentalCount,
    weightedInputCount,
  });

  const observedTimes = selectedEvidence
    .map((row) => new Date(row.observedAt).getTime())
    .filter((ms) => Number.isFinite(ms));
  const validFrom =
    observedTimes.length > 0
      ? new Date(Math.min(...observedTimes)).toISOString()
      : input.now.toISOString();
  const validUntil = new Date(
    input.now.getTime() + BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation,
  ).toISOString();

  const evidenceFingerprint = buildEvidenceFingerprint(
    input.track,
    input.mode,
    { ...filtered, selectedEvidence },
    input.shadowCandidates.map((row) => row.measurementId),
  );

  return {
    assessmentType: 'LV_ESTIMATED_HEALTH',
    scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
    assessmentTrack: input.track,
    assessmentMode: input.mode,
    modelVersion: LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION,
    estimatedHealthScore,
    confidence: chemistryContext.confidence,
    confidenceScore: chemistryContext.confidenceScore,
    evidenceStrength:
      input.track === 'WORKSHOP_OVERRIDE'
        ? BatteryEvidenceStrength.OVERRIDE
        : filtered.evidenceStrength,
    dataQuality: filtered.dataQuality,
    measurementCoverage,
    validFrom,
    validUntil,
    publicationEligible:
      input.mode === 'CANONICAL' &&
      estimatedHealthScore != null &&
      chemistryContext.confidence !== 'INSUFFICIENT',
    reasons,
    idempotencyKey: buildLvEstimatedHealthAssessmentIdempotencyKey({
      vehicleId: input.vehicleId,
      assessmentTrack: input.track,
      assessmentMode: input.mode,
      evidenceFingerprint,
    }),
    inputSummary: {
      policyProfile: input.policy.profile,
      chemistry: input.policy.chemistry,
      evidenceWindow: filtered.evidenceWindow,
      selectedMeasurementIds: selectedEvidence.map((row) => row.measurementId),
      rejectedMeasurementIds: input.selection.rejectedEvidence.map(
        (row) => row.measurementId,
      ),
      thresholdsVersion: chemistryContext.thresholdsVersion,
      contextVersion: chemistryContext.contextVersion,
      hysteresisDeferredToPublication: true,
    },
  };
}

function isSupportedAssessmentProfile(policy: ResolvedBatteryPolicy): boolean {
  return (
    policy.lvAssessmentAllowed &&
    policy.profile !== BatteryPolicyProfile.UNSUPPORTED_PROFILE &&
    policy.profile !== BatteryPolicyProfile.UNKNOWN_PROFILE
  );
}

/**
 * Computes versioned LV estimated-health assessments.
 * Hysteresis is intentionally deferred to the publication step.
 */
export function computeLvEstimatedHealthAssessment(
  input: ComputeLvEstimatedHealthAssessmentInput,
): ComputeLvEstimatedHealthAssessmentResult {
  const now = input.now ?? new Date();
  const mode = input.assessmentMode ?? 'CANONICAL';
  const track = input.assessmentTrack ?? 'AUTO';

  if (!isSupportedAssessmentProfile(input.policy)) {
    return {
      ok: false,
      unsupportedProfile: true,
      assessments: [],
      reasons: [
        reason(
          'unsupported_profile',
          'Kein LV-Assessment ohne unterstütztes Profil',
        ),
      ],
    };
  }

  const canonicalSelection = selectLvAssessmentEvidence({
    policy: input.policy,
    candidates: input.candidates,
    now,
  });

  const shadowCandidates =
    mode === 'SHADOW' ? collectShadowRestCandidates(input.candidates) : [];

  if (
    canonicalSelection.selectedEvidence.length === 0 &&
    shadowCandidates.length === 0
  ) {
    return {
      ok: false,
      unsupportedProfile: false,
      assessments: [],
      reasons: [
        reason('missing_evidence', 'Keine auswählbare Evidence für Assessment'),
      ],
    };
  }

  const assessments: LvEstimatedHealthAssessment[] = [];
  const tracks: LvAssessmentTrack[] =
    track === 'AUTO'
      ? canonicalSelection.selectedEvidence.some((row) => isWorkshopType(row.type))
        ? ['WORKSHOP_OVERRIDE', 'TELEMETRY']
        : ['TELEMETRY']
      : [track];

  for (const assessmentTrack of tracks) {
    const computed = computeTrackAssessment({
      vehicleId: input.vehicleId,
      policy: input.policy,
      candidates: input.candidates,
      selection: canonicalSelection,
      track: assessmentTrack,
      mode,
      shadowCandidates,
      now,
      ambientTemperatureC: input.ambientTemperatureC,
      ambientTemperatureSource: input.ambientTemperatureSource,
    });
    if (computed) {
      assessments.push(computed);
    }
  }

  if (assessments.length === 0) {
    return {
      ok: false,
      unsupportedProfile: false,
      assessments: [],
      reasons: [
        reason('missing_evidence', 'Keine auswählbare Evidence für Assessment'),
      ],
    };
  }

  return {
    ok: true,
    unsupportedProfile: false,
    assessments,
    reasons: [],
  };
}
