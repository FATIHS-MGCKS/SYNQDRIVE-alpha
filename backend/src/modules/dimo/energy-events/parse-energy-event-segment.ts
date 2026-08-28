import type { DimoEnergyEventSegment } from '../dimo-segments.service';

type DimoDetectionMechanism = 'refuel' | 'recharge';

function groupNumericSignalValues(
  signals: Array<{ name?: string; value?: number }> | undefined,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (!Array.isArray(signals)) return map;
  for (const signal of signals) {
    if (!signal?.name || typeof signal.value !== 'number') continue;
    const list = map.get(signal.name) ?? [];
    list.push(signal.value);
    map.set(signal.name, list);
  }
  return map;
}

export function parseDimoEnergyEventSegment(
  tokenId: number,
  mechanism: Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>,
  segment: unknown,
): DimoEnergyEventSegment | null {
  const raw = segment as Record<string, unknown>;
  const start = raw?.start as { timestamp?: string; value?: { latitude?: number; longitude?: number } } | undefined;
  const end = raw?.end as { timestamp?: string; value?: { latitude?: number; longitude?: number } } | undefined;
  const startTimestamp = typeof start?.timestamp === 'string' ? start.timestamp : null;
  if (!startTimestamp) return null;
  const endTimestamp = typeof end?.timestamp === 'string' ? end.timestamp : null;

  const signalValues = groupNumericSignalValues(
    raw?.signals as Array<{ name?: string; value?: number }> | undefined,
  );
  const pick = (name: string): { min: number | null; max: number | null } => {
    const values = signalValues.get(name) ?? [];
    if (values.length === 0) return { min: null, max: null };
    return { min: Math.min(...values), max: Math.max(...values) };
  };

  const odometer = pick('powertrainTransmissionTravelledDistance');
  const fuelAbs = pick('powertrainFuelSystemAbsoluteLevel');
  const fuelRel = pick('powertrainFuelSystemRelativeLevel');
  const soc = pick('powertrainTractionBatteryStateOfChargeCurrent');
  const energy = pick('powertrainTractionBatteryStateOfChargeCurrentEnergy');

  const posDelta = (min: number | null, max: number | null): number | null =>
    min != null && max != null && max > min ? max - min : null;

  return {
    segmentId: `dimo-${mechanism}-${tokenId}-${new Date(startTimestamp).getTime()}`,
    mechanism,
    startTime: startTimestamp,
    endTime: endTimestamp,
    isOngoing: raw?.isOngoing === true,
    startedBeforeRange: raw?.startedBeforeRange === true,
    durationSeconds: typeof raw?.duration === 'number' ? raw.duration : 0,
    startLatitude: typeof start?.value?.latitude === 'number' ? start.value.latitude : null,
    startLongitude: typeof start?.value?.longitude === 'number' ? start.value.longitude : null,
    endLatitude: typeof end?.value?.latitude === 'number' ? end.value.latitude : null,
    endLongitude: typeof end?.value?.longitude === 'number' ? end.value.longitude : null,
    odometerStartKm: odometer.min,
    odometerEndKm: odometer.max,
    fuelStartLiters: mechanism === 'refuel' ? fuelAbs.min : null,
    fuelEndLiters: mechanism === 'refuel' ? fuelAbs.max : null,
    fuelDeltaLiters: mechanism === 'refuel' ? posDelta(fuelAbs.min, fuelAbs.max) : null,
    fuelStartPercent: mechanism === 'refuel' ? fuelRel.min : null,
    fuelEndPercent: mechanism === 'refuel' ? fuelRel.max : null,
    fuelDeltaPercent: mechanism === 'refuel' ? posDelta(fuelRel.min, fuelRel.max) : null,
    socStartPercent: mechanism === 'recharge' ? soc.min : null,
    socEndPercent: mechanism === 'recharge' ? soc.max : null,
    socDeltaPercent: mechanism === 'recharge' ? posDelta(soc.min, soc.max) : null,
    energyStartKwh: mechanism === 'recharge' ? energy.min : null,
    energyEndKwh: mechanism === 'recharge' ? energy.max : null,
    energyDeltaKwh: mechanism === 'recharge' ? posDelta(energy.min, energy.max) : null,
  };
}
