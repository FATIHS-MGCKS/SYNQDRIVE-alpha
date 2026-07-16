import { isLegacyCrankAssessmentEnabled } from '@config/battery-health-v2.config';
import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { BatteryPolicyProfile } from '../../battery-policy-profile/battery-policy-profile.types';
import {
  isCrankMeasurementType,
  isRestMeasurementType,
  LV_WORKSHOP_MEASUREMENT_TYPES,
} from '../../battery-policy-profile/battery-policy-profile.measurement-sets';
import { isMeasurementAllowedForPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  aggregateBatteryDataQuality,
  type BatteryDataQualityStatus,
} from '../battery-data-quality';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from '../battery-freshness.policy';
import { LV_TEMPORAL_INCOMPATIBILITY_MS } from '../battery-legacy-publication-safety';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceStrength,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import { CRANK_MIN_MEASUREMENT_KIND } from '../battery-crank-policy';
import { isLvRestMeasurementContaminated } from '../lv-rest-window/lv-rest-measurement-quality';

/** Documented evidence-selection contract — bump when combine rules change. */
export const LV_EVIDENCE_SELECTION_POLICY_VERSION = '1.0.0';

export const LV_EVIDENCE_REJECTION_REASONS = {
  UNSUPPORTED_PROFILE: {
    code: 'UNSUPPORTED_PROFILE',
    labelDe: 'LV-Assessment für dieses Fahrzeugprofil nicht unterstützt',
  },
  UNSUPPORTED_MEASUREMENT_TYPE: {
    code: 'UNSUPPORTED_MEASUREMENT_TYPE',
    labelDe: 'Messart für Profil nicht unterstützt',
  },
  UNKNOWN_CHEMISTRY: {
    code: 'UNKNOWN_CHEMISTRY',
    labelDe: 'Unbekannte oder nicht unterstützte Chemie',
  },
  BEV_WITHOUT_LV_SIGNAL: {
    code: 'BEV_WITHOUT_LV_SIGNAL',
    labelDe: 'BEV ohne LV-Signal — keine LV-Evidence',
  },
  QUALITY_NOT_VALID: {
    code: 'QUALITY_NOT_VALID',
    labelDe: 'Qualität nicht VALID',
  },
  VALID_PROXY_NOT_REST_EQUIVALENT: {
    code: 'VALID_PROXY_NOT_REST_EQUIVALENT',
    labelDe: 'Proxy ist keine gleichwertige qualifizierte Ruhe-Evidence',
  },
  CONTAMINATED_MEASUREMENT: {
    code: 'CONTAMINATED_MEASUREMENT',
    labelDe: 'Kontaminierte Messung',
  },
  STALE_MEASUREMENT: {
    code: 'STALE_MEASUREMENT',
    labelDe: 'Messung nicht mehr fresh genug',
  },
  INCOMPLETE_PROVENANCE: {
    code: 'INCOMPLETE_PROVENANCE',
    labelDe: 'Unvollständige Provenienz',
  },
  LEGACY_CRANK_DEPRECATED: {
    code: 'LEGACY_CRANK_DEPRECATED',
    labelDe: 'Legacy-Crank ist nicht entscheidungsfähig',
  },
  TEMPORALLY_INCOMPATIBLE_PERIOD: {
    code: 'TEMPORALLY_INCOMPATIBLE_PERIOD',
    labelDe: 'Zeitlich inkompatible Rest-/Startperiode',
  },
  DIAGNOSTIC_ONLY_START_PROXY: {
    code: 'DIAGNOSTIC_ONLY_START_PROXY',
    labelDe: 'Start-Proxy nur diagnostisch — kein Assessment-Input',
  },
  MIXED_INCOMPATIBLE_LIFECYCLES: {
    code: 'MIXED_INCOMPATIBLE_LIFECYCLES',
    labelDe: 'Messzyklen aus verschiedenen inkompatiblen Lebenszyklen',
  },
} as const;

export type LvEvidenceRejectionReason =
  (typeof LV_EVIDENCE_REJECTION_REASONS)[keyof typeof LV_EVIDENCE_REJECTION_REASONS]['code'];

export interface LvAssessmentEvidenceProvenance {
  providerTimestamp?: Date | string | null;
  receivedAt?: Date | string | null;
  sourceType?: string | null;
  measurementKind?: string | null;
  tripId?: string | null;
  restWindowId?: string | null;
  documentExtractionId?: string | null;
  serviceEventId?: string | null;
}

export interface LvAssessmentEvidenceCandidate {
  measurementId: string;
  type: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  observedAt: Date | string;
  sessionId?: string | null;
  sessionType?: BatteryMeasurementSessionType | string | null;
  numericValue?: number | null;
  context?: Record<string, unknown> | null;
  provenance?: LvAssessmentEvidenceProvenance | null;
  /** Explicit cycle anchor — rest window id or ICE start trip id. */
  cycleKey?: string | null;
}

export interface LvEvidenceSelectionInput {
  policy: ResolvedBatteryPolicy;
  candidates: LvAssessmentEvidenceCandidate[];
  now?: Date;
}

export interface SelectedLvAssessmentEvidence {
  measurementId: string;
  type: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  observedAt: string;
  evidenceStrength: BatteryEvidenceStrength;
  cycleKey: string | null;
  sessionType: string | null;
}

export interface RejectedLvAssessmentEvidence {
  measurementId: string;
  type: BatteryMeasurementType;
  reasons: LvEvidenceRejectionReason[];
  reasonLabels: string[];
}

export interface LvAssessmentEvidenceWindow {
  restPeriodKey: string | null;
  startPeriodKey: string | null;
  windowStartAt: string | null;
  windowEndAt: string | null;
  temporallyCompatible: boolean;
}

export interface LvEvidenceSelectionResult {
  policyVersion: string;
  selectedEvidence: SelectedLvAssessmentEvidence[];
  rejectedEvidence: RejectedLvAssessmentEvidence[];
  evidenceWindow: LvAssessmentEvidenceWindow;
  evidenceStrength: BatteryEvidenceStrength;
  dataQuality: BatteryDataQualityStatus;
}

const STRENGTH_RANK: Record<BatteryEvidenceStrength, number> = {
  [BatteryEvidenceStrength.OVERRIDE]: 4,
  [BatteryEvidenceStrength.PRIMARY]: 3,
  [BatteryEvidenceStrength.SUPPLEMENTARY]: 2,
  [BatteryEvidenceStrength.DIAGNOSTIC]: 1,
  [BatteryEvidenceStrength.NONE]: 0,
};

const WORKSHOP_TYPES = new Set<BatteryMeasurementType>(LV_WORKSHOP_MEASUREMENT_TYPES);

const NON_EVIDENCE_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.INSUFFICIENT_CADENCE,
  BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
  BatteryMeasurementQuality.STALE,
  BatteryMeasurementQuality.MISSING_CONTEXT,
  BatteryMeasurementQuality.MISSED,
  BatteryMeasurementQuality.UNSUPPORTED_PROFILE,
  BatteryMeasurementQuality.PROVIDER_DELAY,
  BatteryMeasurementQuality.PROVIDER_ERROR,
  BatteryMeasurementQuality.NO_DATA,
  BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
]);

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function reasonLabels(reasons: LvEvidenceRejectionReason[]): string[] {
  return reasons.map(
    (code) =>
      Object.values(LV_EVIDENCE_REJECTION_REASONS).find((r) => r.code === code)
        ?.labelDe ?? code,
  );
}

function isWorkshopMeasurement(type: BatteryMeasurementType): boolean {
  return WORKSHOP_TYPES.has(type);
}

function isStartProxyMeasurement(
  candidate: LvAssessmentEvidenceCandidate,
): boolean {
  if (isCrankMeasurementType(candidate.type)) {
    return true;
  }
  if (candidate.type === BatteryMeasurementType.PRE_START_VOLTAGE) {
    return true;
  }
  return candidate.sessionType === BatteryMeasurementSessionType.ICE_START_PROXY;
}

function isRestMeasurement(candidate: LvAssessmentEvidenceCandidate): boolean {
  return (
    isRestMeasurementType(candidate.type) ||
    candidate.sessionType === BatteryMeasurementSessionType.LV_REST_WINDOW
  );
}

function resolveCycleKey(candidate: LvAssessmentEvidenceCandidate): string | null {
  if (candidate.cycleKey?.trim()) {
    return candidate.cycleKey.trim();
  }
  if (candidate.sessionId?.trim()) {
    return candidate.sessionId.trim();
  }
  const prov = candidate.provenance ?? {};
  if (isStartProxyMeasurement(candidate) && prov.tripId?.trim()) {
    return `ice-start-proxy:${prov.tripId.trim()}`;
  }
  if (isRestMeasurement(candidate) && prov.restWindowId?.trim()) {
    return `lv-rest:${prov.restWindowId.trim()}`;
  }
  return null;
}

function hasCompleteProvenance(
  candidate: LvAssessmentEvidenceCandidate,
  policy: ResolvedBatteryPolicy,
): boolean {
  const prov = candidate.provenance ?? {};

  if (isWorkshopMeasurement(candidate.type)) {
    return (
      toMs(prov.receivedAt) != null ||
      Boolean(prov.serviceEventId?.trim())
    );
  }

  if (prov.documentExtractionId?.trim()) {
    return toMs(prov.receivedAt) != null;
  }

  if (policy.minimumContext.lvLiveRequiresProviderTimestamp) {
    if (toMs(prov.providerTimestamp) == null) {
      return false;
    }
  }

  return toMs(prov.receivedAt) != null;
}

function freshnessThresholdMs(
  candidate: LvAssessmentEvidenceCandidate,
): number {
  if (isRestMeasurement(candidate)) {
    return BATTERY_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation;
  }
  if (isStartProxyMeasurement(candidate)) {
    return BATTERY_FRESHNESS_THRESHOLDS_MS.startProxyObservation;
  }
  if (isWorkshopMeasurement(candidate.type)) {
    return BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation;
  }
  return BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation;
}

function isFreshMeasurement(
  candidate: LvAssessmentEvidenceCandidate,
  now: Date,
): boolean {
  const freshness = buildObservationFreshness({
    observedAt: candidate.observedAt,
    maxAgeMs: freshnessThresholdMs(candidate),
    now,
    hasValueCarrier: candidate.numericValue != null,
  });
  return observationFreshnessIsDecisionFresh(freshness);
}

function resolveCandidateStrength(
  candidate: LvAssessmentEvidenceCandidate,
): BatteryEvidenceStrength {
  if (isWorkshopMeasurement(candidate.type)) {
    return BatteryEvidenceStrength.OVERRIDE;
  }
  if (isStartProxyMeasurement(candidate)) {
    return BatteryEvidenceStrength.DIAGNOSTIC;
  }
  if (
    isRestMeasurement(candidate) &&
    candidate.quality === BatteryMeasurementQuality.VALID
  ) {
    return BatteryEvidenceStrength.PRIMARY;
  }
  if (candidate.quality === BatteryMeasurementQuality.VALID_PROXY) {
    return BatteryEvidenceStrength.SUPPLEMENTARY;
  }
  return BatteryEvidenceStrength.NONE;
}

function evaluateGlobalProfileGate(
  policy: ResolvedBatteryPolicy,
): LvEvidenceRejectionReason | null {
  if (
    policy.driveProfile === BatteryDriveProfile.BEV &&
    policy.profile === BatteryPolicyProfile.UNSUPPORTED_PROFILE
  ) {
    return 'BEV_WITHOUT_LV_SIGNAL';
  }

  if (policy.chemistry === BatteryChemistry.UNKNOWN) {
    return 'UNKNOWN_CHEMISTRY';
  }

  if (
    policy.profile === BatteryPolicyProfile.UNSUPPORTED_PROFILE ||
    !policy.lvAssessmentAllowed
  ) {
    return 'UNSUPPORTED_PROFILE';
  }

  return null;
}

function evaluateCandidateReasons(input: {
  candidate: LvAssessmentEvidenceCandidate;
  policy: ResolvedBatteryPolicy;
  now: Date;
  allCandidates: LvAssessmentEvidenceCandidate[];
}): LvEvidenceRejectionReason[] {
  const { candidate, policy, now, allCandidates } = input;
  const reasons: LvEvidenceRejectionReason[] = [];

  if (
    !isMeasurementAllowedForPolicy(policy, candidate.type, {
      confirmedIceStart:
        candidate.context?.confirmedIceStart === true ||
        candidate.provenance?.sourceType === 'confirmed_ice_start',
    })
  ) {
    reasons.push('UNSUPPORTED_MEASUREMENT_TYPE');
  }

  if (isLvRestMeasurementContaminated(candidate.quality)) {
    reasons.push('CONTAMINATED_MEASUREMENT');
  }

  if (isRestMeasurement(candidate)) {
    if (candidate.quality === BatteryMeasurementQuality.VALID_PROXY) {
      reasons.push('VALID_PROXY_NOT_REST_EQUIVALENT');
    } else if (
      candidate.quality !== BatteryMeasurementQuality.VALID &&
      !isLvRestMeasurementContaminated(candidate.quality)
    ) {
      reasons.push('QUALITY_NOT_VALID');
    }
  } else if (isStartProxyMeasurement(candidate)) {
    if (
      candidate.quality !== BatteryMeasurementQuality.VALID &&
      candidate.quality !== BatteryMeasurementQuality.VALID_PROXY
    ) {
      reasons.push('QUALITY_NOT_VALID');
    }
  } else if (NON_EVIDENCE_QUALITIES.has(candidate.quality)) {
    reasons.push('QUALITY_NOT_VALID');
  }

  if (
    candidate.provenance?.measurementKind === CRANK_MIN_MEASUREMENT_KIND &&
    !isLegacyCrankAssessmentEnabled()
  ) {
    reasons.push('LEGACY_CRANK_DEPRECATED');
  }

  if (!hasCompleteProvenance(candidate, policy)) {
    reasons.push('INCOMPLETE_PROVENANCE');
  }

  const evidenceCapableQuality =
    candidate.quality === BatteryMeasurementQuality.VALID ||
    candidate.quality === BatteryMeasurementQuality.VALID_PROXY;

  if (evidenceCapableQuality && !isFreshMeasurement(candidate, now)) {
    if (isStartProxyMeasurement(candidate)) {
      const freshRestTimes = allCandidates
        .filter(
          (row) =>
            isRestMeasurement(row) &&
            row.quality === BatteryMeasurementQuality.VALID &&
            isFreshMeasurement(row, now),
        )
        .map((row) => toMs(row.observedAt))
        .filter((ms): ms is number => ms != null);
      const startMs = toMs(candidate.observedAt);
      const incompatibleWithFreshRest =
        startMs != null &&
        freshRestTimes.some(
          (restMs) =>
            Math.abs(restMs - startMs) > LV_TEMPORAL_INCOMPATIBILITY_MS,
        );
      reasons.push(
        incompatibleWithFreshRest
          ? 'TEMPORALLY_INCOMPATIBLE_PERIOD'
          : 'STALE_MEASUREMENT',
      );
    } else {
      reasons.push('STALE_MEASUREMENT');
    }
  }

  return reasons;
}

function pickDominantRestPeriod(
  eligible: LvAssessmentEvidenceCandidate[],
): string | null {
  const rest = eligible.filter(isRestMeasurement);
  if (rest.length === 0) return null;

  const byCycle = new Map<string, LvAssessmentEvidenceCandidate[]>();
  for (const row of rest) {
    const key = resolveCycleKey(row) ?? `observed:${toMs(row.observedAt)}`;
    const bucket = byCycle.get(key) ?? [];
    bucket.push(row);
    byCycle.set(key, bucket);
  }

  let bestKey: string | null = null;
  let bestScore = -1;
  for (const [key, rows] of byCycle) {
    const validCount = rows.filter(
      (r) => r.quality === BatteryMeasurementQuality.VALID,
    ).length;
    const latestMs = Math.max(...rows.map((r) => toMs(r.observedAt) ?? 0));
    const score = validCount * 1_000_000_000_000 + latestMs;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

function pickDominantStartPeriod(
  eligible: LvAssessmentEvidenceCandidate[],
): string | null {
  const start = eligible.filter(isStartProxyMeasurement);
  if (start.length === 0) return null;

  const latest = start.reduce((best, row) => {
    const ms = toMs(row.observedAt) ?? 0;
    const bestMs = toMs(best.observedAt) ?? 0;
    return ms >= bestMs ? row : best;
  });

  return resolveCycleKey(latest);
}

function applyLifecycleCompatibility(input: {
  eligible: LvAssessmentEvidenceCandidate[];
  restPeriodKey: string | null;
  startPeriodKey: string | null;
}): {
  selected: LvAssessmentEvidenceCandidate[];
  rejected: Array<{
    candidate: LvAssessmentEvidenceCandidate;
    reasons: LvEvidenceRejectionReason[];
  }>;
} {
  const { eligible, restPeriodKey, startPeriodKey } = input;
  const selected: LvAssessmentEvidenceCandidate[] = [];
  const rejected: Array<{
    candidate: LvAssessmentEvidenceCandidate;
    reasons: LvEvidenceRejectionReason[];
  }> = [];

  const restRows = eligible.filter(isRestMeasurement);
  const startRows = eligible.filter(isStartProxyMeasurement);
  const otherRows = eligible.filter(
    (row) => !isRestMeasurement(row) && !isStartProxyMeasurement(row),
  );

  const latestRestMs =
    restRows.length > 0
      ? Math.max(...restRows.map((r) => toMs(r.observedAt) ?? 0))
      : null;
  const latestStartMs =
    startRows.length > 0
      ? Math.max(...startRows.map((r) => toMs(r.observedAt) ?? 0))
      : null;

  const temporallyCompatible =
    latestRestMs == null ||
    latestStartMs == null ||
    Math.abs(latestRestMs - latestStartMs) <= LV_TEMPORAL_INCOMPATIBILITY_MS;

  for (const row of restRows) {
    const cycle = resolveCycleKey(row);
    if (restPeriodKey && cycle && cycle !== restPeriodKey) {
      rejected.push({
        candidate: row,
        reasons: ['MIXED_INCOMPATIBLE_LIFECYCLES'],
      });
      continue;
    }
    selected.push(row);
  }

  for (const row of startRows) {
    const cycle = resolveCycleKey(row);
    if (startPeriodKey && cycle && cycle !== startPeriodKey) {
      rejected.push({
        candidate: row,
        reasons: ['MIXED_INCOMPATIBLE_LIFECYCLES'],
      });
      continue;
    }
    if (!temporallyCompatible) {
      rejected.push({
        candidate: row,
        reasons: ['TEMPORALLY_INCOMPATIBLE_PERIOD'],
      });
      continue;
    }
    selected.push(row);
  }

  for (const row of otherRows) {
    selected.push(row);
  }

  return { selected, rejected };
}

function aggregateEvidenceStrength(
  selected: SelectedLvAssessmentEvidence[],
): BatteryEvidenceStrength {
  if (selected.length === 0) {
    return BatteryEvidenceStrength.NONE;
  }
  return selected.reduce((best, row) =>
    STRENGTH_RANK[row.evidenceStrength] > STRENGTH_RANK[best]
      ? row.evidenceStrength
      : best,
  selected[0].evidenceStrength);
}

function resolveSelectionDataQuality(input: {
  selected: SelectedLvAssessmentEvidence[];
  evidenceStrength: BatteryEvidenceStrength;
}): BatteryDataQualityStatus {
  if (input.selected.length === 0) {
    return 'UNAVAILABLE';
  }

  const statuses: BatteryDataQualityStatus[] = input.selected.map((row) => {
    if (row.evidenceStrength === BatteryEvidenceStrength.OVERRIDE) {
      return 'VERIFIED';
    }
    if (
      row.evidenceStrength === BatteryEvidenceStrength.PRIMARY &&
      row.quality === BatteryMeasurementQuality.VALID
    ) {
      return 'ESTIMATED';
    }
    if (row.evidenceStrength === BatteryEvidenceStrength.DIAGNOSTIC) {
      return 'PROXY';
    }
    if (row.evidenceStrength === BatteryEvidenceStrength.SUPPLEMENTARY) {
      return 'PROXY';
    }
    return 'UNAVAILABLE';
  });

  const aggregate = aggregateBatteryDataQuality(statuses);
  if (
    input.evidenceStrength === BatteryEvidenceStrength.DIAGNOSTIC &&
    aggregate === 'ESTIMATED'
  ) {
    return 'PROXY';
  }
  return aggregate;
}

function buildEvidenceWindow(
  selected: SelectedLvAssessmentEvidence[],
  temporallyCompatible: boolean,
): LvAssessmentEvidenceWindow {
  if (selected.length === 0) {
    return {
      restPeriodKey: null,
      startPeriodKey: null,
      windowStartAt: null,
      windowEndAt: null,
      temporallyCompatible: true,
    };
  }

  const restPeriodKey =
    selected.find((row) => isRestMeasurementType(row.type))?.cycleKey ?? null;
  const startPeriodKey =
    selected.find(
      (row) =>
        isCrankMeasurementType(row.type) ||
        row.type === BatteryMeasurementType.PRE_START_VOLTAGE,
    )?.cycleKey ?? null;

  const times = selected
    .map((row) => toMs(row.observedAt))
    .filter((ms): ms is number => ms != null);

  return {
    restPeriodKey,
    startPeriodKey,
    windowStartAt:
      times.length > 0
        ? new Date(Math.min(...times)).toISOString()
        : null,
    windowEndAt:
      times.length > 0
        ? new Date(Math.max(...times)).toISOString()
        : null,
    temporallyCompatible,
  };
}

function emptyResult(
  rejected: RejectedLvAssessmentEvidence[],
): LvEvidenceSelectionResult {
  return {
    policyVersion: LV_EVIDENCE_SELECTION_POLICY_VERSION,
    selectedEvidence: [],
    rejectedEvidence: rejected,
    evidenceWindow: buildEvidenceWindow([], true),
    evidenceStrength: BatteryEvidenceStrength.NONE,
    dataQuality: 'UNAVAILABLE',
  };
}

/**
 * Central LV assessment evidence selection — combines only compatible periods,
 * VALID rest evidence, fresh measurements, and complete provenance.
 */
export function selectLvAssessmentEvidence(
  input: LvEvidenceSelectionInput,
): LvEvidenceSelectionResult {
  const now = input.now ?? new Date();
  const globalReason = evaluateGlobalProfileGate(input.policy);

  if (globalReason) {
    const rejected = input.candidates.map((candidate) => ({
      measurementId: candidate.measurementId,
      type: candidate.type,
      reasons: [globalReason],
      reasonLabels: reasonLabels([globalReason]),
    }));
    return emptyResult(rejected);
  }

  const perCandidateRejected: RejectedLvAssessmentEvidence[] = [];
  const eligible: LvAssessmentEvidenceCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = evaluateCandidateReasons({
      candidate,
      policy: input.policy,
      now,
      allCandidates: input.candidates,
    });
    if (reasons.length > 0) {
      perCandidateRejected.push({
        measurementId: candidate.measurementId,
        type: candidate.type,
        reasons,
        reasonLabels: reasonLabels(reasons),
      });
    } else {
      eligible.push(candidate);
    }
  }

  if (eligible.length === 0) {
    return emptyResult(perCandidateRejected);
  }

  const restPeriodKey = pickDominantRestPeriod(eligible);
  const startPeriodKey = pickDominantStartPeriod(eligible);

  const lifecycle = applyLifecycleCompatibility({
    eligible,
    restPeriodKey,
    startPeriodKey,
  });

  const compatibilityRejected: RejectedLvAssessmentEvidence[] =
    lifecycle.rejected.map(({ candidate, reasons }) => ({
      measurementId: candidate.measurementId,
      type: candidate.type,
      reasons,
      reasonLabels: reasonLabels(reasons),
    }));

  const allRejected = [...perCandidateRejected, ...compatibilityRejected];
  const hasTemporalIncompatibility = allRejected.some((row) =>
    row.reasons.includes('TEMPORALLY_INCOMPATIBLE_PERIOD'),
  );

  const latestRestMs = lifecycle.selected
    .filter(isRestMeasurement)
    .map((r) => toMs(r.observedAt) ?? 0)
    .reduce((max, ms) => Math.max(max, ms), 0);
  const latestStartMs = lifecycle.selected
    .filter(isStartProxyMeasurement)
    .map((r) => toMs(r.observedAt) ?? 0)
    .reduce((max, ms) => Math.max(max, ms), 0);
  const temporallyCompatible =
    !hasTemporalIncompatibility &&
    (latestRestMs === 0 ||
      latestStartMs === 0 ||
      Math.abs(latestRestMs - latestStartMs) <= LV_TEMPORAL_INCOMPATIBILITY_MS);

  const selectedEvidence: SelectedLvAssessmentEvidence[] = lifecycle.selected.map(
    (candidate) => ({
      measurementId: candidate.measurementId,
      type: candidate.type,
      quality: candidate.quality,
      observedAt: new Date(candidate.observedAt).toISOString(),
      evidenceStrength: resolveCandidateStrength(candidate),
      cycleKey: resolveCycleKey(candidate),
      sessionType:
        typeof candidate.sessionType === 'string' ? candidate.sessionType : null,
    }),
  );

  const evidenceStrength = aggregateEvidenceStrength(selectedEvidence);
  const dataQuality = resolveSelectionDataQuality({
    selected: selectedEvidence,
    evidenceStrength,
  });

  return {
    policyVersion: LV_EVIDENCE_SELECTION_POLICY_VERSION,
    selectedEvidence,
    rejectedEvidence: allRejected,
    evidenceWindow: buildEvidenceWindow(selectedEvidence, temporallyCompatible),
    evidenceStrength,
    dataQuality,
  };
}
