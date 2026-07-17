import { BatteryMeasurementQuality } from '@prisma/client';
import {
  detectWakeFlankMeasurementIds,
  isPlausibleRestVoltage,
  isRestTargetWakeVoltage,
  type RestTargetObservationCandidate,
} from '../lv-rest-window/battery-rest-target-evaluation';
import { DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V } from '../lv-rest-window/lv-rest-window.policy';
import type {
  SnapshotRestBackfillCandidate,
  SnapshotRestBackfillClassification,
} from './battery-snapshot-rest-backfill.types';

export const SNAPSHOT_REST_BACKFILL_REASONS = {
  valid_historical_rest_capture: {
    code: 'valid_historical_rest_capture',
    labelDe: 'Historische Ruhespannung gültig (Backfill)',
  },
  contaminated_by_charging: {
    code: 'contaminated_by_charging',
    labelDe: 'Ruhemessung durch Laden kontaminiert',
  },
  contaminated_by_wake: {
    code: 'contaminated_by_wake',
    labelDe: 'Ruhemessung durch Aufwachen kontaminiert',
  },
  contaminated_by_active_trip: {
    code: 'contaminated_by_active_trip',
    labelDe: 'Motor lief — keine Ruhemessung',
  },
  wake_flank: {
    code: 'wake_flank',
    labelDe: 'Wake-Flanke erkannt',
  },
  implausible_voltage: {
    code: 'implausible_voltage',
    labelDe: 'Unplausible Spannung',
  },
  missing_rest_voltage: {
    code: 'missing_rest_voltage',
    labelDe: 'Keine Ruhespannung im Snapshot',
  },
  shadow_historical_rest: {
    code: 'shadow_historical_rest',
    labelDe: 'Historische Ruhespannung (Shadow)',
  },
} as const;

export interface SnapshotRestBackfillPolicyInput {
  maxRestingVoltage?: number;
  wakeVoltageThreshold?: number;
}

const DEFAULT_MAX_RESTING_V = 13.2;
const DEFAULT_WAKE_THRESHOLD_V = 13.8;

export function buildSnapshotRestBackfillIdempotencyKey(snapshotId: string): string {
  return `hist-snap-rest:${snapshotId}:REST_60M`;
}

export function resolveSnapshotRestVoltage(
  candidate: SnapshotRestBackfillCandidate,
): number | null {
  const value = candidate.restingVoltage ?? candidate.voltageV;
  return Number.isFinite(value) ? value : null;
}

export function toWakeFlankObservationCandidates(
  candidates: SnapshotRestBackfillCandidate[],
): RestTargetObservationCandidate[] {
  const rows: RestTargetObservationCandidate[] = [];
  for (const row of candidates) {
    const voltage = resolveSnapshotRestVoltage(row);
    if (voltage == null) continue;
    rows.push({
      measurementId: row.snapshotId,
      observedAt: row.observedAt,
      numericValue: voltage,
      providerTimestamp: row.observedAt,
      context: {
        engineRunning: row.engineRunning,
      },
    });
  }
  return rows;
}

function classifyResult(
  quality: BatteryMeasurementQuality,
  reason: keyof typeof SNAPSHOT_REST_BACKFILL_REASONS,
  evidenceEligible: boolean,
  voltage: number,
  wakeFlank = false,
): SnapshotRestBackfillClassification {
  const meta = SNAPSHOT_REST_BACKFILL_REASONS[reason];
  return {
    quality,
    reasonCode: meta.code,
    reasonLabel: meta.labelDe,
    evidenceEligible,
    voltage,
    wakeFlank,
    skipped: false,
  };
}

export function classifySnapshotRestBackfillCandidate(input: {
  candidate: SnapshotRestBackfillCandidate;
  policy?: SnapshotRestBackfillPolicyInput;
  wakeFlankIds?: Set<string>;
}): SnapshotRestBackfillClassification {
  const maxRestingVoltage = input.policy?.maxRestingVoltage ?? DEFAULT_MAX_RESTING_V;
  const wakeVoltageThreshold =
    input.policy?.wakeVoltageThreshold ?? DEFAULT_WAKE_THRESHOLD_V;
  const wakeFlankIds = input.wakeFlankIds ?? new Set<string>();

  if (input.candidate.restingVoltage == null) {
    return {
      quality: BatteryMeasurementQuality.SHADOW,
      reasonCode: SNAPSHOT_REST_BACKFILL_REASONS.missing_rest_voltage.code,
      reasonLabel: SNAPSHOT_REST_BACKFILL_REASONS.missing_rest_voltage.labelDe,
      evidenceEligible: false,
      voltage: input.candidate.voltageV,
      wakeFlank: false,
      skipped: true,
      skipReason: 'missing_rest_voltage',
    };
  }

  const voltage = resolveSnapshotRestVoltage(input.candidate);
  if (voltage == null || !isPlausibleRestVoltage(voltage)) {
    return {
      ...classifyResult(
        BatteryMeasurementQuality.MISSING_CONTEXT,
        'implausible_voltage',
        false,
        input.candidate.voltageV,
      ),
      skipped: true,
      skipReason: 'implausible_voltage',
    };
  }

  if (input.candidate.engineRunning) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
      'contaminated_by_active_trip',
      false,
      voltage,
    );
  }

  if (wakeFlankIds.has(input.candidate.snapshotId)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
      'wake_flank',
      false,
      voltage,
      true,
    );
  }

  if (isRestTargetWakeVoltage(voltage, wakeVoltageThreshold)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
      'contaminated_by_wake',
      false,
      voltage,
    );
  }

  if (voltage > maxRestingVoltage) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
      'contaminated_by_charging',
      false,
      voltage,
    );
  }

  if (voltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V && voltage <= maxRestingVoltage) {
    return classifyResult(
      BatteryMeasurementQuality.VALID,
      'valid_historical_rest_capture',
      true,
      voltage,
    );
  }

  return classifyResult(
    BatteryMeasurementQuality.VALID,
    'valid_historical_rest_capture',
    true,
    voltage,
  );
}

export function groupSnapshotRestSessions(
  candidates: SnapshotRestBackfillCandidate[],
  gapMs = 6 * 60 * 60_000,
): SnapshotRestBackfillCandidate[][] {
  const sorted = [...candidates].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const groups: SnapshotRestBackfillCandidate[][] = [];
  let current: SnapshotRestBackfillCandidate[] = [];

  for (const row of sorted) {
    if (current.length === 0) {
      current.push(row);
      continue;
    }
    const prev = current[current.length - 1];
    if (row.observedAt.getTime() - prev.observedAt.getTime() > gapMs) {
      groups.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

export function classifySnapshotRestBackfillBatch(input: {
  candidates: SnapshotRestBackfillCandidate[];
  policy?: SnapshotRestBackfillPolicyInput;
}): Map<string, SnapshotRestBackfillClassification> {
  const result = new Map<string, SnapshotRestBackfillClassification>();
  const groups = groupSnapshotRestSessions(input.candidates);

  for (const group of groups) {
    const wakeFlankIds = detectWakeFlankMeasurementIds(
      toWakeFlankObservationCandidates(group),
      input.policy?.wakeVoltageThreshold ?? DEFAULT_WAKE_THRESHOLD_V,
    );

    for (const candidate of group) {
      result.set(
        candidate.snapshotId,
        classifySnapshotRestBackfillCandidate({
          candidate,
          policy: input.policy,
          wakeFlankIds,
        }),
      );
    }
  }

  return result;
}
