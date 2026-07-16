import type { DimoEnergyEventSegment } from '../dimo-segments.service';
import type { NormalizedDimoRechargeSegment } from './dimo-recharge-segments.types';

/** Maps normalized recharge segments to legacy `DimoEnergyEventSegment` shape. */
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
    durationSeconds: segment.durationSeconds,
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
