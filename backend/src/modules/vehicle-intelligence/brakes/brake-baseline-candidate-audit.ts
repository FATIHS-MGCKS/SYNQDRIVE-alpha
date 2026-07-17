import { createHash } from 'crypto';

/** Per-component brake baseline units audited for backfill eligibility. */
export type BrakeBaselineComponent = 'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS';

/** Canonical baseline candidate classification (Prompt 5). */
export type BrakeBaselineCandidateClass =
  | 'EXACT_MEASURED'
  | 'CONFIRMED_REPLACEMENT'
  | 'HIGH_CONFIDENCE_DOCUMENTED'
  | 'SPEC_ONLY'
  | 'REGISTRATION_ASSERTION_ONLY'
  | 'CONFLICTING_DATA'
  | 'NO_SAFE_BASELINE';

export type BrakeBaselineCandidateSource =
  | 'BRAKE_EVIDENCE_MEASUREMENT'
  | 'SERVICE_EVENT_MEASUREMENT'
  | 'SERVICE_EVENT_REPLACEMENT'
  | 'AI_DOCUMENT_CONFIRMED'
  | 'WORKSHOP_DOCUMENT_CONFIRMED'
  | 'REGISTRATION_SPEC'
  | 'REGISTRATION_ASSERTION'
  | 'REFERENCE_SPEC_NOMINAL'
  | 'BHC_EXISTING_ANCHOR';

export type BrakeBaselineConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface BrakeThicknessSignal {
  component: BrakeBaselineComponent;
  thicknessMm: number | null;
  source: BrakeBaselineCandidateSource;
  observedAt: string;
  odometerKm: number | null;
  evidenceRef: string;
  isNominalSpec?: boolean;
  isDocumentedReplacement?: boolean;
  confidence?: BrakeBaselineConfidence;
  serviceScope?: string[];
}

export interface OdometerSignal {
  odometerKm: number;
  observedAt: string;
  source: string;
  evidenceRef: string;
}

export interface VehicleBrakeBaselineAuditInput {
  vehicleId: string;
  organizationId: string | null;
  registeredAt: string;
  registrationMileageKm: number | null;
  registrationBrakeCondition: 'NEW' | 'USED' | 'UNKNOWN' | null;
  registrationBrakeSource: string | null;
  brakeHealthCurrent: {
    isInitialized: boolean;
    stateClass: string | null;
    anchorValidationStatus: string | null;
    anchorServiceDate: string | null;
    anchorOdometerKm: number | null;
    hasAlert: boolean;
    baselineWarnings: string[];
    frontPadAnchorMm?: number | null;
    rearPadAnchorMm?: number | null;
    frontDiscAnchorMm?: number | null;
    rearDiscAnchorMm?: number | null;
  } | null;
  referenceSpec: {
    sourceType: string | null;
    createdAt: string;
    frontPadThickness: number | null;
    rearPadThickness: number | null;
    frontRotorWidth: number | null;
    rearRotorWidth: number | null;
  } | null;
  thicknessSignals: BrakeThicknessSignal[];
  odometerSignals: OdometerSignal[];
  pendingEnrichmentJobs: number;
  legacyJobClassification: string | null;
  tripCountSinceRegistration: number;
  brakeServiceEventCount: number;
  brakeEvidenceCount: number;
  activeDtcCount: number;
  confirmedDocumentCount: number;
}

export interface OdometerAnchorAnalysis {
  baselineTimestamp: string | null;
  exactAtBaselineKm: number | null;
  nearestHistoricalProvider: {
    odometerKm: number;
    observedAt: string;
    source: string;
    evidenceRef: string;
  } | null;
  registrationOdometerKm: number | null;
  serviceOdometers: Array<{ odometerKm: number; observedAt: string; evidenceRef: string }>;
  conflicts: string[];
  rollbacks: string[];
  resolvedAnchorKm: number | null;
}

export interface ComponentBaselineAuditResult {
  component: BrakeBaselineComponent;
  candidateClass: BrakeBaselineCandidateClass;
  source: BrakeBaselineCandidateSource | null;
  thicknessMm: number | null;
  timestamp: string | null;
  odometerKm: number | null;
  confidence: BrakeBaselineConfidence;
  conflicts: string[];
  recommendedAction: string;
  autoApplicable: boolean;
  partialBaselineOnly: boolean;
  signalsReviewed: number;
}

export interface VehicleBrakeBaselineAuditResult {
  anonymizedVehicleId: string;
  organizationSlot: string | null;
  registeredAt: string;
  brakeHealthCurrentPresent: boolean;
  brakeHealthInitialized: boolean;
  referenceSpecPresent: boolean;
  registrationBrakeCondition: string | null;
  registrationTimestamp: string | null;
  pendingEnrichmentJobs: number;
  legacyJobClassification: string | null;
  tripCountSinceRegistration: number;
  activeDtcCount: number;
  hasAlert: boolean;
  odometerAnchor: OdometerAnchorAnalysis;
  components: ComponentBaselineAuditResult[];
  vehicleConflicts: string[];
  requiresManualReview: boolean;
  anyAutoApplicable: boolean;
}

export interface BrakeBaselineAuditReport {
  auditId: string;
  generatedAt: string;
  mode: 'fixtures' | 'database';
  readOnly: true;
  summary: {
    vehiclesAudited: number;
    byCandidateClass: Record<BrakeBaselineCandidateClass, number>;
    autoApplicableComponents: number;
    manualReviewComponents: number;
    noSafeBaselineComponents: number;
    conflictingComponents: number;
    specOnlyComponents: number;
    vehiclesWithPendingJobs: number;
  };
  vehicles: VehicleBrakeBaselineAuditResult[];
  componentRows: Array<{
    anonymizedVehicleId: string;
    component: BrakeBaselineComponent;
    candidateClass: BrakeBaselineCandidateClass;
    source: BrakeBaselineCandidateSource | null;
    timestamp: string | null;
    odometerKm: number | null;
    confidence: BrakeBaselineConfidence;
    conflicts: string[];
    recommendedAction: string;
    autoApplicable: boolean;
  }>;
}

export const BRAKE_BASELINE_AUDIT_ID = 'brake-health-baseline-backfill-candidates-2026-07';
export const BRAKE_BASELINE_CANDIDATE_VERSION = 'brake-baseline-backfill-audit-2026-07-v1';

export const ALL_BRAKE_COMPONENTS: BrakeBaselineComponent[] = [
  'FRONT_PADS',
  'REAR_PADS',
  'FRONT_DISCS',
  'REAR_DISCS',
];

const MEASURED_SOURCES = new Set<BrakeBaselineCandidateSource>([
  'BRAKE_EVIDENCE_MEASUREMENT',
  'SERVICE_EVENT_MEASUREMENT',
]);

const REPLACEMENT_SOURCES = new Set<BrakeBaselineCandidateSource>([
  'SERVICE_EVENT_REPLACEMENT',
]);

const DOCUMENTED_SOURCES = new Set<BrakeBaselineCandidateSource>([
  'AI_DOCUMENT_CONFIRMED',
  'WORKSHOP_DOCUMENT_CONFIRMED',
]);

const SPEC_SOURCES = new Set<BrakeBaselineCandidateSource>([
  'REGISTRATION_SPEC',
  'REFERENCE_SPEC_NOMINAL',
]);

const MEASUREMENT_TOLERANCE_MM = 1.5;
const ODOMETER_CONFLICT_TOLERANCE_KM = 500;
const ODOMETER_ROLLBACK_TOLERANCE_KM = 50;
const EXACT_ODOMETER_WINDOW_MS = 3_600_000;

export function anonymizeVehicleId(vehicleId: string, auditSalt: string): string {
  const digest = createHash('sha256').update(`${auditSalt}:${vehicleId}`).digest('hex');
  const slot = parseInt(digest.slice(0, 6), 16) % 900 + 100;
  return `VEHICLE_${slot}`;
}

export function anonymizeOrganizationSlot(organizationId: string | null, auditSalt: string): string | null {
  if (!organizationId) return null;
  const digest = createHash('sha256').update(`${auditSalt}:org:${organizationId}`).digest('hex');
  return `ORG_${digest.slice(0, 8)}`;
}

export function evidenceRef(label: string, rawId: string, auditSalt: string): string {
  const digest = createHash('sha256').update(`${auditSalt}:${label}:${rawId}`).digest('hex');
  return `${label}_${digest.slice(0, 10)}`;
}

export function vehicleNeedsBaselineAudit(input: VehicleBrakeBaselineAuditInput): boolean {
  const bhc = input.brakeHealthCurrent;
  if (!bhc) return true;
  if (!bhc.isInitialized) return true;
  const anchorStatus = String(bhc.anchorValidationStatus ?? '').toLowerCase();
  if (anchorStatus === 'invalid' || anchorStatus.includes('spec_fallback')) return true;
  if (String(bhc.stateClass ?? '').toUpperCase() === 'NO_BASELINE') return true;
  return false;
}

function finiteMm(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function finiteOdometer(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function componentSignals(
  input: VehicleBrakeBaselineAuditInput,
  component: BrakeBaselineComponent,
): BrakeThicknessSignal[] {
  return input.thicknessSignals.filter((s) => s.component === component);
}

function detectThicknessConflicts(measured: number[]): string[] {
  if (measured.length < 2) return [];
  const min = Math.min(...measured);
  const max = Math.max(...measured);
  if (max - min > MEASUREMENT_TOLERANCE_MM) {
    return [`component_measurement_spread_${min.toFixed(1)}_${max.toFixed(1)}_mm`];
  }
  return [];
}

function pickBestMeasured(signals: BrakeThicknessSignal[]): BrakeThicknessSignal | null {
  const measured = signals.filter(
    (s) =>
      MEASURED_SOURCES.has(s.source) &&
      finiteMm(s.thicknessMm) != null &&
      !s.isNominalSpec,
  );
  if (measured.length === 0) return null;
  const high = measured.filter((s) => s.confidence === 'HIGH');
  const pool = high.length > 0 ? high : measured;
  return [...pool].sort((a, b) => (parseTime(b.observedAt) ?? 0) - (parseTime(a.observedAt) ?? 0))[0];
}

function pickReplacement(signals: BrakeThicknessSignal[]): BrakeThicknessSignal | null {
  const replacements = signals.filter(
    (s) => REPLACEMENT_SOURCES.has(s.source) || s.isDocumentedReplacement === true,
  );
  if (replacements.length === 0) return null;
  return [...replacements].sort((a, b) => (parseTime(b.observedAt) ?? 0) - (parseTime(a.observedAt) ?? 0))[0];
}

function pickDocumented(signals: BrakeThicknessSignal[]): BrakeThicknessSignal | null {
  const docs = signals.filter((s) => DOCUMENTED_SOURCES.has(s.source));
  if (docs.length === 0) return null;
  const high = docs.filter((s) => s.confidence === 'HIGH' || s.confidence === 'MEDIUM');
  const pool = high.length > 0 ? high : docs;
  return [...pool].sort((a, b) => (parseTime(b.observedAt) ?? 0) - (parseTime(a.observedAt) ?? 0))[0];
}

function pickSpecOnly(signals: BrakeThicknessSignal[]): BrakeThicknessSignal | null {
  const specs = signals.filter((s) => SPEC_SOURCES.has(s.source) || s.isNominalSpec === true);
  if (specs.length === 0) return null;
  return [...specs].sort((a, b) => (parseTime(b.observedAt) ?? 0) - (parseTime(a.observedAt) ?? 0))[0];
}

function pickAssertion(signals: BrakeThicknessSignal[]): BrakeThicknessSignal | null {
  const assertions = signals.filter((s) => s.source === 'REGISTRATION_ASSERTION');
  if (assertions.length === 0) return null;
  return assertions[0];
}

export function analyzeOdometerAnchor(
  input: VehicleBrakeBaselineAuditInput,
  baselineTimestamp: string | null,
): OdometerAnchorAnalysis {
  const registrationOdometerKm = finiteOdometer(input.registrationMileageKm);
  const serviceOdometers = input.odometerSignals
    .filter((s) => s.source.includes('SERVICE'))
    .map((s) => ({
      odometerKm: s.odometerKm,
      observedAt: s.observedAt,
      evidenceRef: s.evidenceRef,
    }));

  const baselineMs = parseTime(baselineTimestamp);
  let exactAtBaselineKm: number | null = null;
  let nearestHistoricalProvider: OdometerAnchorAnalysis['nearestHistoricalProvider'] = null;
  let nearestDelta = Number.POSITIVE_INFINITY;

  for (const signal of input.odometerSignals) {
    const signalMs = parseTime(signal.observedAt);
    if (signalMs == null) continue;
    if (baselineMs != null) {
      const delta = Math.abs(signalMs - baselineMs);
      if (delta <= EXACT_ODOMETER_WINDOW_MS) {
        exactAtBaselineKm = signal.odometerKm;
      }
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestHistoricalProvider = {
          odometerKm: signal.odometerKm,
          observedAt: signal.observedAt,
          source: signal.source,
          evidenceRef: signal.evidenceRef,
        };
      }
    }
  }

  const conflicts: string[] = [];
  const rollbacks: string[] = [];
  const values = input.odometerSignals.map((s) => s.odometerKm).filter((v) => Number.isFinite(v));
  if (values.length >= 2) {
    const spread = Math.max(...values) - Math.min(...values);
    if (spread > ODOMETER_CONFLICT_TOLERANCE_KM) {
      conflicts.push(`odometer_spread_${spread}_km`);
    }
  }

  const chronological = [...input.odometerSignals].sort(
    (a, b) => (parseTime(a.observedAt) ?? 0) - (parseTime(b.observedAt) ?? 0),
  );
  let lastKm: number | null = null;
  for (const row of chronological) {
    if (lastKm != null && row.odometerKm < lastKm - ODOMETER_ROLLBACK_TOLERANCE_KM) {
      rollbacks.push(`odometer_rollback_${lastKm}_to_${row.odometerKm}`);
    }
    lastKm = row.odometerKm;
  }

  const resolvedAnchorKm =
    exactAtBaselineKm ??
    nearestHistoricalProvider?.odometerKm ??
    registrationOdometerKm ??
    serviceOdometers[0]?.odometerKm ??
    null;

  if (resolvedAnchorKm == null) {
    conflicts.push('missing_odometer_anchor');
  }

  return {
    baselineTimestamp,
    exactAtBaselineKm,
    nearestHistoricalProvider,
    registrationOdometerKm,
    serviceOdometers,
    conflicts,
    rollbacks,
    resolvedAnchorKm,
  };
}

function recommendedActionFor(
  candidateClass: BrakeBaselineCandidateClass,
  autoApplicable: boolean,
): string {
  if (autoApplicable) return 'auto_backfill_eligible';
  switch (candidateClass) {
    case 'EXACT_MEASURED':
      return 'resolve_odometer_then_backfill';
    case 'CONFIRMED_REPLACEMENT':
      return 'confirm_replacement_odometer_then_backfill';
    case 'HIGH_CONFIDENCE_DOCUMENTED':
      return 'manual_review_documented_baseline';
    case 'SPEC_ONLY':
      return 'measurement_or_replacement_confirmation_required';
    case 'REGISTRATION_ASSERTION_ONLY':
      return 'confirm_registration_state_or_measure';
    case 'CONFLICTING_DATA':
      return 'manual_reconciliation_required';
    default:
      return 'no_safe_baseline_collect_evidence';
  }
}

export function auditComponentBaseline(
  input: VehicleBrakeBaselineAuditInput,
  component: BrakeBaselineComponent,
  odometerAnchor: OdometerAnchorAnalysis,
): ComponentBaselineAuditResult {
  const signals = componentSignals(input, component);
  const measuredValues = signals
    .filter((s) => MEASURED_SOURCES.has(s.source) && finiteMm(s.thicknessMm) != null && !s.isNominalSpec)
    .map((s) => finiteMm(s.thicknessMm)!);

  const thicknessConflicts = detectThicknessConflicts(measuredValues);
  const odometerConflicts = [...odometerAnchor.conflicts, ...odometerAnchor.rollbacks];

  if (thicknessConflicts.length > 0) {
    const best = pickBestMeasured(signals);
    return {
      component,
      candidateClass: 'CONFLICTING_DATA',
      source: best?.source ?? null,
      thicknessMm: best?.thicknessMm ?? null,
      timestamp: best?.observedAt ?? null,
      odometerKm: odometerAnchor.resolvedAnchorKm,
      confidence: best?.confidence ?? 'UNKNOWN',
      conflicts: [...thicknessConflicts, ...odometerConflicts],
      recommendedAction: recommendedActionFor('CONFLICTING_DATA', false),
      autoApplicable: false,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  const measured = pickBestMeasured(signals);
  if (measured) {
    const autoApplicable =
      odometerAnchor.resolvedAnchorKm != null &&
      odometerConflicts.length === 0 &&
      (measured.confidence === 'HIGH' || measured.confidence === 'MEDIUM');
    return {
      component,
      candidateClass: 'EXACT_MEASURED',
      source: measured.source,
      thicknessMm: measured.thicknessMm,
      timestamp: measured.observedAt,
      odometerKm: measured.odometerKm ?? odometerAnchor.resolvedAnchorKm,
      confidence: measured.confidence ?? 'HIGH',
      conflicts: odometerConflicts,
      recommendedAction: recommendedActionFor('EXACT_MEASURED', autoApplicable),
      autoApplicable,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  const replacement = pickReplacement(signals);
  if (replacement) {
    const autoApplicable =
      odometerAnchor.resolvedAnchorKm != null &&
      odometerConflicts.length === 0 &&
      replacement.isDocumentedReplacement === true;
    return {
      component,
      candidateClass: 'CONFIRMED_REPLACEMENT',
      source: replacement.source,
      thicknessMm: replacement.thicknessMm,
      timestamp: replacement.observedAt,
      odometerKm: replacement.odometerKm ?? odometerAnchor.resolvedAnchorKm,
      confidence: replacement.confidence ?? 'MEDIUM',
      conflicts: odometerConflicts,
      recommendedAction: recommendedActionFor('CONFIRMED_REPLACEMENT', autoApplicable),
      autoApplicable,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  const documented = pickDocumented(signals);
  if (documented) {
    return {
      component,
      candidateClass: 'HIGH_CONFIDENCE_DOCUMENTED',
      source: documented.source,
      thicknessMm: documented.thicknessMm,
      timestamp: documented.observedAt,
      odometerKm: documented.odometerKm ?? odometerAnchor.resolvedAnchorKm,
      confidence: documented.confidence ?? 'MEDIUM',
      conflicts: odometerConflicts,
      recommendedAction: recommendedActionFor('HIGH_CONFIDENCE_DOCUMENTED', false),
      autoApplicable: false,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  const specOnly = pickSpecOnly(signals);
  if (specOnly) {
    return {
      component,
      candidateClass: 'SPEC_ONLY',
      source: specOnly.source,
      thicknessMm: specOnly.thicknessMm,
      timestamp: specOnly.observedAt,
      odometerKm: odometerAnchor.resolvedAnchorKm,
      confidence: 'LOW',
      conflicts: [
        ...odometerConflicts,
        'nominal_spec_not_measurement',
      ],
      recommendedAction: recommendedActionFor('SPEC_ONLY', false),
      autoApplicable: false,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  const assertion = pickAssertion(signals);
  if (assertion) {
    return {
      component,
      candidateClass: 'REGISTRATION_ASSERTION_ONLY',
      source: assertion.source,
      thicknessMm: assertion.thicknessMm,
      timestamp: assertion.observedAt,
      odometerKm: odometerAnchor.resolvedAnchorKm,
      confidence: 'LOW',
      conflicts: odometerConflicts,
      recommendedAction: recommendedActionFor('REGISTRATION_ASSERTION_ONLY', false),
      autoApplicable: false,
      partialBaselineOnly: true,
      signalsReviewed: signals.length,
    };
  }

  return {
    component,
    candidateClass: 'NO_SAFE_BASELINE',
    source: null,
    thicknessMm: null,
    timestamp: null,
    odometerKm: odometerAnchor.resolvedAnchorKm,
    confidence: 'UNKNOWN',
    conflicts: odometerConflicts,
    recommendedAction: recommendedActionFor('NO_SAFE_BASELINE', false),
    autoApplicable: false,
    partialBaselineOnly: true,
    signalsReviewed: signals.length,
  };
}

export function auditVehicleBrakeBaseline(
  input: VehicleBrakeBaselineAuditInput,
  auditSalt: string,
): VehicleBrakeBaselineAuditResult | null {
  if (!vehicleNeedsBaselineAudit(input)) return null;

  const baselineTimestamp =
    input.brakeHealthCurrent?.anchorServiceDate ??
    input.referenceSpec?.createdAt ??
    input.registeredAt;

  const odometerAnchor = analyzeOdometerAnchor(input, baselineTimestamp);
  const components = ALL_BRAKE_COMPONENTS.map((component) =>
    auditComponentBaseline(input, component, odometerAnchor),
  );

  const vehicleConflicts = [
    ...new Set([
      ...odometerAnchor.conflicts,
      ...odometerAnchor.rollbacks,
      ...(input.pendingEnrichmentJobs > 0 ? ['pending_brake_enrichment_job'] : []),
      ...(input.activeDtcCount > 0 ? ['active_brake_related_dtc'] : []),
      ...(input.brakeHealthCurrent?.hasAlert ? ['brake_health_alert_present'] : []),
    ]),
  ];

  return {
    anonymizedVehicleId: anonymizeVehicleId(input.vehicleId, auditSalt),
    organizationSlot: anonymizeOrganizationSlot(input.organizationId, auditSalt),
    registeredAt: input.registeredAt,
    brakeHealthCurrentPresent: input.brakeHealthCurrent != null,
    brakeHealthInitialized: input.brakeHealthCurrent?.isInitialized ?? false,
    referenceSpecPresent: input.referenceSpec != null,
    registrationBrakeCondition: input.registrationBrakeCondition,
    registrationTimestamp: input.referenceSpec?.createdAt ?? input.registeredAt,
    pendingEnrichmentJobs: input.pendingEnrichmentJobs,
    legacyJobClassification: input.legacyJobClassification,
    tripCountSinceRegistration: input.tripCountSinceRegistration,
    activeDtcCount: input.activeDtcCount,
    hasAlert: input.brakeHealthCurrent?.hasAlert ?? false,
    odometerAnchor,
    components,
    vehicleConflicts,
    requiresManualReview: components.some(
      (c) =>
        !c.autoApplicable &&
        c.candidateClass !== 'NO_SAFE_BASELINE',
    ),
    anyAutoApplicable: components.some((c) => c.autoApplicable),
  };
}

export function auditBrakeBaselineCandidates(
  inputs: VehicleBrakeBaselineAuditInput[],
  options?: { auditId?: string; mode?: 'fixtures' | 'database'; auditSalt?: string },
): BrakeBaselineAuditReport {
  const auditSalt = options?.auditSalt ?? BRAKE_BASELINE_AUDIT_ID;
  const vehicles = inputs
    .map((input) => auditVehicleBrakeBaseline(input, auditSalt))
    .filter((v): v is VehicleBrakeBaselineAuditResult => v != null);

  const byCandidateClass = {
    EXACT_MEASURED: 0,
    CONFIRMED_REPLACEMENT: 0,
    HIGH_CONFIDENCE_DOCUMENTED: 0,
    SPEC_ONLY: 0,
    REGISTRATION_ASSERTION_ONLY: 0,
    CONFLICTING_DATA: 0,
    NO_SAFE_BASELINE: 0,
  } satisfies Record<BrakeBaselineCandidateClass, number>;

  let autoApplicableComponents = 0;
  let manualReviewComponents = 0;
  let noSafeBaselineComponents = 0;
  let conflictingComponents = 0;
  let specOnlyComponents = 0;
  let vehiclesWithPendingJobs = 0;

  const componentRows: BrakeBaselineAuditReport['componentRows'] = [];

  for (const vehicle of vehicles) {
    if (vehicle.pendingEnrichmentJobs > 0) vehiclesWithPendingJobs += 1;
    for (const component of vehicle.components) {
      byCandidateClass[component.candidateClass] += 1;
      if (component.autoApplicable) autoApplicableComponents += 1;
      if (component.candidateClass === 'NO_SAFE_BASELINE') noSafeBaselineComponents += 1;
      if (component.candidateClass === 'CONFLICTING_DATA') conflictingComponents += 1;
      if (component.candidateClass === 'SPEC_ONLY') specOnlyComponents += 1;
      if (!component.autoApplicable && component.candidateClass !== 'NO_SAFE_BASELINE') {
        manualReviewComponents += 1;
      }
      componentRows.push({
        anonymizedVehicleId: vehicle.anonymizedVehicleId,
        component: component.component,
        candidateClass: component.candidateClass,
        source: component.source,
        timestamp: component.timestamp,
        odometerKm: component.odometerKm,
        confidence: component.confidence,
        conflicts: component.conflicts,
        recommendedAction: component.recommendedAction,
        autoApplicable: component.autoApplicable,
      });
    }
  }

  return {
    auditId: options?.auditId ?? BRAKE_BASELINE_AUDIT_ID,
    generatedAt: new Date().toISOString(),
    mode: options?.mode ?? 'fixtures',
    readOnly: true,
    summary: {
      vehiclesAudited: vehicles.length,
      byCandidateClass,
      autoApplicableComponents,
      manualReviewComponents,
      noSafeBaselineComponents,
      conflictingComponents,
      specOnlyComponents,
      vehiclesWithPendingJobs,
    },
    vehicles,
    componentRows,
  };
}

export function renderBrakeBaselineAuditMarkdown(report: BrakeBaselineAuditReport): string {
  const lines: string[] = [
    '# Brake Health Baseline Backfill Candidates — July 2026',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Audit ID** | \`${report.auditId}\` |`,
    `| **Generated** | ${report.generatedAt} |`,
    `| **Mode** | ${report.mode} |`,
    '| **Production data modified** | **No** — read-only audit |',
    `| **Candidate version** | \`${BRAKE_BASELINE_CANDIDATE_VERSION}\` |`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Vehicles audited | ${report.summary.vehiclesAudited} |`,
    `| Auto-applicable components | ${report.summary.autoApplicableComponents} |`,
    `| Manual review components | ${report.summary.manualReviewComponents} |`,
    `| Spec-only components | ${report.summary.specOnlyComponents} |`,
    `| Conflicting components | ${report.summary.conflictingComponents} |`,
    `| No safe baseline components | ${report.summary.noSafeBaselineComponents} |`,
    `| Vehicles with pending BRAKE jobs | ${report.summary.vehiclesWithPendingJobs} |`,
    '',
    '### By candidate class',
    '',
    '| Class | Components |',
    '|-------|----------:|',
  ];

  for (const [key, count] of Object.entries(report.summary.byCandidateClass)) {
    lines.push(`| ${key} | ${count} |`);
  }

  lines.push(
    '',
    '## Component matrix (anonymized)',
    '',
    '| Vehicle | Component | Candidate | Source | Timestamp | Odometer km | Confidence | Conflicts | Recommended action | Auto |',
    '|---------|-----------|-----------|--------|-----------|-------------|------------|-----------|-------------------|:----:|',
  );

  for (const row of report.componentRows) {
    const conflicts = row.conflicts.length > 0 ? row.conflicts.join('; ') : '—';
    lines.push(
      `| ${row.anonymizedVehicleId} | ${row.component} | ${row.candidateClass} | ${row.source ?? '—'} | ${row.timestamp ?? '—'} | ${row.odometerKm ?? '—'} | ${row.confidence} | ${conflicts} | ${row.recommendedAction} | ${row.autoApplicable ? 'yes' : 'no'} |`,
    );
  }

  lines.push(
    '',
    '## Policy reminders',
    '',
    '- **SPEC_ONLY** and **REGISTRATION_ASSERTION_ONLY** must never be treated as measured thickness.',
    '- Component baselines are **never** inferred from a single partial signal across all four components.',
    '- **CONFLICTING_DATA** and **NO_SAFE_BASELINE** require supervised manual review before any backfill execute.',
    '- This audit does not mutate production data.',
    '',
  );

  return lines.join('\n');
}

export function buildSyntheticBrakeBaselineFixtures(): VehicleBrakeBaselineAuditInput[] {
  const salt = 'fixture-salt';
  const registeredAt = '2026-03-01T10:00:00.000Z';

  const base = (vehicleId: string, overrides: Partial<VehicleBrakeBaselineAuditInput>): VehicleBrakeBaselineAuditInput => ({
    vehicleId,
    organizationId: 'org-fixture-1',
    registeredAt,
    registrationMileageKm: 45000,
    registrationBrakeCondition: 'UNKNOWN',
    registrationBrakeSource: null,
    brakeHealthCurrent: null,
    referenceSpec: null,
    thicknessSignals: [],
    odometerSignals: [
      {
        odometerKm: 45000,
        observedAt: registeredAt,
        source: 'REGISTRATION_MILEAGE',
        evidenceRef: evidenceRef('reg', vehicleId, salt),
      },
    ],
    pendingEnrichmentJobs: 0,
    legacyJobClassification: null,
    tripCountSinceRegistration: 12,
    brakeServiceEventCount: 0,
    brakeEvidenceCount: 0,
    activeDtcCount: 0,
    confirmedDocumentCount: 0,
    ...overrides,
  });

  return [
    base('fixture-exact-measured', {
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 9.2,
          source: 'BRAKE_EVIDENCE_MEASUREMENT',
          observedAt: '2026-03-10T14:00:00.000Z',
          odometerKm: 45200,
          evidenceRef: evidenceRef('ev', 'm1', salt),
          confidence: 'HIGH',
        },
        {
          component: 'REAR_PADS',
          thicknessMm: 8.8,
          source: 'SERVICE_EVENT_MEASUREMENT',
          observedAt: '2026-03-10T14:00:00.000Z',
          odometerKm: 45200,
          evidenceRef: evidenceRef('svc', 's1', salt),
          confidence: 'HIGH',
          serviceScope: ['REAR_PADS'],
        },
      ],
      odometerSignals: [
        {
          odometerKm: 45200,
          observedAt: '2026-03-10T14:00:00.000Z',
          source: 'SERVICE_EVENT',
          evidenceRef: evidenceRef('svc', 's1', salt),
        },
        {
          odometerKm: 45000,
          observedAt: registeredAt,
          source: 'REGISTRATION_MILEAGE',
          evidenceRef: evidenceRef('reg', 'fixture-exact-measured', salt),
        },
      ],
      brakeEvidenceCount: 1,
      brakeServiceEventCount: 1,
    }),
    base('fixture-confirmed-replacement', {
      registrationBrakeCondition: 'NEW',
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 10,
          source: 'SERVICE_EVENT_REPLACEMENT',
          observedAt: '2026-03-05T09:00:00.000Z',
          odometerKm: 44800,
          evidenceRef: evidenceRef('svc', 'r1', salt),
          isDocumentedReplacement: true,
          isNominalSpec: true,
          serviceScope: ['FRONT_PADS'],
        },
      ],
      odometerSignals: [
        {
          odometerKm: 44800,
          observedAt: '2026-03-05T09:00:00.000Z',
          source: 'SERVICE_EVENT',
          evidenceRef: evidenceRef('svc', 'r1', salt),
        },
      ],
      brakeServiceEventCount: 1,
    }),
    base('fixture-spec-only', {
      referenceSpec: {
        sourceType: 'manual_registration',
        createdAt: '2026-03-01T10:05:00.000Z',
        frontPadThickness: 10,
        rearPadThickness: 10,
        frontRotorWidth: 28,
        rearRotorWidth: 10,
      },
      registrationBrakeCondition: 'NEW',
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 10,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: '2026-03-01T10:05:00.000Z',
          odometerKm: 45000,
          evidenceRef: evidenceRef('spec', 'sp1', salt),
          isNominalSpec: true,
        },
        {
          component: 'REAR_PADS',
          thicknessMm: 10,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: '2026-03-01T10:05:00.000Z',
          odometerKm: 45000,
          evidenceRef: evidenceRef('spec', 'sp2', salt),
          isNominalSpec: true,
        },
        {
          component: 'FRONT_DISCS',
          thicknessMm: 28,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: '2026-03-01T10:05:00.000Z',
          odometerKm: 45000,
          evidenceRef: evidenceRef('spec', 'sp3', salt),
          isNominalSpec: true,
        },
        {
          component: 'REAR_DISCS',
          thicknessMm: 10,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: '2026-03-01T10:05:00.000Z',
          odometerKm: 45000,
          evidenceRef: evidenceRef('spec', 'sp4', salt),
          isNominalSpec: true,
        },
      ],
    }),
    base('fixture-unclear-registration', {
      registrationBrakeCondition: 'UNKNOWN',
      registrationBrakeSource: 'manual_registration',
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          source: 'REGISTRATION_ASSERTION',
          thicknessMm: null,
          observedAt: registeredAt,
          odometerKm: 45000,
          evidenceRef: evidenceRef('reg', 'assert1', salt),
        },
      ],
    }),
    base('fixture-partial-service', {
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 7.5,
          source: 'SERVICE_EVENT_MEASUREMENT',
          observedAt: '2026-02-20T11:00:00.000Z',
          odometerKm: 44100,
          evidenceRef: evidenceRef('svc', 'ps1', salt),
          confidence: 'HIGH',
          serviceScope: ['FRONT_PADS'],
        },
      ],
      brakeServiceEventCount: 1,
    }),
    base('fixture-conflicting', {
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 9.0,
          source: 'BRAKE_EVIDENCE_MEASUREMENT',
          observedAt: '2026-03-01T12:00:00.000Z',
          odometerKm: 45000,
          evidenceRef: evidenceRef('ev', 'c1', salt),
          confidence: 'HIGH',
        },
        {
          component: 'FRONT_PADS',
          thicknessMm: 5.5,
          source: 'SERVICE_EVENT_MEASUREMENT',
          observedAt: '2026-03-02T12:00:00.000Z',
          odometerKm: 45100,
          evidenceRef: evidenceRef('ev', 'c2', salt),
          confidence: 'HIGH',
        },
      ],
      brakeEvidenceCount: 2,
    }),
    base('fixture-no-odometer', {
      registrationMileageKm: null,
      odometerSignals: [],
      referenceSpec: {
        sourceType: 'manual_registration',
        createdAt: registeredAt,
        frontPadThickness: 10,
        rearPadThickness: 10,
        frontRotorWidth: 28,
        rearRotorWidth: 10,
      },
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 10,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: registeredAt,
          odometerKm: null,
          evidenceRef: evidenceRef('spec', 'no-odo', salt),
          isNominalSpec: true,
        },
      ],
    }),
    base('fixture-pending-job', {
      pendingEnrichmentJobs: 1,
      legacyJobClassification: 'ORPHAN_LEGACY_NO_PROCESSOR',
      referenceSpec: {
        sourceType: 'manual_registration',
        createdAt: registeredAt,
        frontPadThickness: 10,
        rearPadThickness: 10,
        frontRotorWidth: 28,
        rearRotorWidth: 10,
      },
      thicknessSignals: [
        {
          component: 'FRONT_PADS',
          thicknessMm: 10,
          source: 'REFERENCE_SPEC_NOMINAL',
          observedAt: registeredAt,
          odometerKm: 45000,
          evidenceRef: evidenceRef('spec', 'pj1', salt),
          isNominalSpec: true,
        },
      ],
    }),
    base('fixture-no-candidate', {
      brakeHealthCurrent: {
        isInitialized: false,
        stateClass: 'NO_BASELINE',
        anchorValidationStatus: 'invalid',
        anchorServiceDate: null,
        anchorOdometerKm: null,
        hasAlert: false,
        baselineWarnings: ['Registration brake initialization required'],
      },
    }),
    base('fixture-already-initialized', {
      brakeHealthCurrent: {
        isInitialized: true,
        stateClass: 'MEASURED',
        anchorValidationStatus: 'measured_anchor',
        anchorServiceDate: '2026-03-01T10:00:00.000Z',
        anchorOdometerKm: 45000,
        hasAlert: false,
        baselineWarnings: [],
        frontPadAnchorMm: 9,
        rearPadAnchorMm: 9,
        frontDiscAnchorMm: 28,
        rearDiscAnchorMm: 10,
      },
    }),
  ];
}
