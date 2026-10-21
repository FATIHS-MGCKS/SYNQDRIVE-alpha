import { BATTERY_FRESHNESS_THRESHOLDS_MS } from '../battery-freshness.policy';
import {
  HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS,
  HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE,
} from './hv-charge-session-boundary-snapshot.constants';

export interface HvChargeSessionBoundarySnapshotRow {
  recordedAt: Date;
  providerReceivedAt: Date | null;
  socPercent: number;
  energyUsedKwh: number | null;
  energyObservedAt: Date | null;
  isCharging: boolean;
  chargingCableConnected: boolean | null;
  idempotencyKey: string | null;
}

export interface HvChargeSessionBoundaryObservation {
  socPercent: number;
  energyUsedKwh: number;
  socObservedAt: Date;
  energyObservedAt: Date;
  snapshotRecordedAt: Date;
  offsetFromBoundaryMs: number;
}

export type HvChargeSessionBoundaryResolutionReason =
  | 'ongoing_session'
  | 'missing_end_boundary'
  | 'insufficient_snapshots'
  | 'start_soc_gap'
  | 'end_soc_gap'
  | 'start_energy_gap'
  | 'end_energy_gap'
  | 'stale_observation'
  | 'session_assignment_mismatch'
  | 'incoherent_soc_range'
  | 'incoherent_energy_range';

export interface HvChargeSessionResolvedBoundaryEvidence {
  provenance: typeof HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE;
  start: HvChargeSessionBoundaryObservation;
  end: HvChargeSessionBoundaryObservation;
  deltaSocPercent: number;
}

export type HvChargeSessionBoundaryResolution =
  | { kind: 'full'; evidence: HvChargeSessionResolvedBoundaryEvidence }
  | { kind: 'none'; reason: HvChargeSessionBoundaryResolutionReason };

function resolveEnergyObservedAt(row: HvChargeSessionBoundarySnapshotRow): Date | null {
  if (row.energyUsedKwh == null) return null;
  return row.energyObservedAt ?? row.recordedAt;
}

function observationFreshAtBoundary(input: {
  observedAt: Date;
  boundaryAt: Date;
  assessedAt: Date;
}): boolean {
  const ageMs = input.assessedAt.getTime() - input.observedAt.getTime();
  if (ageMs < 0) return false;
  if (ageMs > BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation) return false;
  const offsetMs = Math.abs(input.observedAt.getTime() - input.boundaryAt.getTime());
  return offsetMs <= HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS;
}

function sessionAssignmentOk(input: {
  snapshotRecordedAt: Date;
  sessionStartAt: Date;
  sessionEndAt: Date;
  boundaryAt: Date;
}): boolean {
  const t = input.snapshotRecordedAt.getTime();
  const start = input.sessionStartAt.getTime() - HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS;
  const end = input.sessionEndAt.getTime() + HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS;
  if (t < start || t > end) return false;
  const offset = Math.abs(t - input.boundaryAt.getTime());
  return offset <= HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS;
}

function chargingContextScore(row: HvChargeSessionBoundarySnapshotRow): number {
  let score = 0;
  if (row.isCharging) score += 2;
  if (row.chargingCableConnected === true) score += 1;
  return score;
}

function compareSnapshotCandidates(
  a: HvChargeSessionBoundarySnapshotRow,
  b: HvChargeSessionBoundarySnapshotRow,
  boundaryAt: Date,
): number {
  const offsetA = Math.abs(a.recordedAt.getTime() - boundaryAt.getTime());
  const offsetB = Math.abs(b.recordedAt.getTime() - boundaryAt.getTime());
  if (offsetA !== offsetB) return offsetA - offsetB;

  const chargeA = chargingContextScore(a);
  const chargeB = chargingContextScore(b);
  if (chargeA !== chargeB) return chargeB - chargeA;

  const recvA = a.providerReceivedAt?.getTime() ?? 0;
  const recvB = b.providerReceivedAt?.getTime() ?? 0;
  if (recvA !== recvB) return recvB - recvA;

  const keyA = a.idempotencyKey ?? '';
  const keyB = b.idempotencyKey ?? '';
  return keyA.localeCompare(keyB);
}

function pickBoundarySnapshot(
  rows: HvChargeSessionBoundarySnapshotRow[],
  boundaryAt: Date,
  sessionStartAt: Date,
  sessionEndAt: Date,
  assessedAt: Date,
): { row: HvChargeSessionBoundarySnapshotRow; reason?: HvChargeSessionBoundaryResolutionReason } | null {
  const candidates = rows.filter((row) =>
    sessionAssignmentOk({
      snapshotRecordedAt: row.recordedAt,
      sessionStartAt,
      sessionEndAt,
      boundaryAt,
    }),
  );

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => compareSnapshotCandidates(a, b, boundaryAt));
  const best = sorted[0]!;

  const energyObservedAt = resolveEnergyObservedAt(best);
  if (energyObservedAt == null) {
    return { row: best, reason: boundaryAt.getTime() === sessionStartAt.getTime() ? 'start_energy_gap' : 'end_energy_gap' };
  }

  if (
    !observationFreshAtBoundary({
      observedAt: best.recordedAt,
      boundaryAt,
      assessedAt,
    })
  ) {
    return { row: best, reason: 'stale_observation' };
  }

  if (
    !observationFreshAtBoundary({
      observedAt: energyObservedAt,
      boundaryAt,
      assessedAt,
    })
  ) {
    return { row: best, reason: 'stale_observation' };
  }

  return { row: best };
}

function toObservation(
  row: HvChargeSessionBoundarySnapshotRow,
  boundaryAt: Date,
): HvChargeSessionBoundaryObservation | null {
  const energyObservedAt = resolveEnergyObservedAt(row);
  if (energyObservedAt == null || row.energyUsedKwh == null) return null;
  return {
    socPercent: row.socPercent,
    energyUsedKwh: row.energyUsedKwh,
    socObservedAt: row.recordedAt,
    energyObservedAt,
    snapshotRecordedAt: row.recordedAt,
    offsetFromBoundaryMs: Math.abs(row.recordedAt.getTime() - boundaryAt.getTime()),
  };
}

/**
 * Resolves start/end SOC and pack-energy from HV poll snapshots aligned to DIMO segment boundaries.
 * Fail-closed: returns `none` unless both boundaries have complete, fresh, session-assignable observations.
 */
export function resolveHvChargeSessionBoundaryFromSnapshots(input: {
  snapshots: HvChargeSessionBoundarySnapshotRow[];
  sessionStartAt: Date;
  sessionEndAt: Date | null;
  isOngoing: boolean;
  assessedAt: Date;
}): HvChargeSessionBoundaryResolution {
  if (input.isOngoing || !input.sessionEndAt) {
    return { kind: 'none', reason: 'ongoing_session' };
  }

  const sessionEndAt = input.sessionEndAt;
  if (input.snapshots.length === 0) {
    return { kind: 'none', reason: 'insufficient_snapshots' };
  }

  const startPick = pickBoundarySnapshot(
    input.snapshots,
    input.sessionStartAt,
    input.sessionStartAt,
    sessionEndAt,
    input.assessedAt,
  );
  if (!startPick) {
    return { kind: 'none', reason: 'start_soc_gap' };
  }
  if (startPick.reason) {
    return { kind: 'none', reason: startPick.reason };
  }

  const endPick = pickBoundarySnapshot(
    input.snapshots,
    sessionEndAt,
    input.sessionStartAt,
    sessionEndAt,
    input.assessedAt,
  );
  if (!endPick) {
    return { kind: 'none', reason: 'end_soc_gap' };
  }
  if (endPick.reason) {
    return { kind: 'none', reason: endPick.reason };
  }

  const start = toObservation(startPick.row, input.sessionStartAt);
  const end = toObservation(endPick.row, sessionEndAt);
  if (!start || !end) {
    return { kind: 'none', reason: 'start_energy_gap' };
  }

  if (end.socPercent < start.socPercent) {
    return { kind: 'none', reason: 'incoherent_soc_range' };
  }
  if (end.energyUsedKwh < start.energyUsedKwh) {
    return { kind: 'none', reason: 'incoherent_energy_range' };
  }

  const deltaSocPercent = end.socPercent - start.socPercent;

  return {
    kind: 'full',
    evidence: {
      provenance: HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE,
      start,
      end,
      deltaSocPercent,
    },
  };
}
