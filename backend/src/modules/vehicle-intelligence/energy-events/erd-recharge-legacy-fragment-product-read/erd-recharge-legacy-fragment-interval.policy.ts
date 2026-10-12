import type { ErdRechargeShadowLegacySnapshot } from '../erd-recharge-shadow-parity/erd-recharge-shadow-parity.types';
import { isValidLegacyInterval } from '../erd-recharge-shadow-parity/erd-recharge-shadow-fragment.policy';

export interface LegacyRechargeIntervalRow {
  startTime: Date;
  endTime: Date;
}

export function toLegacySnapshot(row: LegacyRechargeIntervalRow): ErdRechargeShadowLegacySnapshot {
  const durationSeconds = Math.max(
    1,
    Math.floor((row.endTime.getTime() - row.startTime.getTime()) / 1000),
  );
  return {
    vehicleEnergyEventId: '',
    dimoSegmentId: '',
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationSeconds,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: null,
    odometerEndKm: null,
    confidence: 'HIGH',
    startLatitude: null,
    startLongitude: null,
    endLatitude: null,
    endLongitude: null,
    coalescedFromSegmentIds: [],
  };
}

/**
 * Strict temporal containment within envelope window (E5.4A-aligned).
 * Identical full boundaries are NOT fragments.
 */
export function isStrictlyContainedInEnvelope(input: {
  row: LegacyRechargeIntervalRow;
  envelope: LegacyRechargeIntervalRow;
}): boolean {
  if (!isValidLegacyInterval(toLegacySnapshot(input.row))) return false;
  if (!isValidLegacyInterval(toLegacySnapshot(input.envelope))) return false;
  const eStart = input.envelope.startTime.getTime();
  const eEnd = input.envelope.endTime.getTime();
  const rStart = input.row.startTime.getTime();
  const rEnd = input.row.endTime.getTime();
  if (rStart < eStart || rEnd > eEnd) return false;
  return rStart > eStart || rEnd < eEnd;
}
