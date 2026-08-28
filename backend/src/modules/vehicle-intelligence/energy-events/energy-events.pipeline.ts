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

export function isMateriallyIdentical(
  existing: {
    startTime: Date;
    endTime: Date;
    kind: string;
    fuelDeltaLiters: number | null;
    fuelDeltaPercent: number | null;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    confidence: string;
  },
  payload: EnergyEventUpsertPayload,
): boolean {
  const sameTime =
    existing.startTime.getTime() === payload.startTime.getTime() &&
    existing.endTime.getTime() === payload.endTime.getTime();
  const sameKind = existing.kind === payload.kind;
  const sameFuel =
    (existing.fuelDeltaLiters ?? null) === (payload.fuelDeltaLiters ?? null) &&
    (existing.fuelDeltaPercent ?? null) === (payload.fuelDeltaPercent ?? null);
  const sameSoc =
    (existing.socDeltaPercent ?? null) === (payload.socDeltaPercent ?? null) &&
    (existing.energyDeltaKwh ?? null) === (payload.energyDeltaKwh ?? null);
  const sameConfidence = existing.confidence === payload.confidence;
  return sameTime && sameKind && sameFuel && sameSoc && sameConfidence;
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
