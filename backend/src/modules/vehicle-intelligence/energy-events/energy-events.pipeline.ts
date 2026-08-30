import {
  EnergyEventConfidence,
  EnergyEventKind,
} from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';

export const COALESCE_GAP_SECONDS_RECHARGE = 30 * 60;
export const COALESCE_GAP_SECONDS_REFUEL = 5 * 60;
export const COALESCE_GEO_RADIUS_M = 250;

export interface CoalescedEnergySegment extends DimoEnergyEventSegment {
  coalescedSegmentId: string;
  coalescedFromSegmentIds: string[];
}

export interface EnergyEventUpsertPayload {
  vehicleId: string;
  kind: EnergyEventKind;
  detectionMechanism: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: EnergyEventConfidence;
  rawDetectionMeta: Record<string, unknown>;
  dimoSegmentId: string;
  fuelLevelRiseStart: Date | null;
  fuelLevelRiseEnd: Date | null;
  fuelLevelRiseDurationSeconds: number | null;
}

export function isSegmentPersistable(segment: DimoEnergyEventSegment): boolean {
  if (!segment.endTime) return false;
  if (segment.isOngoing) return false;
  if (segment.durationSeconds <= 0) return false;
  if (segment.mechanism === 'refuel') {
    return (segment.fuelDeltaLiters ?? 0) > 1.0;
  }
  return (
    (segment.socDeltaPercent ?? 0) >= 1 ||
    (segment.energyDeltaKwh ?? 0) > 0
  );
}

export function coalesceSegments(
  segments: DimoEnergyEventSegment[],
): CoalescedEnergySegment[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const groups: DimoEnergyEventSegment[][] = [];
  let current: DimoEnergyEventSegment[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const next = sorted[i];

    if (prev.mechanism !== next.mechanism) {
      groups.push(current);
      current = [next];
      continue;
    }

    const prevEnd = prev.endTime
      ? new Date(prev.endTime).getTime()
      : new Date(prev.startTime).getTime() + prev.durationSeconds * 1000;
    const nextStart = new Date(next.startTime).getTime();
    const gapSeconds = Math.max(0, (nextStart - prevEnd) / 1000);

    const gapBudget =
      next.mechanism === 'refuel'
        ? COALESCE_GAP_SECONDS_REFUEL
        : COALESCE_GAP_SECONDS_RECHARGE;

    if (gapSeconds > gapBudget) {
      groups.push(current);
      current = [next];
      continue;
    }

    const distanceM = haversineMeters(
      prev.endLatitude,
      prev.endLongitude,
      next.startLatitude,
      next.startLongitude,
    );
    if (distanceM != null && distanceM > COALESCE_GEO_RADIUS_M) {
      groups.push(current);
      current = [next];
      continue;
    }

    current.push(next);
  }
  groups.push(current);

  return groups.map((group) => mergeGroup(group));
}

function mergeGroup(group: DimoEnergyEventSegment[]): CoalescedEnergySegment {
  const first = group[0];
  if (group.length === 1) {
    return {
      ...first,
      coalescedSegmentId: first.segmentId,
      coalescedFromSegmentIds: [first.segmentId],
    };
  }
  const last = group[group.length - 1];

  const startMs = Math.min(
    ...group.map((g) => new Date(g.startTime).getTime()),
  );
  const endMs = Math.max(
    ...group.map((g) =>
      g.endTime ? new Date(g.endTime).getTime() : new Date(g.startTime).getTime(),
    ),
  );

  const sumPositive = (
    values: Array<number | null | undefined>,
  ): number | null => {
    const finite = values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    if (finite.length === 0) return null;
    return finite.reduce((acc, v) => acc + v, 0);
  };

  const envelopeMin = (values: Array<number | null | undefined>): number | null => {
    const finite = values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    return finite.length === 0 ? null : Math.min(...finite);
  };
  const envelopeMax = (values: Array<number | null | undefined>): number | null => {
    const finite = values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    return finite.length === 0 ? null : Math.max(...finite);
  };

  const idMatch = first.segmentId.match(/^dimo-(refuel|recharge)-(\d+)-/);
  const tokenIdPart = idMatch?.[2] ?? '0';
  const coalescedSegmentId = `dimo-${first.mechanism}-coalesced-${tokenIdPart}-${startMs}`;

  return {
    segmentId: coalescedSegmentId,
    mechanism: first.mechanism,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    isOngoing: false,
    startedBeforeRange: first.startedBeforeRange,
    durationSeconds: Math.round((endMs - startMs) / 1000),
    startLatitude: first.startLatitude,
    startLongitude: first.startLongitude,
    endLatitude: last.endLatitude,
    endLongitude: last.endLongitude,
    odometerStartKm: envelopeMin(group.map((g) => g.odometerStartKm)),
    odometerEndKm: envelopeMax(group.map((g) => g.odometerEndKm)),
    fuelStartLiters: envelopeMin(group.map((g) => g.fuelStartLiters)),
    fuelEndLiters: envelopeMax(group.map((g) => g.fuelEndLiters)),
    fuelDeltaLiters: sumPositive(group.map((g) => g.fuelDeltaLiters)),
    fuelStartPercent: envelopeMin(group.map((g) => g.fuelStartPercent)),
    fuelEndPercent: envelopeMax(group.map((g) => g.fuelEndPercent)),
    fuelDeltaPercent: sumPositive(group.map((g) => g.fuelDeltaPercent)),
    socStartPercent: envelopeMin(group.map((g) => g.socStartPercent)),
    socEndPercent: envelopeMax(group.map((g) => g.socEndPercent)),
    socDeltaPercent: sumPositive(group.map((g) => g.socDeltaPercent)),
    energyStartKwh: envelopeMin(group.map((g) => g.energyStartKwh)),
    energyEndKwh: envelopeMax(group.map((g) => g.energyEndKwh)),
    energyDeltaKwh: sumPositive(group.map((g) => g.energyDeltaKwh)),
    coalescedSegmentId,
    coalescedFromSegmentIds: group.map((g) => g.segmentId),
  };
}

export function scoreConfidence(
  segment: DimoEnergyEventSegment,
): EnergyEventConfidence {
  if (segment.mechanism === 'refuel') {
    const liters = segment.fuelDeltaLiters ?? 0;
    if (liters >= 10 && segment.startLatitude != null) {
      return EnergyEventConfidence.HIGH;
    }
    if (liters >= 3) return EnergyEventConfidence.MEDIUM;
    return EnergyEventConfidence.LOW;
  }
  const socDelta = segment.socDeltaPercent ?? 0;
  if (socDelta >= 20 && segment.startLatitude != null) {
    return EnergyEventConfidence.HIGH;
  }
  if (socDelta >= 5) return EnergyEventConfidence.MEDIUM;
  return EnergyEventConfidence.LOW;
}

export function buildUpsertPayload(
  vehicleId: string,
  segment: CoalescedEnergySegment,
  refuelObservation?: {
    fuelLevelRiseStart: Date | null;
    fuelLevelRiseEnd: Date | null;
    fuelLevelRiseDurationSeconds: number | null;
  },
): EnergyEventUpsertPayload {
  const kind: EnergyEventKind =
    segment.mechanism === 'refuel'
      ? EnergyEventKind.REFUEL
      : EnergyEventKind.RECHARGE;

  return {
    vehicleId,
    kind,
    detectionMechanism: segment.mechanism,
    startTime: new Date(segment.startTime),
    endTime: new Date(segment.endTime as string),
    durationSeconds: segment.durationSeconds,
    startLatitude: segment.startLatitude,
    startLongitude: segment.startLongitude,
    endLatitude: segment.endLatitude,
    endLongitude: segment.endLongitude,
    fuelDeltaLiters: segment.fuelDeltaLiters,
    fuelDeltaPercent: segment.fuelDeltaPercent,
    socDeltaPercent: segment.socDeltaPercent,
    energyDeltaKwh: segment.energyDeltaKwh,
    odometerStartKm: segment.odometerStartKm,
    odometerEndKm: segment.odometerEndKm,
    confidence: scoreConfidence(segment),
    rawDetectionMeta: {
      fuelStartLiters: segment.fuelStartLiters,
      fuelEndLiters: segment.fuelEndLiters,
      fuelStartPercent: segment.fuelStartPercent,
      fuelEndPercent: segment.fuelEndPercent,
      socStartPercent: segment.socStartPercent,
      socEndPercent: segment.socEndPercent,
      energyStartKwh: segment.energyStartKwh,
      energyEndKwh: segment.energyEndKwh,
      coalescedFromCount: segment.coalescedFromSegmentIds.length,
      coalescedFromSegmentIds: segment.coalescedFromSegmentIds,
    },
    dimoSegmentId: segment.coalescedSegmentId,
    fuelLevelRiseStart:
      segment.mechanism === 'refuel'
        ? (refuelObservation?.fuelLevelRiseStart ?? null)
        : null,
    fuelLevelRiseEnd:
      segment.mechanism === 'refuel'
        ? (refuelObservation?.fuelLevelRiseEnd ?? null)
        : null,
    fuelLevelRiseDurationSeconds:
      segment.mechanism === 'refuel'
        ? (refuelObservation?.fuelLevelRiseDurationSeconds ?? null)
        : null,
  };
}

export function collectReplaceableSubSegmentIds(
  coalesced: CoalescedEnergySegment[],
  mechanismOutcomes: Array<{ mechanism: string; status: string }>,
): Set<string> {
  const replaced = new Set<string>();
  if (mechanismOutcomes.some((outcome) => outcome.status === 'FAILED')) {
    return replaced;
  }

  for (const group of coalesced) {
    const outcome = mechanismOutcomes.find(
      (entry) => entry.mechanism === group.mechanism,
    );
    if (!outcome || outcome.status !== 'SUCCESS_WITH_EVENTS') continue;
    if (group.coalescedFromSegmentIds.length <= 1) continue;

    for (const subSegmentId of group.coalescedFromSegmentIds) {
      if (subSegmentId !== group.coalescedSegmentId) {
        replaced.add(subSegmentId);
      }
    }
  }
  return replaced;
}

export interface StaleSubsegmentPruneAuthorization {
  canonicalParentDimoSegmentId: string;
  staleSubsegmentIds: string[];
  coalescedParent: CoalescedEnergySegment;
}

export type MaterializedEnergyEventRow = Parameters<typeof isMateriallyIdentical>[0];

export function resolveStaleSubsegmentPruneAuthorization(
  coalesced: CoalescedEnergySegment[],
  mechanismOutcomes: Array<{ mechanism: string; status: string }>,
): StaleSubsegmentPruneAuthorization | null {
  if (mechanismOutcomes.some((outcome) => outcome.status === 'FAILED')) {
    return null;
  }

  const staleSubsegmentIds = collectReplaceableSubSegmentIds(
    coalesced,
    mechanismOutcomes,
  );
  if (staleSubsegmentIds.size === 0) {
    return null;
  }

  const coalescedParent = coalesced.find(
    (group) =>
      group.coalescedFromSegmentIds.length > 1 &&
      [...staleSubsegmentIds].every((subSegmentId) =>
        group.coalescedFromSegmentIds.includes(subSegmentId),
      ),
  );
  if (!coalescedParent) {
    return null;
  }

  return {
    canonicalParentDimoSegmentId: coalescedParent.coalescedSegmentId,
    staleSubsegmentIds: [...staleSubsegmentIds],
    coalescedParent,
  };
}

export interface PruneStaleCoalescedSubSegmentsInput {
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
  coalesced: CoalescedEnergySegment[];
  mechanismOutcomes: Array<{ mechanism: string; status: string }>;
  findEnergyEventByDimoSegmentId: (
    dimoSegmentId: string,
  ) => Promise<MaterializedEnergyEventRow | null>;
  findStaleCandidates: (
    staleSubsegmentIds: string[],
  ) => Promise<Array<{ id: string; dimoSegmentId: string }>>;
  deleteEnergyEventsByIds: (ids: string[]) => Promise<number>;
}

export async function pruneStaleCoalescedSubSegments(
  input: PruneStaleCoalescedSubSegmentsInput,
): Promise<{ prunedCount: number; authorization: StaleSubsegmentPruneAuthorization | null }> {
  const authorization = resolveStaleSubsegmentPruneAuthorization(
    input.coalesced,
    input.mechanismOutcomes,
  );
  if (!authorization) {
    return { prunedCount: 0, authorization: null };
  }

  const parentPayload = buildUpsertPayload(
    input.vehicleId,
    authorization.coalescedParent,
  );
  const parentExisting = await input.findEnergyEventByDimoSegmentId(
    authorization.canonicalParentDimoSegmentId,
  );
  if (!parentExisting || !isMateriallyIdentical(parentExisting, parentPayload)) {
    return { prunedCount: 0, authorization };
  }

  const candidates = await input.findStaleCandidates(authorization.staleSubsegmentIds);
  if (candidates.length === 0) {
    return { prunedCount: 0, authorization };
  }

  const prunedCount = await input.deleteEnergyEventsByIds(
    candidates.map((candidate) => candidate.id),
  );
  return { prunedCount, authorization };
}

/**
 * Canonical precision for persisted telemetry measurements.
 *
 * The database driver serializes doubles with at most 16 significant decimal
 * digits, so a measurement that needs 17 digits is stored as a neighbouring
 * double (proven read-only by `scripts/ops/energy-events-storage-precision-probe.ts`:
 * `SELECT $1::float8::text` returns `2.239999949932098` for input
 * `2.2399999499320984`). Comparing stored against freshly detected values
 * bitwise therefore never converges, which kept semantically identical events
 * permanently classified as UPDATE and re-written on every detection run.
 *
 * 15 significant digits sits below the driver's precision while remaining many
 * orders of magnitude finer than any SOC, energy, fuel, odometer or GPS
 * resolution, so genuine measurement changes still compare as different.
 */
export const CANONICAL_MEASUREMENT_PRECISION_DIGITS = 15;

export function roundToCanonicalMeasurementPrecision(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  return Number(value.toPrecision(CANONICAL_MEASUREMENT_PRECISION_DIGITS));
}

/** Storage-precision equality for a nullable telemetry measurement. */
export function canonicalMeasurementEquals(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  const leftValue = left ?? null;
  const rightValue = right ?? null;
  if (leftValue === null || rightValue === null) {
    return leftValue === rightValue;
  }
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return leftValue === rightValue;
  }
  return (
    roundToCanonicalMeasurementPrecision(leftValue) ===
    roundToCanonicalMeasurementPrecision(rightValue)
  );
}

export function isMateriallyIdentical(
  existing: {
    kind: string;
    detectionMechanism?: string | null;
    startTime: Date;
    endTime: Date;
    durationSeconds?: number | null;
    fuelLevelRiseStart?: Date | null;
    fuelLevelRiseEnd?: Date | null;
    fuelLevelRiseDurationSeconds?: number | null;
    startLatitude?: number | null;
    startLongitude?: number | null;
    endLatitude?: number | null;
    endLongitude?: number | null;
    fuelDeltaLiters: number | null;
    fuelDeltaPercent: number | null;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    odometerStartKm?: number | null;
    odometerEndKm?: number | null;
    confidence: string;
    rawDetectionMeta?: unknown;
  },
  payload: EnergyEventUpsertPayload,
): boolean {
  const sameTime =
    existing.startTime.getTime() === payload.startTime.getTime() &&
    existing.endTime.getTime() === payload.endTime.getTime();
  const sameKind = existing.kind === payload.kind;
  const sameMechanism =
    (existing.detectionMechanism ?? payload.detectionMechanism) ===
    payload.detectionMechanism;
  const sameDuration =
    (existing.durationSeconds ?? payload.durationSeconds) === payload.durationSeconds;
  const sameFuelRise =
    (existing.fuelLevelRiseStart?.getTime() ?? null) ===
      (payload.fuelLevelRiseStart?.getTime() ?? null) &&
    (existing.fuelLevelRiseEnd?.getTime() ?? null) ===
      (payload.fuelLevelRiseEnd?.getTime() ?? null) &&
    (existing.fuelLevelRiseDurationSeconds ?? null) ===
      (payload.fuelLevelRiseDurationSeconds ?? null);
  const sameCoords =
    canonicalMeasurementEquals(existing.startLatitude, payload.startLatitude) &&
    canonicalMeasurementEquals(existing.startLongitude, payload.startLongitude) &&
    canonicalMeasurementEquals(existing.endLatitude, payload.endLatitude) &&
    canonicalMeasurementEquals(existing.endLongitude, payload.endLongitude);
  const sameFuel =
    canonicalMeasurementEquals(existing.fuelDeltaLiters, payload.fuelDeltaLiters) &&
    canonicalMeasurementEquals(existing.fuelDeltaPercent, payload.fuelDeltaPercent);
  const sameSoc =
    canonicalMeasurementEquals(existing.socDeltaPercent, payload.socDeltaPercent) &&
    canonicalMeasurementEquals(existing.energyDeltaKwh, payload.energyDeltaKwh);
  const sameOdometer =
    canonicalMeasurementEquals(existing.odometerStartKm, payload.odometerStartKm) &&
    canonicalMeasurementEquals(existing.odometerEndKm, payload.odometerEndKm);
  const sameConfidence = existing.confidence === payload.confidence;
  const sameMeta = normalizedRawDetectionMetaEquals(
    existing.rawDetectionMeta,
    payload.rawDetectionMeta,
  );
  return (
    sameTime &&
    sameKind &&
    sameMechanism &&
    sameDuration &&
    sameFuelRise &&
    sameCoords &&
    sameFuel &&
    sameSoc &&
    sameOdometer &&
    sameConfidence &&
    sameMeta
  );
}

function normalizedRawDetectionMetaEquals(
  left: unknown,
  right: Record<string, unknown>,
): boolean {
  return (
    JSON.stringify(normalizeRawDetectionMeta(left)) ===
    JSON.stringify(normalizeRawDetectionMeta(right))
  );
}

/**
 * Comparison-only canonical form of `rawDetectionMeta`. `jsonb` does not
 * preserve key order and stored measurements carry only storage precision, so
 * keys are sorted and numbers are reduced to canonical precision. Array order
 * stays significant: the coalescer emits constituent ids in a deterministic
 * order, so a reordering is a real provenance change.
 */
export function normalizeRawDetectionMeta(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return canonicalizeMetaValue(value) as Record<string, unknown>;
}

function canonicalizeMetaValue(value: unknown): unknown {
  if (typeof value === 'number') {
    return roundToCanonicalMeasurementPrecision(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeMetaValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      normalized[key] = canonicalizeMetaValue(entryValue);
    }
    return normalized;
  }
  return value;
}

function haversineMeters(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
): number | null {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
