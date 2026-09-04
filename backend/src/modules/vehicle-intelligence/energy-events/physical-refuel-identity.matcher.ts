/**
 * Historical REFUEL physical-sibling dry-run (read-only design validation).
 * Uses semantic matcher from G1.1 closure design — no DB writes.
 */
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

export interface RefuelRowForMatcher {
  id: string;
  vehicleId: string;
  kind: 'REFUEL';
  startTime: string;
  endTime: string;
  fuelStartLiters?: number | null;
  fuelEndLiters?: number | null;
  fuelDeltaLiters?: number | null;
  fuelDeltaPercent?: number | null;
  durationSeconds?: number | null;
  odometerEndKm?: number | null;
  dimoSegmentId: string;
}

const TOLERANCES = {
  fuelLiters: 0.5,
  fuelPct: 0.2,
  endTimeSec: 60,
  odometerKm: 1,
};

export function evaluatePhysicalRefuelSibling(
  a: RefuelRowForMatcher,
  b: RefuelRowForMatcher,
): { match: boolean; reason: string; canonicalPrefer?: 'A' | 'B' } {
  if (a.vehicleId !== b.vehicleId) return { match: false, reason: 'different_vehicle' };
  if (a.kind !== 'REFUEL' || b.kind !== 'REFUEL') return { match: false, reason: 'not_refuel' };

  const endDelta =
    Math.abs(new Date(a.endTime).getTime() - new Date(b.endTime).getTime()) / 1000;
  if (endDelta > TOLERANCES.endTimeSec) return { match: false, reason: 'end_time_mismatch' };

  const fuelEndA = a.fuelEndLiters;
  const fuelEndB = b.fuelEndLiters;
  if (
    fuelEndA != null &&
    fuelEndB != null &&
    Math.abs(fuelEndA - fuelEndB) > TOLERANCES.fuelLiters
  ) {
    return { match: false, reason: 'terminal_fuel_liters_mismatch' };
  }

  const odoA = a.odometerEndKm;
  const odoB = b.odometerEndKm;
  if (odoA != null && odoB != null && Math.abs(odoA - odoB) > TOLERANCES.odometerKm) {
    return { match: false, reason: 'odometer_mismatch' };
  }

  const contained =
    new Date(b.startTime) >= new Date(a.startTime) &&
    new Date(b.endTime) <= new Date(a.endTime);
  const reverseContained =
    new Date(a.startTime) >= new Date(b.startTime) &&
    new Date(a.endTime) <= new Date(b.endTime);

  const suffixCompatible =
    a.fuelStartLiters != null &&
    a.fuelEndLiters != null &&
    b.fuelStartLiters != null &&
    b.fuelEndLiters != null &&
    Math.abs(a.fuelEndLiters - b.fuelEndLiters) <= TOLERANCES.fuelLiters &&
    b.fuelStartLiters >= a.fuelStartLiters - TOLERANCES.fuelLiters &&
    b.fuelEndLiters <= a.fuelEndLiters + TOLERANCES.fuelLiters;

  if (!contained && !reverseContained && !suffixCompatible) {
    return { match: false, reason: 'no_containment_or_suffix' };
  }

  const completeness = (row: RefuelRowForMatcher) => {
    const span =
      (row.fuelEndLiters ?? 0) - (row.fuelStartLiters ?? 0);
    const delta = row.fuelDeltaLiters ?? 0;
    return Math.max(span, delta);
  };
  const canonicalPrefer = completeness(a) >= completeness(b) ? 'A' : 'B';
  return { match: true, reason: 'physical_sibling', canonicalPrefer };
}

/** Production REFUEL rows (read-only export 2026-09-04) for calibration. */
export const HISTORICAL_REFUEL_CALIBRATION_ROWS: RefuelRowForMatcher[] = [
  {
    id: KS_MX_2024_SEPT04_EVENT_A.id,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    kind: 'REFUEL',
    startTime: KS_MX_2024_SEPT04_EVENT_A.startTime,
    endTime: KS_MX_2024_SEPT04_EVENT_A.endTime,
    fuelStartLiters: KS_MX_2024_SEPT04_EVENT_A.fuelStartLiters,
    fuelEndLiters: KS_MX_2024_SEPT04_EVENT_A.fuelEndLiters,
    fuelDeltaLiters: KS_MX_2024_SEPT04_EVENT_A.fuelDeltaLiters,
    fuelDeltaPercent: KS_MX_2024_SEPT04_EVENT_A.fuelDeltaPercent,
    durationSeconds: KS_MX_2024_SEPT04_EVENT_A.durationSeconds,
    odometerEndKm: KS_MX_2024_SEPT04_EVENT_A.odometerEndKm,
    dimoSegmentId: KS_MX_2024_SEPT04_EVENT_A.dimoSegmentId,
  },
  {
    id: KS_MX_2024_SEPT04_EVENT_B.id,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    kind: 'REFUEL',
    startTime: KS_MX_2024_SEPT04_EVENT_B.startTime,
    endTime: KS_MX_2024_SEPT04_EVENT_B.endTime,
    fuelStartLiters: KS_MX_2024_SEPT04_EVENT_B.fuelStartLiters,
    fuelEndLiters: KS_MX_2024_SEPT04_EVENT_B.fuelEndLiters,
    fuelDeltaLiters: KS_MX_2024_SEPT04_EVENT_B.fuelDeltaLiters,
    fuelDeltaPercent: KS_MX_2024_SEPT04_EVENT_B.fuelDeltaPercent,
    durationSeconds: KS_MX_2024_SEPT04_EVENT_B.durationSeconds,
    odometerEndKm: KS_MX_2024_SEPT04_EVENT_B.odometerEndKm,
    dimoSegmentId: KS_MX_2024_SEPT04_EVENT_B.dimoSegmentId,
  },
  // 2026-08-29 overlapping siblings (same endTime)
  {
    id: '49cb0be0-f321-4082-a6ed-9f8866529cff',
    vehicleId: '192922-vehicle',
    kind: 'REFUEL',
    startTime: '2026-08-29T17:45:02.000Z',
    endTime: '2026-08-29T18:01:03.000Z',
    fuelDeltaLiters: 23,
    fuelDeltaPercent: 41.96,
    durationSeconds: 961,
    dimoSegmentId: 'dimo-refuel-192922-1788025502000',
  },
  {
    id: '6c0002ea-0cc9-444a-9740-88c0fa7b2b47',
    vehicleId: '192922-vehicle',
    kind: 'REFUEL',
    startTime: '2026-08-29T17:51:19.707Z',
    endTime: '2026-08-29T18:01:03.000Z',
    fuelDeltaLiters: 3,
    fuelDeltaPercent: 3.53,
    durationSeconds: 583,
    dimoSegmentId: 'dimo-refuel-192922-1788025879707',
  },
  // Clearly separate refuels (different days)
  {
    id: 'fa9ed4d8-b4c3-4d17-aced-0d87fe6e92a1',
    vehicleId: 'other',
    kind: 'REFUEL',
    startTime: '2026-09-03T15:17:32.000Z',
    endTime: '2026-09-03T15:25:28.000Z',
    fuelDeltaLiters: 19,
    durationSeconds: 476,
    dimoSegmentId: 'dimo-refuel-192922-1788448652000',
  },
  {
    id: '5cd2f6b1-ba7c-47ea-a07f-7db0337bc5ac',
    vehicleId: 'other',
    kind: 'REFUEL',
    startTime: '2026-09-02T17:42:56.000Z',
    endTime: '2026-09-02T17:48:54.000Z',
    fuelDeltaLiters: 16,
    durationSeconds: 358,
    dimoSegmentId: 'dimo-refuel-192922-1788370976000',
  },
];
