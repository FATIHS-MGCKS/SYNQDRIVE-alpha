import { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import {
  accumulateShadowCutoverMetrics,
  createEmptyShadowCutoverMetricSnapshot,
} from './physical-state-shadow-cutover-metrics';

export type T7LegacyReasonSource = 'log_backed' | 'episode_model' | 'webhook_model' | 'pattern_assumed';

export type T7ReplayExportRow = {
  shadowId: string;
  vehicleId: string;
  bindingKey: string;
  evidenceReferenceId: string;
  evidenceObservedAt: string;
  observedAt: string;
  transition: {
    decision: string;
    previousState: string;
    candidateState: string;
    effectiveState: string;
    evidenceSource: string;
    parentStateVersion: number | null;
    appliedStateVersion: number | null;
  };
  parentEvidence: {
    effectiveState: string;
    evidenceObservedAt: string;
    evidenceSource: string;
    evidenceReferenceId: string;
    stateVersion: number | null;
  } | null;
  legacyReasonSource?: T7LegacyReasonSource;
  legacyReason?: string | null;
  legacyAccepted?: boolean;
  episodeReconstruction?: {
    openEpisodeId: string | null;
    openEpisodeAtObservation: boolean;
  } | null;
  retentionEdgePm2LegacyMissing?: boolean;
};

/** Canonical PM2 log-retention edge cohort (15 earliest P1A rows in T7 export). */
export const T7_RETENTION_EDGE_SHADOW_IDS: readonly string[] = [
  '8e99057e-5e30-42c6-be54-78c915882f21',
  '16a2bbef-bea8-4f76-ad53-8ed7c91b9f13',
  '307fdb84-8ba3-4fb4-807e-52735992eea0',
  'a6bc0ea3-5117-4e6a-b3c7-865838846254',
  '8d94b05e-a0d5-4cb8-94c3-767887d2bcab',
  '99d50dd5-7963-4f7a-bf1c-d4d7a773530b',
  'c29d1f2b-9253-448e-90dc-ab79c8812392',
  '653b4a49-e010-4938-9676-650b493c49a4',
  '8bfd9706-882f-4e6c-83cf-a5ee6ff37222',
  '9690f7b6-f568-4d82-b18d-582154facdf9',
  'a72f90fc-3bcc-4583-a070-7fa8ff58635f',
  '36fe1cdc-3fb7-46cf-bc93-092c9209c660',
  'e8b2dd35-eda1-4a53-9c45-42795356fcfe',
  'b1498437-ef5d-4430-9cee-0d77dfac2504',
  '426fb0e1-8251-443a-9140-80247f915bce',
];

export function classifyT7ReplayPattern(row: T7ReplayExportRow): string {
  const t = row.transition;
  if (t.evidenceSource === 'WEBHOOK' && t.candidateState === 'PLUGGED') return 'P2';
  if (t.evidenceSource === 'SNAPSHOT_OBD' && t.candidateState === 'UNPLUGGED') return 'P3';
  if (t.evidenceSource === 'SNAPSHOT_OBD' && t.candidateState === 'PLUGGED') {
    if (!row.parentEvidence) return 'P1A_ORPHAN_PARENT';
    const inc = new Date(row.evidenceObservedAt).getTime();
    const prev = new Date(row.parentEvidence.evidenceObservedAt).getTime();
    if (inc === prev) return 'P1B';
    if (inc > prev) return 'P1A';
    return 'STALE_SHAPE';
  }
  return 'OTHER';
}

export function resolveT7RowLegacyReason(row: T7ReplayExportRow): {
  legacyReason: string | null;
  legacyReasonSource: T7LegacyReasonSource;
} {
  const source = row.legacyReasonSource ?? 'pattern_assumed';
  if (source === 'pattern_assumed' || !row.legacyReason?.trim()) {
    return { legacyReason: null, legacyReasonSource: 'pattern_assumed' };
  }
  return { legacyReason: row.legacyReason, legacyReasonSource: source };
}

export type RetentionEdgeVerification = {
  shadowId: string;
  pass: boolean;
  failures: string[];
};

export function verifyRetentionEdgeP1aRow(row: T7ReplayExportRow): RetentionEdgeVerification {
  const failures: string[] = [];
  const t = row.transition;
  const pattern = classifyT7ReplayPattern(row);

  if (pattern !== 'P1A') failures.push('pattern_not_P1A');
  if (t.candidateState !== 'PLUGGED') failures.push('candidate_not_PLUGGED');
  if (t.evidenceSource !== 'SNAPSHOT_OBD') failures.push('source_not_SNAPSHOT_OBD');
  if (!row.parentEvidence) failures.push('missing_parent');
  if (!row.bindingKey?.trim()) failures.push('missing_binding');
  if (t.decision !== 'PROVENANCE_REFRESH') failures.push('decision_not_PROVENANCE_REFRESH');
  if (t.previousState !== t.candidateState || t.effectiveState !== t.previousState) {
    failures.push('not_same_state_refresh');
  }

  if (row.parentEvidence) {
    const inc = new Date(row.evidenceObservedAt).getTime();
    const prev = new Date(row.parentEvidence.evidenceObservedAt).getTime();
    if (inc <= prev) failures.push('evidence_not_strictly_newer');
    if (row.parentEvidence.effectiveState !== 'PLUGGED') failures.push('parent_not_PLUGGED');
  }

  const legacy = resolveT7RowLegacyReason(row);
  if (legacy.legacyReasonSource === 'pattern_assumed') failures.push('pattern_assumed_legacy');
  if (legacy.legacyReason !== 'no_open_episode') failures.push('legacy_reason_not_no_open_episode');
  if (legacy.legacyReasonSource !== 'episode_model') failures.push('legacy_not_episode_model');

  if (row.episodeReconstruction?.openEpisodeAtObservation) {
    failures.push('open_episode_would_alter_legacy');
  }

  return { shadowId: row.shadowId, pass: failures.length === 0, failures };
}

export function replayT7ExportRow(row: T7ReplayExportRow) {
  const pattern = classifyT7ReplayPattern(row);
  const t = row.transition;

  if (
    t.decision !== 'PROVENANCE_REFRESH' ||
    t.previousState !== t.candidateState ||
    t.effectiveState !== t.previousState ||
    !row.parentEvidence ||
    !row.bindingKey?.trim()
  ) {
    return { pattern, skipped: true as const, reason: 'not_replayable_shape' };
  }

  const { legacyReason, legacyReasonSource } = resolveT7RowLegacyReason(row);
  if (!legacyReason || legacyReasonSource === 'pattern_assumed') {
    return { pattern, skipped: true as const, reason: 'evidence_incomplete_legacy_reason' };
  }

  if (row.parentEvidence.stateVersion == null) {
    return { pattern, skipped: true as const, reason: 'parent_state_version_missing' };
  }

  const previousProjection = {
    effectiveState: row.parentEvidence.effectiveState as 'PLUGGED' | 'UNPLUGGED',
    evidenceObservedAt: new Date(row.parentEvidence.evidenceObservedAt),
    evidenceSource: row.parentEvidence.evidenceSource as DeviceConnectionPhysicalEvidenceSource,
    evidenceReferenceId: row.parentEvidence.evidenceReferenceId,
    stateVersion: row.parentEvidence.stateVersion,
  };
  const incoming = {
    candidateState: t.candidateState as 'PLUGGED' | 'UNPLUGGED',
    evidenceObservedAt: new Date(row.evidenceObservedAt),
    evidenceSource: t.evidenceSource as DeviceConnectionPhysicalEvidenceSource,
    evidenceReferenceId: row.evidenceReferenceId,
  };

  const legacyPlug =
    t.previousState === 'PLUGGED'
      ? 'plugged'
      : t.previousState === 'UNPLUGGED'
        ? 'unplugged'
        : 'unknown';

  const result = comparePhysicalStateShadowDecisions({
    scope: { organizationId: 'org', vehicleId: row.vehicleId, provider: 'DIMO' },
    bindingKey: row.bindingKey,
    legacyBindingKey: row.bindingKey,
    physicalBindingKey: row.bindingKey,
    legacyDecision: {
      accepted: row.legacyAccepted === true,
      reason: legacyReason,
      gate: PhysicalStateCanonicalGate.LEGACY,
    },
    physicalDecision: {
      accepted: true,
      reason: 'provenance_refresh_same_state',
      gate: PhysicalStateCanonicalGate.PHYSICAL,
      transitionDecision: 'PROVENANCE_REFRESH',
      effectiveState: t.effectiveState as 'PLUGGED' | 'UNPLUGGED',
    },
    legacyEffectivePlugState: legacyPlug as 'plugged' | 'unplugged',
    evidenceObservedAt: incoming.evidenceObservedAt,
    legacyEvidenceObservedAt: previousProjection.evidenceObservedAt,
    evidenceReferenceId: row.evidenceReferenceId,
    sameStateRefresh: {
      previousProjection,
      incoming,
      parentSource: 'COORDINATOR_LOCKED_CONTEXT',
    },
  });

  return { pattern, skipped: false as const, legacyReasonSource, result };
}

export function summarizeT7ReplayExport(rows: T7ReplayExportRow[]) {
  const metrics = createEmptyShadowCutoverMetricSnapshot();
  const summary = {
    total: rows.length,
    replayed: 0,
    notReplayable: 0,
    byPattern: {} as Record<string, number>,
    byClassification: {} as Record<string, number>,
    nonIsomorphicByPattern: {} as Record<string, number>,
    correctnessBlockingTotal: 0,
    unprovenSameStateRefresh: 0,
    legacyReasonSourceCounts: {
      log_backed: 0,
      episode_model: 0,
      webhook_model: 0,
      pattern_assumed: 0,
    },
    retentionEdge: {
      rows: T7_RETENTION_EDGE_SHADOW_IDS.length,
      perRowReplayed: 0,
      pass: 0,
      fail: 0,
    },
  };

  const retentionSet = new Set(T7_RETENTION_EDGE_SHADOW_IDS);

  for (const row of rows) {
    const replay = replayT7ExportRow(row);
    summary.byPattern[replay.pattern] = (summary.byPattern[replay.pattern] ?? 0) + 1;

    if (retentionSet.has(row.shadowId)) {
      const edge = verifyRetentionEdgeP1aRow(row);
      if (edge.pass) summary.retentionEdge.pass += 1;
      else summary.retentionEdge.fail += 1;
      if (!replay.skipped) summary.retentionEdge.perRowReplayed += 1;
    }

    if (replay.skipped) {
      summary.notReplayable += 1;
      if (replay.reason === 'evidence_incomplete_legacy_reason') {
        summary.legacyReasonSourceCounts.pattern_assumed += 1;
      }
      continue;
    }

    summary.replayed += 1;
    summary.legacyReasonSourceCounts[replay.legacyReasonSource] += 1;

    const result = replay.result;
    summary.byClassification[result.classification] =
      (summary.byClassification[result.classification] ?? 0) + 1;
    if (result.classification === 'NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH') {
      summary.nonIsomorphicByPattern[replay.pattern] =
        (summary.nonIsomorphicByPattern[replay.pattern] ?? 0) + 1;
    }
    accumulateShadowCutoverMetrics(metrics, result);
  }

  summary.correctnessBlockingTotal = metrics.correctnessBlockingTotal;
  summary.unprovenSameStateRefresh = metrics.unprovenSameStateRefresh;

  return { summary, metrics };
}
