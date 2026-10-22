import {
  HV_CHARGE_SESSION_BOUNDARY_ANCHOR_QUERY_LIMIT,
  HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS,
  HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS,
} from './hv-charge-session-boundary-snapshot.constants';
import type { HvChargeSessionBoundarySnapshotRow } from './hv-charge-session-boundary-snapshot.policy';

export interface HvChargeSessionBoundarySnapshotRecordedAtRange {
  gte: Date;
  lte: Date;
}

export function buildHvChargeSessionBoundarySnapshotAnchorWindows(input: {
  sessionStartAt: Date;
  sessionEndAt: Date;
}): {
  startAnchor: HvChargeSessionBoundarySnapshotRecordedAtRange;
  endAnchor: HvChargeSessionBoundarySnapshotRecordedAtRange;
} {
  const startMs = input.sessionStartAt.getTime();
  const endMs = input.sessionEndAt.getTime();
  return {
    startAnchor: {
      gte: new Date(startMs - HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS),
      lte: new Date(startMs + HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS),
    },
    endAnchor: {
      gte: new Date(endMs - HV_CHARGE_SESSION_BOUNDARY_MAX_OFFSET_MS),
      lte: new Date(endMs + HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS),
    },
  };
}

export function mergeHvChargeSessionBoundarySnapshotRows(
  rows: HvChargeSessionBoundarySnapshotRow[],
): HvChargeSessionBoundarySnapshotRow[] {
  const seen = new Set<string>();
  const merged: HvChargeSessionBoundarySnapshotRow[] = [];
  for (const row of rows) {
    const key = `${row.recordedAt.toISOString()}:${row.idempotencyKey ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  merged.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  return merged;
}

export { HV_CHARGE_SESSION_BOUNDARY_ANCHOR_QUERY_LIMIT };
