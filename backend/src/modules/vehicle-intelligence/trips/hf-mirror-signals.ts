import { resolveSignalGroup } from '@modules/clickhouse/hf-signal-map';
import type { HfSignalPoint } from '@modules/clickhouse/clickhouse-hf.types';
import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';

/** Minimum spacing between mirrored GPS lat/lng pairs (avoids 1 Hz live-map flood). */
export const HF_MIRROR_GPS_MIN_INTERVAL_MS = 30_000;

/** Skip consecutive identical scalar samples (tire pressure etc.). */
export const HF_MIRROR_DEDUPE_IDENTICAL_SCALARS = true;

export interface HfMirrorPointContext {
  orgId: string;
  vehicleId: string;
  tokenId: number;
  tripId: string;
  bookingId?: string | null;
  source: string;
}

type ScalarPick = (r: HighFrequencyReading) => number | null;
type BoolPick = (r: HighFrequencyReading) => boolean | null;

interface FloatSignalDef {
  kind: 'float';
  signalName: string;
  unit: string | null;
  pick: ScalarPick;
  dedupeIdentical?: boolean;
  gpsDownsample?: boolean;
}

interface BoolSignalDef {
  kind: 'bool';
  signalName: string;
  pick: BoolPick;
}

type MirrorSignalDef = FloatSignalDef | BoolSignalDef;

/** Canonical DIMO signal names — only fields present on HighFrequencyReading. */
const MIRROR_SIGNALS: MirrorSignalDef[] = [
  { kind: 'float', signalName: 'speed', unit: 'km/h', pick: (r) => r.speedKmh },
  {
    kind: 'float',
    signalName: 'powertrainCombustionEngineSpeed',
    unit: 'rpm',
    pick: (r) => r.rpm,
  },
  {
    kind: 'float',
    signalName: 'powertrainCombustionEngineECT',
    unit: '°C',
    pick: (r) => r.engineCoolantTempC,
  },
  {
    kind: 'float',
    signalName: 'obdThrottlePosition',
    unit: '%',
    pick: (r) => r.throttlePosition,
  },
  { kind: 'float', signalName: 'obdEngineLoad', unit: '%', pick: (r) => r.engineLoad },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryCurrentPower',
    unit: 'kW',
    pick: (r) => r.tractionBatteryPowerKw,
  },
  {
    kind: 'float',
    signalName: 'currentLocationLatitude',
    unit: 'deg',
    pick: (r) => r.latitude ?? null,
    gpsDownsample: true,
  },
  {
    kind: 'float',
    signalName: 'currentLocationLongitude',
    unit: 'deg',
    pick: (r) => r.longitude ?? null,
    gpsDownsample: true,
  },
  {
    kind: 'float',
    signalName: 'powertrainTransmissionTravelledDistance',
    unit: 'km',
    pick: (r) => r.odometerKm ?? null,
  },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryStateOfChargeCurrent',
    unit: '%',
    pick: (r) => r.socPercent ?? null,
  },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    unit: 'kWh',
    pick: (r) => r.socEnergyKwh ?? null,
  },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryRange',
    unit: 'km',
    pick: (r) => r.batteryRangeKm ?? null,
  },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryCurrentVoltage',
    unit: 'V',
    pick: (r) => r.batteryVoltageV ?? null,
  },
  {
    kind: 'float',
    signalName: 'exteriorAirTemperature',
    unit: '°C',
    pick: (r) => r.exteriorAirTempC ?? null,
  },
  {
    kind: 'float',
    signalName: 'chassisAxleRow1WheelLeftTirePressure',
    unit: 'bar',
    pick: (r) => r.tirePressureFrontLeftBar ?? null,
    dedupeIdentical: true,
  },
  {
    kind: 'float',
    signalName: 'chassisAxleRow1WheelRightTirePressure',
    unit: 'bar',
    pick: (r) => r.tirePressureFrontRightBar ?? null,
    dedupeIdentical: true,
  },
  {
    kind: 'float',
    signalName: 'chassisAxleRow2WheelLeftTirePressure',
    unit: 'bar',
    pick: (r) => r.tirePressureRearLeftBar ?? null,
    dedupeIdentical: true,
  },
  {
    kind: 'float',
    signalName: 'chassisAxleRow2WheelRightTirePressure',
    unit: 'bar',
    pick: (r) => r.tirePressureRearRightBar ?? null,
    dedupeIdentical: true,
  },
  {
    kind: 'float',
    signalName: 'powertrainTractionBatteryChargingPower',
    unit: 'kW',
    pick: (r) => r.chargingPowerKw ?? null,
  },
  { kind: 'bool', signalName: 'isIgnitionOn', pick: (r) => r.ignitionOn ?? null },
  {
    kind: 'bool',
    signalName: 'powertrainTractionBatteryChargingIsCharging',
    pick: (r) => r.chargingActive ?? null,
  },
];

/**
 * Maps post-trip HF readings into normalized ClickHouse HF points.
 * Pure — unit-tested without Nest/ClickHouse.
 */
export function buildHfMirrorPoints(
  ctx: HfMirrorPointContext,
  readings: HighFrequencyReading[],
  options?: { gpsMinIntervalMs?: number },
): HfSignalPoint[] {
  const gpsMinIntervalMs = options?.gpsMinIntervalMs ?? HF_MIRROR_GPS_MIN_INTERVAL_MS;
  const out: HfSignalPoint[] = [];
  const base = {
    orgId: ctx.orgId,
    vehicleId: ctx.vehicleId,
    tokenId: ctx.tokenId,
    source: ctx.source,
    tripId: ctx.tripId,
    bookingId: ctx.bookingId ?? null,
    quality: 'normalized' as const,
  };

  let lastGpsEmittedMs: number | null = null;
  const lastScalarBySignal = new Map<string, number>();

  for (const reading of readings) {
    const recordedAt = new Date(reading.timestamp);
    const recordedMs = recordedAt.getTime();
    if (Number.isNaN(recordedMs)) continue;

    const hasGps =
      (reading.latitude ?? null) != null &&
      (reading.longitude ?? null) != null &&
      Number.isFinite(reading.latitude!) &&
      Number.isFinite(reading.longitude!) &&
      !(reading.latitude === 0 && reading.longitude === 0);

    let gpsAllowed = false;
    if (hasGps) {
      if (
        lastGpsEmittedMs == null ||
        recordedMs - lastGpsEmittedMs >= gpsMinIntervalMs
      ) {
        gpsAllowed = true;
        lastGpsEmittedMs = recordedMs;
      }
    }

    for (const sig of MIRROR_SIGNALS) {
      if (sig.kind === 'bool') {
        const value = sig.pick(reading);
        if (value == null) continue;
        out.push({
          ...base,
          signalName: sig.signalName,
          signalGroup: resolveSignalGroup(sig.signalName),
          recordedAt,
          valueBool: value,
        });
        continue;
      }

      if (sig.gpsDownsample && !gpsAllowed) continue;

      const value = sig.pick(reading);
      if (value == null || !Number.isFinite(value)) continue;

      if (
        HF_MIRROR_DEDUPE_IDENTICAL_SCALARS &&
        sig.dedupeIdentical &&
        lastScalarBySignal.get(sig.signalName) === value
      ) {
        continue;
      }
      if (sig.dedupeIdentical) {
        lastScalarBySignal.set(sig.signalName, value);
      }

      out.push({
        ...base,
        signalName: sig.signalName,
        signalGroup: resolveSignalGroup(sig.signalName),
        recordedAt,
        valueFloat: value,
        unit: sig.unit,
      });
    }
  }

  return out;
}
