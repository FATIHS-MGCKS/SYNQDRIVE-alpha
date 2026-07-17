import type {
  DimoRechargeSegmentBooleanAggregate,
  DimoRechargeSegmentNumericAggregate,
  DimoRechargeSegmentSignalRow,
  NormalizedDimoRechargeSegment,
} from './dimo-recharge-segments.types';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean01(value: number | null): boolean | null {
  if (value == null) return null;
  return value >= 0.5;
}

function positiveDelta(min: number | null, max: number | null): number | null {
  if (min == null || max == null || max <= min) return null;
  return max - min;
}

function buildFingerprint(tokenId: number, startAt: string): string {
  const startMs = new Date(startAt).getTime();
  return `dimo-recharge-${tokenId}-${startMs}`;
}

function groupNumericSignals(
  signals: unknown,
): Map<string, Array<{ agg: string; value: number }>> {
  const grouped = new Map<string, Array<{ agg: string; value: number }>>();
  const rows = Array.isArray(signals) ? signals : [];

  for (const row of rows) {
    const name = readString((row as { name?: unknown })?.name);
    const value = readNumber((row as { value?: unknown })?.value);
    const agg = readString((row as { agg?: unknown })?.agg) ?? 'UNKNOWN';
    if (!name || value == null) continue;

    const list = grouped.get(name) ?? [];
    list.push({ agg, value });
    grouped.set(name, list);
  }

  return grouped;
}

function pickMinMax(
  grouped: Map<string, Array<{ agg: string; value: number }>>,
  signalName: string,
): DimoRechargeSegmentNumericAggregate {
  const rows = grouped.get(signalName) ?? [];
  const values = rows.map((row) => row.value);
  if (values.length === 0) {
    return { min: null, max: null, delta: null };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, delta: positiveDelta(min, max) };
}

function pickBooleanMinMax(
  grouped: Map<string, Array<{ agg: string; value: number }>>,
  signalName: string,
): DimoRechargeSegmentBooleanAggregate {
  const aggregate = pickMinMax(grouped, signalName);
  return {
    start: readBoolean01(aggregate.min),
    end: readBoolean01(aggregate.max),
  };
}

function toSignalRows(signals: unknown): DimoRechargeSegmentSignalRow[] {
  const rows = Array.isArray(signals) ? signals : [];
  return rows
    .map((row) => {
      const signalName = readString((row as { name?: unknown })?.name);
      const aggregation = readString((row as { agg?: unknown })?.agg) ?? 'UNKNOWN';
      const value = readNumber((row as { value?: unknown })?.value);
      if (!signalName) return null;
      return { signalName, aggregation, value };
    })
    .filter((row): row is DimoRechargeSegmentSignalRow => row != null);
}

export function normalizeDimoRechargeSegment(
  tokenId: number,
  raw: unknown,
): NormalizedDimoRechargeSegment | null {
  const segment = raw as Record<string, unknown> | null;
  const startAt = readString(segment?.start && (segment.start as { timestamp?: unknown }).timestamp);
  if (!startAt) return null;

  const endAt = readString(segment?.end && (segment.end as { timestamp?: unknown }).timestamp);
  const grouped = groupNumericSignals(segment?.signals);
  const fingerprint = buildFingerprint(tokenId, startAt);
  const providerSegmentId = readString(segment?.id);

  const startValue = (segment?.start as { value?: Record<string, unknown> } | undefined)?.value;
  const endValue = (segment?.end as { value?: Record<string, unknown> } | undefined)?.value;

  return {
    segmentId: providerSegmentId ?? fingerprint,
    providerSegmentId,
    fingerprint,
    tokenId,
    startAt,
    endAt,
    ongoing: segment?.isOngoing === true,
    startedBeforeRange: segment?.startedBeforeRange === true,
    durationSeconds: readNumber(segment?.duration) ?? 0,
    startLocation: {
      latitude: readNumber(startValue?.latitude),
      longitude: readNumber(startValue?.longitude),
    },
    endLocation: {
      latitude: readNumber(endValue?.latitude),
      longitude: readNumber(endValue?.longitude),
    },
    soc: pickMinMax(grouped, 'powertrainTractionBatteryStateOfChargeCurrent'),
    currentEnergyKwh: pickMinMax(
      grouped,
      'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    ),
    addedEnergyKwh: pickMinMax(
      grouped,
      'powertrainTractionBatteryChargingAddedEnergy',
    ),
    isCharging: pickBooleanMinMax(
      grouped,
      'powertrainTractionBatteryChargingIsCharging',
    ),
    cableConnected: pickBooleanMinMax(
      grouped,
      'powertrainTractionBatteryChargingIsChargingCableConnected',
    ),
    odometerKm: pickMinMax(grouped, 'powertrainTransmissionTravelledDistance'),
    signalRows: toSignalRows(segment?.signals),
    sourceTimestamps: {
      segmentStartAt: startAt,
      segmentEndAt: endAt,
    },
  };
}

export function normalizeDimoRechargeSegments(
  tokenId: number,
  rawSegments: unknown[],
): NormalizedDimoRechargeSegment[] {
  return rawSegments
    .map((segment) => normalizeDimoRechargeSegment(tokenId, segment))
    .filter((segment): segment is NormalizedDimoRechargeSegment => segment != null)
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}
