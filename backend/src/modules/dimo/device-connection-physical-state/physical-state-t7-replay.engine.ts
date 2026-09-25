import { DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import {
  accumulateShadowCutoverMetrics,
  createEmptyShadowCutoverMetricSnapshot,
} from './physical-state-shadow-cutover-metrics';

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
};

const LEGACY_BY_PATTERN: Record<string, string> = {
  P1A: 'no_open_episode',
  P1B: 'no_open_episode',
  P2: 'no_state_change',
  P3: 'obd_false',
};

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

  const legacyReason = LEGACY_BY_PATTERN[pattern];
  if (!legacyReason) {
    return { pattern, skipped: true as const, reason: 'unknown_pattern' };
  }

  const previousProjection = {
    effectiveState: row.parentEvidence.effectiveState as 'PLUGGED' | 'UNPLUGGED',
    evidenceObservedAt: new Date(row.parentEvidence.evidenceObservedAt),
    evidenceSource: row.parentEvidence.evidenceSource as DeviceConnectionPhysicalEvidenceSource,
    evidenceReferenceId: row.parentEvidence.evidenceReferenceId,
    stateVersion: row.parentEvidence.stateVersion ?? 1,
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
      accepted: false,
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

  return { pattern, skipped: false as const, result };
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
  };

  for (const row of rows) {
    const replay = replayT7ExportRow(row);
    summary.byPattern[replay.pattern] = (summary.byPattern[replay.pattern] ?? 0) + 1;
    if (replay.skipped) {
      summary.notReplayable += 1;
      continue;
    }
    summary.replayed += 1;
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
