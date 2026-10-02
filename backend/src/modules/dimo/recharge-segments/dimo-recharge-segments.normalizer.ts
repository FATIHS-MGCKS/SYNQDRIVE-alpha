import type {
  DimoRechargeDurationProvenance,
  DimoRechargeSegmentBooleanAggregate,
  DimoRechargeSegmentBooleanEvidence,
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

/** Known zero vs unknown vs positive vs invalid (reset). */
export function numericDeltaFromExtrema(
  min: number | null,
  max: number | null,
): number | null {
  if (min == null || max == null) return null;
  if (max < min) return null;
  if (max === min) return 0;
  return max - min;
}

export function parseCanonicalSegmentInstant(raw: unknown): string | null {
  const text = readString(raw);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildFingerprint(tokenId: number, startAtIso: string): string {
  const startMs = new Date(startAtIso).getTime();
  if (!Number.isFinite(startMs)) {
    throw new Error('buildFingerprint requires finite start instant');
  }
  return `dimo-recharge-${tokenId}-${startMs}`;
}

function groupSignalValues(signals: unknown): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  const rows = Array.isArray(signals) ? signals : [];

  for (const row of rows) {
    const name = readString((row as { name?: unknown })?.name);
    const value = readNumber((row as { value?: unknown })?.value);
    if (!name || value == null) continue;
    const list = grouped.get(name) ?? [];
    list.push(value);
    grouped.set(name, list);
  }

  return grouped;
}

function pickNumericExtrema(
  grouped: Map<string, number[]>,
  signalName: string,
): DimoRechargeSegmentNumericAggregate {
  const values = grouped.get(signalName) ?? [];
  if (values.length === 0) {
    return { min: null, max: null, delta: null, provenance: 'UNKNOWN' };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    min,
    max,
    delta: numericDeltaFromExtrema(min, max),
    provenance: 'SEGMENT_EXTREMA',
  };
}

function pickBooleanEvidence(
  grouped: Map<string, number[]>,
  signalName: string,
): DimoRechargeSegmentBooleanEvidence {
  const values = grouped.get(signalName) ?? [];
  if (values.length === 0) {
    return {
      anyTrue: null,
      allTrue: null,
      legacyMin01: null,
      legacyMax01: null,
    };
  }

  const legacyMin01 = Math.min(...values);
  const legacyMax01 = Math.max(...values);
  const boolValues = values.map((v) => v >= 0.5);
  return {
    anyTrue: boolValues.some(Boolean),
    allTrue: boolValues.every(Boolean),
    legacyMin01,
    legacyMax01,
  };
}

function toLegacyBooleanAggregate(
  evidence: DimoRechargeSegmentBooleanEvidence,
): DimoRechargeSegmentBooleanAggregate {
  return {
    start: readBoolean01(evidence.legacyMin01),
    end: readBoolean01(evidence.legacyMax01),
  };
}

function toSignalRows(signals: unknown): DimoRechargeSegmentSignalRow[] {
  const rows = Array.isArray(signals) ? signals : [];
  return rows
    .map((row) => {
      const signalName = readString((row as { name?: unknown })?.name);
      const aggregation = readString((row as { agg?: unknown })?.agg) ?? 'LIVE_VALUE';
      const value = readNumber((row as { value?: unknown })?.value);
      if (!signalName) return null;
      return { signalName, aggregation, value };
    })
    .filter((row): row is DimoRechargeSegmentSignalRow => row != null);
}

function resolveDuration(input: {
  ongoing: boolean;
  startAt: string;
  endAt: string | null;
  providerDuration: number | null;
}): { durationSeconds: number | null; durationProvenance: DimoRechargeDurationProvenance } {
  if (input.ongoing) {
    if (input.providerDuration != null && input.providerDuration >= 0) {
      return {
        durationSeconds: input.providerDuration,
        durationProvenance: 'PROVIDER_DURATION',
      };
    }
    return { durationSeconds: null, durationProvenance: 'UNKNOWN_ONGOING' };
  }

  const startMs = new Date(input.startAt).getTime();
  const endMs = input.endAt ? new Date(input.endAt).getTime() : NaN;
  const derived =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, Math.round((endMs - startMs) / 1000))
      : null;

  if (input.providerDuration != null && input.providerDuration > 0) {
    return {
      durationSeconds: input.providerDuration,
      durationProvenance: 'PROVIDER_DURATION',
    };
  }

  if (derived != null) {
    return {
      durationSeconds: derived,
      durationProvenance: 'DERIVED_BOUNDARY_DURATION',
    };
  }

  return { durationSeconds: null, durationProvenance: 'UNKNOWN' };
}

export function normalizeDimoRechargeSegment(
  tokenId: number,
  raw: unknown,
): NormalizedDimoRechargeSegment | null {
  const segment = raw as Record<string, unknown> | null;
  const startAt = parseCanonicalSegmentInstant(
    segment?.start && (segment.start as { timestamp?: unknown }).timestamp,
  );
  if (!startAt) return null;

  const ongoing = segment?.isOngoing === true;
  const endAtRaw = parseCanonicalSegmentInstant(
    segment?.end && (segment.end as { timestamp?: unknown }).timestamp,
  );

  if (ongoing && endAtRaw) return null;
  if (!ongoing && !endAtRaw) return null;

  const endAt = ongoing ? null : endAtRaw;

  if (endAt) {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (!Number.isFinite(endMs)) return null;
    if (endMs < startMs) return null;
    if (endMs === startMs) return null;
  }

  const fingerprint = buildFingerprint(tokenId, startAt);
  const providerSegmentId = readString(segment?.id);
  const grouped = groupSignalValues(segment?.signals);

  const isCharging = pickBooleanEvidence(
    grouped,
    'powertrainTractionBatteryChargingIsCharging',
  );
  const cableConnected = pickBooleanEvidence(
    grouped,
    'powertrainTractionBatteryChargingIsChargingCableConnected',
  );

  const providerDuration = readNumber(segment?.duration);
  const { durationSeconds, durationProvenance } = resolveDuration({
    ongoing,
    startAt,
    endAt,
    providerDuration,
  });

  const startValue = (segment?.start as { value?: Record<string, unknown> } | undefined)?.value;
  const endValue = (segment?.end as { value?: Record<string, unknown> } | undefined)?.value;

  return {
    segmentId: fingerprint,
    providerSegmentId,
    fingerprint,
    tokenId,
    startAt,
    endAt,
    ongoing,
    startedBeforeRange: segment?.startedBeforeRange === true,
    durationSeconds,
    durationProvenance,
    startLocation: {
      latitude: readNumber(startValue?.latitude),
      longitude: readNumber(startValue?.longitude),
    },
    endLocation: {
      latitude: readNumber(endValue?.latitude),
      longitude: readNumber(endValue?.longitude),
    },
    soc: pickNumericExtrema(grouped, 'powertrainTractionBatteryStateOfChargeCurrent'),
    currentEnergyKwh: pickNumericExtrema(
      grouped,
      'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    ),
    addedEnergyKwh: pickNumericExtrema(
      grouped,
      'powertrainTractionBatteryChargingAddedEnergy',
    ),
    isCharging,
    cableConnected,
    isChargingLegacy: toLegacyBooleanAggregate(isCharging),
    cableConnectedLegacy: toLegacyBooleanAggregate(cableConnected),
    odometerKm: pickNumericExtrema(grouped, 'powertrainTransmissionTravelledDistance'),
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
