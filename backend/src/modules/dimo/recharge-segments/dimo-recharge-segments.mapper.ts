import type { DimoEnergyEventSegment } from '../dimo-segments.service';
import type { NormalizedDimoRechargeSegment } from './dimo-recharge-segments.types';

function legacyDurationSeconds(segment: NormalizedDimoRechargeSegment): number {
  if (segment.durationSeconds != null) return segment.durationSeconds;
  if (segment.endAt) {
    const startMs = new Date(segment.startAt).getTime();
    const endMs = new Date(segment.endAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      return Math.max(0, Math.round((endMs - startMs) / 1000));
    }
  }
  return 0;
}

/** Maps normalized recharge segments to legacy `DimoEnergyEventSegment` shape (LEGACY_EXTREMA_PROXY). */
export function mapRechargeSegmentToEnergyEvent(
  segment: NormalizedDimoRechargeSegment,
): DimoEnergyEventSegment {
  return {
    segmentId: segment.segmentId,
    mechanism: 'recharge',
    startTime: segment.startAt,
    endTime: segment.endAt,
    isOngoing: segment.ongoing,
    startedBeforeRange: segment.startedBeforeRange,
    durationSeconds: legacyDurationSeconds(segment),
    startLatitude: segment.startLocation.latitude,
    startLongitude: segment.startLocation.longitude,
    endLatitude: segment.endLocation.latitude,
    endLongitude: segment.endLocation.longitude,
    odometerStartKm: segment.odometerKm.min,
    odometerEndKm: segment.odometerKm.max,
    fuelStartLiters: null,
    fuelEndLiters: null,
    fuelDeltaLiters: null,
    fuelStartPercent: null,
    fuelEndPercent: null,
    fuelDeltaPercent: null,
    socStartPercent: segment.soc.min,
    socEndPercent: segment.soc.max,
    socDeltaPercent: segment.soc.delta,
    energyStartKwh: segment.currentEnergyKwh.min,
    energyEndKwh: segment.currentEnergyKwh.max,
    energyDeltaKwh: segment.currentEnergyKwh.delta,
  };
}
