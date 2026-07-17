import { createHash } from 'crypto';

/** Confidence bucket for backfill candidate review (Prompt 7). */
export type AnchorBackfillConfidenceClass =
  | 'EXACT'
  | 'HIGH_CONFIDENCE'
  | 'MEDIUM_CONFIDENCE'
  | 'LOW_CONFIDENCE'
  | 'NO_SAFE_CANDIDATE'
  | 'CONFLICTING_DATA';

/** Candidate provenance — ordered by audit priority A→F. */
export type AnchorBackfillCandidateSource =
  | 'DOCUMENTED_INSTALL_MEASUREMENT'
  | 'REGISTRATION_MEASUREMENT'
  | 'HANDOVER_PROTOCOL'
  | 'DIMO_HISTORICAL'
  | 'HIGH_MOBILITY_HISTORICAL'
  | 'SNAPSHOT_HISTORY'
  | 'WORKSHOP_TIRE_DOCUMENT'
  | 'TRIP_ODOMETER_BOUNDARY';

export interface OdometerEvidenceSignal {
  source: AnchorBackfillCandidateSource;
  odometerKm: number;
  observedAt: string;
  /** Anonymized evidence pointer (measurement id hash, doc id hash, etc.). */
  evidenceRef?: string;
  providerLabel?: string;
  notes?: string[];
}

export interface SetupBackfillAuditInput {
  setupId: string;
  vehicleId: string;
  organizationId: string | null;
  installedAt: string | null;
  status: string;
  installedOdometerKm: number | null;
  odometerAnchorStatus: string | null;
  totalKmOnSet: number;
  /** Priority A */
  installMeasurements?: OdometerEvidenceSignal[];
  registrationMeasurements?: OdometerEvidenceSignal[];
  /** Priority A extension — handover at install window */
  handoverProtocols?: OdometerEvidenceSignal[];
  /** Priority B */
  dimoHistorical?: OdometerEvidenceSignal[];
  /** Priority C */
  hmHistorical?: OdometerEvidenceSignal[];
  /** Priority D — persisted snapshot rows only (not live latest state). */
  snapshotHistory?: OdometerEvidenceSignal[];
  /** Priority E */
  workshopDocuments?: OdometerEvidenceSignal[];
  /** Priority F — explicit trip/energy odometer boundaries only */
  tripBoundaries?: OdometerEvidenceSignal[];
  /** Used for conflict checks only — never emitted as a candidate. */
  currentLatestStateOdometer?: number | null;
  /** Other setups on same vehicle — detect setup switches / monotonicity. */
  siblingSetupAnchors?: Array<{ installedAt: string | null; odometerKm: number | null; status: string }>;
  /** Provider changes near install (DIMO ↔ HM). */
  providerSwitchNotes?: string[];
  /** Trips already attributed to this setup period (km since install). */
  tripsAfterInstallKm?: number;
}

export interface AnchorBackfillCandidate {
  odometerKm: number;
  source: AnchorBackfillCandidateSource;
  observedAt: string;
  timeDistanceToInstallationHours: number | null;
  confidence: AnchorBackfillConfidenceClass;
  supportingSignals: string[];
  conflicts: string[];
  evidenceRef?: string;
}

export interface SetupBackfillAuditResult {
  setupId: string;
  vehicleId: string;
  organizationId: string | null;
  anonymizedSetupId: string;
  installedAt: string | null;
  candidateOdometerKm: number | null;
  candidateObservedAt: string | null;
  candidateHash: string;
  source: AnchorBackfillCandidateSource | null;
  timeDistanceToInstallationHours: number | null;
  confidence: AnchorBackfillConfidenceClass;
  supportingSignals: string[];
  conflicts: string[];
  recommendedAction: string;
  candidatesReviewed: number;
  rejectedRetroactiveInference: boolean;
}

export interface BackfillAuditReport {
  auditId: string;
  generatedAt: string;
  mode: 'fixtures' | 'database';
  readOnly: true;
  summary: {
    setupsAudited: number;
    byConfidence: Record<AnchorBackfillConfidenceClass, number>;
    withSafeCandidate: number;
    conflicting: number;
    noCandidate: number;
  };
  setups: SetupBackfillAuditResult[];
}

const SOURCE_PRIORITY: AnchorBackfillCandidateSource[] = [
  'DOCUMENTED_INSTALL_MEASUREMENT',
  'REGISTRATION_MEASUREMENT',
  'HANDOVER_PROTOCOL',
  'DIMO_HISTORICAL',
  'HIGH_MOBILITY_HISTORICAL',
  'SNAPSHOT_HISTORY',
  'WORKSHOP_TIRE_DOCUMENT',
  'TRIP_ODOMETER_BOUNDARY',
];

const EXACT_WINDOW_HOURS = 1;
const HIGH_WINDOW_HOURS = 6;
const MEDIUM_WINDOW_HOURS = 72;
const LOW_WINDOW_HOURS = 168;
const CONFLICT_TOLERANCE_KM = 500;
const ROLLBACK_TOLERANCE_KM = 50;

export const BACKFILL_CANDIDATE_VERSION = 'tire-odometer-anchor-backfill-2026-07-v1';
export const BACKFILL_SCHEMA_VERSION = '20260716190000_tire_odometer_anchor';

export function computeCandidateHash(args: {
  setupId: string;
  candidateOdometerKm: number | null;
  source: AnchorBackfillCandidateSource | null;
  confidence: AnchorBackfillConfidenceClass;
  candidateObservedAt: string | null;
}): string {
  const payload = JSON.stringify({
    setupId: args.setupId,
    candidateOdometerKm: args.candidateOdometerKm,
    source: args.source,
    confidence: args.confidence,
    candidateObservedAt: args.candidateObservedAt,
    version: BACKFILL_CANDIDATE_VERSION,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function computeManifestHash(
  rows: Array<{ setupId: string; candidateHash: string }>,
): string {
  const canonical = [...rows]
    .sort((a, b) => a.setupId.localeCompare(b.setupId))
    .map((r) => `${r.setupId}:${r.candidateHash}`)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function anonymizeSetupId(setupId: string, auditSalt: string): string {
  const digest = createHash('sha256').update(`${auditSalt}:${setupId}`).digest('hex');
  return `setup_${digest.slice(0, 12)}`;
}

export function isSetupMissingTraceableAnchor(input: SetupBackfillAuditInput): boolean {
  if (input.installedOdometerKm == null) return true;
  const status = String(input.odometerAnchorStatus ?? '').toUpperCase();
  if (status === 'ANCHOR_REQUIRED' || status === 'MEASUREMENT_REQUIRED') return true;
  return false;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function hoursBetween(aIso: string, bIso: string | null): number | null {
  const a = parseTime(aIso);
  const b = parseTime(bIso);
  if (a == null || b == null) return null;
  return Math.abs(a - b) / 3_600_000;
}

function finiteOdometer(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

function lastKnownVehicleOdometer(input: SetupBackfillAuditInput): number | null {
  const values = (input.siblingSetupAnchors ?? [])
    .map((s) => finiteOdometer(s.odometerKm))
    .filter((v): v is number => v != null);
  return values.length > 0 ? Math.max(...values) : null;
}

function detectRollback(candidateKm: number, lastKnownKm: number | null): boolean {
  if (lastKnownKm == null) return false;
  return candidateKm < lastKnownKm - ROLLBACK_TOLERANCE_KM;
}

function classifyCandidate(args: {
  signal: OdometerEvidenceSignal;
  installedAt: string | null;
  lastKnownKm: number | null;
  providerSwitchNotes: string[];
  tripsAfterInstallKm?: number;
}): AnchorBackfillCandidate {
  const { signal, installedAt, lastKnownKm, providerSwitchNotes, tripsAfterInstallKm } = args;
  const conflicts: string[] = [];
  const supportingSignals: string[] = [
    `source=${signal.source}`,
    `observedAt=${signal.observedAt}`,
  ];
  if (signal.providerLabel) supportingSignals.push(`provider=${signal.providerLabel}`);
  if (signal.evidenceRef) supportingSignals.push(`evidenceRef=${signal.evidenceRef}`);
  for (const note of signal.notes ?? []) supportingSignals.push(note);

  const timeDistanceToInstallationHours = installedAt
    ? hoursBetween(signal.observedAt, installedAt)
    : null;

  if (detectRollback(signal.odometerKm, lastKnownKm)) {
    conflicts.push('odometer_rollback_vs_prior_vehicle_anchor');
  }

  if (providerSwitchNotes.length > 0) {
    conflicts.push(...providerSwitchNotes.map((n) => `provider_switch:${n}`));
  }

  if (
    tripsAfterInstallKm != null &&
    tripsAfterInstallKm > 0 &&
    timeDistanceToInstallationHours != null &&
    timeDistanceToInstallationHours > HIGH_WINDOW_HOURS
  ) {
    conflicts.push('trips_already_recorded_on_setup_after_delayed_anchor');
  }

  let confidence: AnchorBackfillConfidenceClass = 'LOW_CONFIDENCE';

  const isDocumented =
    signal.source === 'DOCUMENTED_INSTALL_MEASUREMENT' ||
    signal.source === 'REGISTRATION_MEASUREMENT' ||
    signal.source === 'HANDOVER_PROTOCOL' ||
    signal.source === 'WORKSHOP_TIRE_DOCUMENT';

  if (isDocumented && timeDistanceToInstallationHours != null && timeDistanceToInstallationHours <= EXACT_WINDOW_HOURS) {
    confidence = 'EXACT';
  } else if (
    (signal.source === 'DIMO_HISTORICAL' || signal.source === 'HIGH_MOBILITY_HISTORICAL') &&
    timeDistanceToInstallationHours != null &&
    timeDistanceToInstallationHours <= HIGH_WINDOW_HOURS &&
    conflicts.length === 0
  ) {
    confidence = 'HIGH_CONFIDENCE';
  } else if (
    isDocumented &&
    timeDistanceToInstallationHours != null &&
    timeDistanceToInstallationHours <= MEDIUM_WINDOW_HOURS &&
    conflicts.length === 0
  ) {
    confidence = 'MEDIUM_CONFIDENCE';
  } else if (
    (signal.source === 'SNAPSHOT_HISTORY' || signal.source === 'TRIP_ODOMETER_BOUNDARY') &&
    timeDistanceToInstallationHours != null &&
    timeDistanceToInstallationHours <= MEDIUM_WINDOW_HOURS &&
    conflicts.length === 0
  ) {
    confidence = 'MEDIUM_CONFIDENCE';
  } else if (
    timeDistanceToInstallationHours != null &&
    timeDistanceToInstallationHours <= LOW_WINDOW_HOURS
  ) {
    confidence = conflicts.length > 0 ? 'LOW_CONFIDENCE' : 'LOW_CONFIDENCE';
  } else if (timeDistanceToInstallationHours != null && timeDistanceToInstallationHours > LOW_WINDOW_HOURS) {
    conflicts.push('delayed_telemetry_far_from_install');
    confidence = 'LOW_CONFIDENCE';
  }

  if (conflicts.some((c) => c.startsWith('odometer_rollback'))) {
    confidence = 'LOW_CONFIDENCE';
  }

  return {
    odometerKm: signal.odometerKm,
    source: signal.source,
    observedAt: signal.observedAt,
    timeDistanceToInstallationHours,
    confidence,
    supportingSignals,
    conflicts,
    evidenceRef: signal.evidenceRef,
  };
}

function collectSignalsInPriorityOrder(input: SetupBackfillAuditInput): OdometerEvidenceSignal[] {
  const buckets: Array<OdometerEvidenceSignal[] | undefined> = [
    input.installMeasurements,
    input.registrationMeasurements,
    input.handoverProtocols,
    input.dimoHistorical,
    input.hmHistorical,
    input.snapshotHistory,
    input.workshopDocuments,
    input.tripBoundaries,
  ];
  const out: OdometerEvidenceSignal[] = [];
  for (const bucket of buckets) {
    for (const signal of bucket ?? []) {
      const km = finiteOdometer(signal.odometerKm);
      if (km == null) continue;
      out.push({ ...signal, odometerKm: km });
    }
  }
  return out;
}

function pickBestCandidate(candidates: AnchorBackfillCandidate[]): AnchorBackfillCandidate | null {
  if (candidates.length === 0) return null;

  const rank: Record<AnchorBackfillConfidenceClass, number> = {
    EXACT: 6,
    HIGH_CONFIDENCE: 5,
    MEDIUM_CONFIDENCE: 4,
    LOW_CONFIDENCE: 3,
    CONFLICTING_DATA: 2,
    NO_SAFE_CANDIDATE: 0,
  };

  const sorted = [...candidates].sort((a, b) => {
    const conf = rank[b.confidence] - rank[a.confidence];
    if (conf !== 0) return conf;
    const pri =
      SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source);
    if (pri !== 0) return pri;
    const ta = a.timeDistanceToInstallationHours ?? Number.POSITIVE_INFINITY;
    const tb = b.timeDistanceToInstallationHours ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return sorted[0] ?? null;
}

function detectConflictingCandidates(candidates: AnchorBackfillCandidate[]): string[] {
  if (candidates.length < 2) return [];
  const conflicts: string[] = [];
  const values = candidates.map((c) => c.odometerKm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min > CONFLICT_TOLERANCE_KM) {
    conflicts.push(
      `candidate_spread_${Math.round(min)}_${Math.round(max)}_km_exceeds_${CONFLICT_TOLERANCE_KM}`,
    );
  }
  return conflicts;
}

function recommendAction(
  confidence: AnchorBackfillConfidenceClass,
  conflicts: string[],
): string {
  if (confidence === 'EXACT' || confidence === 'HIGH_CONFIDENCE') {
    return 'eligible_for_prompt_8_controlled_apply_with_human_review';
  }
  if (confidence === 'MEDIUM_CONFIDENCE') {
    return 'manual_review_then_optional_prompt_8_apply';
  }
  if (confidence === 'LOW_CONFIDENCE') {
    return 'require_workshop_or_telemetry_confirmation_before_apply';
  }
  if (confidence === 'CONFLICTING_DATA') {
    return 'resolve_conflicts_manually_do_not_auto_apply';
  }
  if (conflicts.some((c) => c.includes('provider_switch'))) {
    return 'reconcile_provider_source_before_apply';
  }
  return 'collect_measurement_or_wait_for_telemetry_anchor';
}

export function auditSetupBackfillCandidate(
  input: SetupBackfillAuditInput,
  auditSalt: string,
): SetupBackfillAuditResult {
  const lastKnownKm = lastKnownVehicleOdometer(input);
  const signals = collectSignalsInPriorityOrder(input);

  const candidates = signals.map((signal) =>
    classifyCandidate({
      signal,
      installedAt: input.installedAt,
      lastKnownKm,
      providerSwitchNotes: input.providerSwitchNotes ?? [],
      tripsAfterInstallKm: input.tripsAfterInstallKm,
    }),
  );

  const spreadConflicts = detectConflictingCandidates(candidates);

  let best = pickBestCandidate(candidates);
  let confidence: AnchorBackfillConfidenceClass =
    best?.confidence ?? 'NO_SAFE_CANDIDATE';
  const conflicts = [...(best?.conflicts ?? []), ...spreadConflicts];

  if (spreadConflicts.length > 0 && best) {
    confidence = 'CONFLICTING_DATA';
    best = { ...best, confidence: 'CONFLICTING_DATA', conflicts };
  }

  if (!best) {
    const confidence: AnchorBackfillConfidenceClass = 'NO_SAFE_CANDIDATE';
    return buildAuditResult(input, auditSalt, {
      installedAt: input.installedAt,
      candidateOdometerKm: null,
      candidateObservedAt: null,
      source: null,
      timeDistanceToInstallationHours: null,
      confidence,
      supportingSignals: ['no_historical_candidate_found'],
      conflicts: [],
      recommendedAction: recommendAction(confidence, []),
      candidatesReviewed: 0,
      rejectedRetroactiveInference: true,
    });
  }

  return buildAuditResult(input, auditSalt, {
    installedAt: input.installedAt,
    candidateOdometerKm: best.odometerKm,
    candidateObservedAt: best.observedAt,
    source: best.source,
    timeDistanceToInstallationHours: best.timeDistanceToInstallationHours,
    confidence,
    supportingSignals: best.supportingSignals,
    conflicts,
    recommendedAction: recommendAction(confidence, conflicts),
    candidatesReviewed: candidates.length,
    rejectedRetroactiveInference: true,
  });
}

function buildAuditResult(
  input: SetupBackfillAuditInput,
  auditSalt: string,
  row: Omit<
    SetupBackfillAuditResult,
    | 'setupId'
    | 'vehicleId'
    | 'organizationId'
    | 'anonymizedSetupId'
    | 'candidateHash'
  >,
): SetupBackfillAuditResult {
  const candidateHash = computeCandidateHash({
    setupId: input.setupId,
    candidateOdometerKm: row.candidateOdometerKm,
    source: row.source,
    confidence: row.confidence,
    candidateObservedAt: row.candidateObservedAt,
  });
  return {
    setupId: input.setupId,
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    anonymizedSetupId: anonymizeSetupId(input.setupId, auditSalt),
    candidateHash,
    ...row,
  };
}

export function auditBackfillCandidates(
  inputs: SetupBackfillAuditInput[],
  opts?: { auditId?: string; auditSalt?: string; mode?: 'fixtures' | 'database' },
): BackfillAuditReport {
  const auditId = opts?.auditId ?? 'tire-odometer-anchor-backfill-2026-07';
  const auditSalt = opts?.auditSalt ?? auditId;
  const targets = inputs.filter(isSetupMissingTraceableAnchor);
  const setups = targets.map((input) => auditSetupBackfillCandidate(input, auditSalt));

  const byConfidence = {
    EXACT: 0,
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    LOW_CONFIDENCE: 0,
    NO_SAFE_CANDIDATE: 0,
    CONFLICTING_DATA: 0,
  } satisfies Record<AnchorBackfillConfidenceClass, number>;

  for (const row of setups) {
    byConfidence[row.confidence] += 1;
  }

  return {
    auditId,
    generatedAt: new Date().toISOString(),
    mode: opts?.mode ?? 'database',
    readOnly: true,
    summary: {
      setupsAudited: setups.length,
      byConfidence,
      withSafeCandidate: setups.filter(
        (s) =>
          s.confidence === 'EXACT' ||
          s.confidence === 'HIGH_CONFIDENCE' ||
          s.confidence === 'MEDIUM_CONFIDENCE',
      ).length,
      conflicting: byConfidence.CONFLICTING_DATA,
      noCandidate: byConfidence.NO_SAFE_CANDIDATE,
    },
    setups,
  };
}

export function renderBackfillAuditMarkdown(report: BackfillAuditReport): string {
  const lines: string[] = [
    '# Tire Odometer Anchor — Backfill Candidate Audit (2026-07)',
    '',
    `**Audit ID:** \`${report.auditId}\``,
    `**Generated:** ${report.generatedAt}`,
    `**Mode:** ${report.mode} (read-only)`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Setups audited (missing traceable anchor) | ${report.summary.setupsAudited} |`,
    `| Safe candidate (EXACT/HIGH/MEDIUM) | ${report.summary.withSafeCandidate} |`,
    `| Conflicting | ${report.summary.conflicting} |`,
    `| No safe candidate | ${report.summary.noCandidate} |`,
    '',
    '### By confidence class',
    '',
    ...Object.entries(report.summary.byConfidence).map(
      ([k, v]) => `- **${k}:** ${v}`,
    ),
    '',
    '## Methodology',
    '',
    '1. Targets: setups with `installed_odometer_km IS NULL` or `odometer_anchor_status` ∈ {`ANCHOR_REQUIRED`,`MEASUREMENT_REQUIRED`}.',
    '2. Candidate priority: documented install/registration → DIMO history → HM history → snapshot history → workshop docs → trip odometer boundaries.',
    '3. **Excluded:** retroactive inference from current `vehicle_latest_states.odometer_km` minus trip km (never treated as historical truth).',
    '4. Rollbacks, provider switches, and delayed telemetry downgrade confidence.',
    '5. Output is anonymized (`setup_<hash>`) — no VIN, plates, GPS, or secrets.',
    '',
    '## Per-setup candidates',
    '',
    '| Anonymized setup | installedAt | candidateKm | source | Δt (h) | confidence | recommendedAction |',
    '|------------------|-------------|------------:|--------|-------:|------------|-------------------|',
  ];

  for (const row of report.setups) {
    lines.push(
      `| ${row.anonymizedSetupId} | ${row.installedAt ?? '—'} | ${row.candidateOdometerKm ?? '—'} | ${row.source ?? '—'} | ${row.timeDistanceToInstallationHours?.toFixed(1) ?? '—'} | ${row.confidence} | ${row.recommendedAction} |`,
    );
  }

  lines.push('', '## Detail rows', '');
  for (const row of report.setups) {
    lines.push(`### ${row.anonymizedSetupId}`);
    lines.push('');
    lines.push(`- **confidence:** ${row.confidence}`);
    lines.push(`- **candidateOdometerKm:** ${row.candidateOdometerKm ?? 'null'}`);
    lines.push(`- **source:** ${row.source ?? 'null'}`);
    lines.push(`- **timeDistanceToInstallationHours:** ${row.timeDistanceToInstallationHours ?? 'null'}`);
    lines.push(`- **supportingSignals:** ${row.supportingSignals.join('; ')}`);
    if (row.conflicts.length > 0) {
      lines.push(`- **conflicts:** ${row.conflicts.join('; ')}`);
    }
    lines.push(`- **recommendedAction:** ${row.recommendedAction}`);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '*Read-only audit — no writes, no recalculation, no tire events. Suitable input for controlled Prompt 8 apply.*',
  );

  return lines.join('\n');
}

/** Synthetic fixtures covering every confidence class for unit tests / CI report. */
export function buildSyntheticBackfillFixtures(): SetupBackfillAuditInput[] {
  const installAt = '2026-03-15T10:00:00.000Z';
  return [
    {
      setupId: 'fixture-exact',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 0,
      installMeasurements: [
        {
          source: 'DOCUMENTED_INSTALL_MEASUREMENT',
          odometerKm: 45200,
          observedAt: '2026-03-15T10:15:00.000Z',
          evidenceRef: 'meas_hash_exact',
        },
      ],
    },
    {
      setupId: 'fixture-dimo-high',
      vehicleId: 'veh-2',
      organizationId: 'org-1',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 120,
      dimoHistorical: [
        {
          source: 'DIMO_HISTORICAL',
          odometerKm: 88120,
          observedAt: '2026-03-15T12:30:00.000Z',
          providerLabel: 'DIMO',
          evidenceRef: 'snap_hash_dimo',
        },
      ],
    },
    {
      setupId: 'fixture-hm-high',
      vehicleId: 'veh-3',
      organizationId: 'org-2',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 0,
      hmHistorical: [
        {
          source: 'HIGH_MOBILITY_HISTORICAL',
          odometerKm: 12050,
          observedAt: '2026-03-15T11:00:00.000Z',
          providerLabel: 'HIGH_MOBILITY',
          evidenceRef: 'hm_hash',
        },
      ],
    },
    {
      setupId: 'fixture-medium-handover',
      vehicleId: 'veh-4',
      organizationId: 'org-2',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 0,
      handoverProtocols: [
        {
          source: 'HANDOVER_PROTOCOL',
          odometerKm: 67300,
          observedAt: '2026-03-16T09:00:00.000Z',
          evidenceRef: 'handover_hash',
        },
      ],
    },
    {
      setupId: 'fixture-low-trip',
      vehicleId: 'veh-5',
      organizationId: 'org-3',
      installedAt: installAt,
      status: 'STORED',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 800,
      tripBoundaries: [
        {
          source: 'TRIP_ODOMETER_BOUNDARY',
          odometerKm: 15000,
          observedAt: '2026-03-24T08:00:00.000Z',
          evidenceRef: 'trip_hash',
          notes: ['explicit_trip_end_odometer_only'],
        },
      ],
      tripsAfterInstallKm: 800,
    },
    {
      setupId: 'fixture-none',
      vehicleId: 'veh-6',
      organizationId: 'org-3',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 0,
    },
    {
      setupId: 'fixture-conflict',
      vehicleId: 'veh-7',
      organizationId: 'org-1',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'ANCHOR_REQUIRED',
      totalKmOnSet: 0,
      dimoHistorical: [
        {
          source: 'DIMO_HISTORICAL',
          odometerKm: 50000,
          observedAt: '2026-03-15T11:00:00.000Z',
          providerLabel: 'DIMO',
        },
      ],
      hmHistorical: [
        {
          source: 'HIGH_MOBILITY_HISTORICAL',
          odometerKm: 62000,
          observedAt: '2026-03-15T11:30:00.000Z',
          providerLabel: 'HIGH_MOBILITY',
        },
      ],
      providerSwitchNotes: ['dimo_and_hm_disagree_near_install'],
    },
    {
      setupId: 'fixture-rollback',
      vehicleId: 'veh-8',
      organizationId: 'org-1',
      installedAt: installAt,
      status: 'ACTIVE',
      installedOdometerKm: null,
      odometerAnchorStatus: 'MEASUREMENT_REQUIRED',
      totalKmOnSet: 0,
      siblingSetupAnchors: [{ installedAt: '2026-01-01T00:00:00.000Z', odometerKm: 60000, status: 'STORED' }],
      dimoHistorical: [
        {
          source: 'DIMO_HISTORICAL',
          odometerKm: 55000,
          observedAt: '2026-03-15T11:00:00.000Z',
          providerLabel: 'DIMO',
        },
      ],
    },
  ];
}
