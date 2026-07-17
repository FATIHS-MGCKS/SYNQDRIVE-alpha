import { createHash } from 'crypto';
import {
  BrakingEventCanonicalType,
  BrakingEventPrimarySource,
  BehaviorEventClassification,
  DrivingEventType,
} from '@prisma/client';

export const BRAKING_EVENT_LEDGER_SCHEMA_VERSION =
  '20260717200000_braking_event_ledger';

export const BRAKING_EVENT_LEDGER_SOURCE_VERSION = 'braking-ledger-v1';

/** Aligns with unified behavior read-model incident buckets. */
export const DEFAULT_BRAKING_DEDUPE_WINDOW_MS = 2_000;

export const HIGH_SPEED_BRAKING_THRESHOLD_KMH = 80;

/** Source priority for dedupe winner selection (lower = higher priority). */
export const BRAKING_SOURCE_PRIORITY: Record<BrakingEventPrimarySource, number> = {
  [BrakingEventPrimarySource.DIMO_PROVIDER]: 1,
  [BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING]: 2,
  [BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE]: 3,
  [BrakingEventPrimarySource.DERIVED_DECELERATION]: 4,
  [BrakingEventPrimarySource.TRIP_AGGREGATION]: 5,
};

/** Canonical severity rank for merge winner within the same incident bucket. */
export const CANONICAL_TYPE_RANK: Record<BrakingEventCanonicalType, number> = {
  [BrakingEventCanonicalType.UNKNOWN_BRAKING_EVENT]: 0,
  [BrakingEventCanonicalType.MODERATE_BRAKING]: 1,
  [BrakingEventCanonicalType.HARSH_BRAKING]: 2,
  [BrakingEventCanonicalType.HIGH_SPEED_BRAKING]: 3,
  [BrakingEventCanonicalType.EXTREME_BRAKING]: 4,
  [BrakingEventCanonicalType.FULL_BRAKING]: 5,
  [BrakingEventCanonicalType.ABS_INTERVENTION]: 6,
};

export type CorrelatedSourceRef = {
  kind: 'DRIVING_EVENT' | 'TRIP_BEHAVIOR_EVENT' | 'DIMO_BRAKING_INTAKE';
  id: string;
};

export interface BrakingEventCandidate {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  occurredAt: Date;
  canonicalType: BrakingEventCanonicalType;
  severity: number;
  primarySource: BrakingEventPrimarySource;
  providerEventId: string | null;
  confidence: number;
  peakDecelerationMs2: number | null;
  startSpeedKmh: number | null;
  correlatedSourceIds: CorrelatedSourceRef[];
  dedupeWindowMs?: number;
}

export interface BrakingEventLedgerIncident {
  incidentKey: string;
  sourceFingerprint: string;
  winner: BrakingEventCandidate;
  correlated: BrakingEventCandidate[];
}

export interface BrakingEventCanonicalTripSummary {
  tripId: string | null;
  vehicleId: string;
  organizationId: string;
  totalCanonicalEvents: number;
  moderateBraking: number;
  harshBraking: number;
  extremeBraking: number;
  fullBraking: number;
  highSpeedBraking: number;
  absIntervention: number;
  unknownBraking: number;
  /** Harsh + extreme after dedupe — used for hardBrakePer100Km (extreme not double-counted as harsh+extreme row). */
  hardBrakeCount: number;
  fullBrakingCount: number;
  extremeBrakeCount: number;
  totalBrakingEvents: number;
  brakingEventRows: Array<{
    startSpeedKmh: number | null;
    endSpeedKmh: number | null;
    peakValue: number | null;
    canonicalType: BrakingEventCanonicalType;
  }>;
}

export function incidentBucketMs(
  occurredAt: Date,
  dedupeWindowMs: number = DEFAULT_BRAKING_DEDUPE_WINDOW_MS,
): number {
  return Math.floor(occurredAt.getTime() / dedupeWindowMs) * dedupeWindowMs;
}

/** Physical-incident family — collapses provider/HF/derived duplicates, not distant events. */
export function brakingIncidentKey(input: {
  vehicleId: string;
  tripId: string | null;
  occurredAt: Date;
  dedupeWindowMs?: number;
}): string {
  const windowMs = input.dedupeWindowMs ?? DEFAULT_BRAKING_DEDUPE_WINDOW_MS;
  const bucket = incidentBucketMs(input.occurredAt, windowMs);
  const tripScope = input.tripId ?? 'no-trip';
  return `${input.vehicleId}|${tripScope}|${bucket}`;
}

export function buildBrakingLedgerSourceFingerprint(input: {
  organizationId: string;
  incidentKey: string;
  ledgerVersion?: string;
}): string {
  const payload = [
    input.organizationId,
    input.incidentKey,
    input.ledgerVersion ?? BRAKING_EVENT_LEDGER_SOURCE_VERSION,
  ].join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function mapDrivingEventToCandidate(input: {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string | null;
  eventType: DrivingEventType;
  recordedAt: Date;
  severity: number;
  speedKmh: number | null;
  metadataJson: Record<string, unknown> | null;
}): BrakingEventCandidate | null {
  if (!input.organizationId) return null;

  const metadata = input.metadataJson ?? {};
  const providerEventId =
    typeof metadata.providerEventId === 'string' ? metadata.providerEventId : null;
  const classification =
    typeof metadata.classification === 'string'
      ? metadata.classification.toUpperCase()
      : null;

  let canonicalType: BrakingEventCanonicalType;
  switch (input.eventType) {
    case DrivingEventType.HARSH_BRAKING:
      canonicalType =
        classification === 'EXTREME'
          ? BrakingEventCanonicalType.EXTREME_BRAKING
          : BrakingEventCanonicalType.HARSH_BRAKING;
      break;
    case DrivingEventType.EXTREME_BRAKING:
      canonicalType = BrakingEventCanonicalType.EXTREME_BRAKING;
      break;
    default:
      return null;
  }

  canonicalType = applyHighSpeedCanonicalType(canonicalType, input.speedKmh);

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    occurredAt: input.recordedAt,
    canonicalType,
    severity: input.severity,
    primarySource: BrakingEventPrimarySource.DIMO_PROVIDER,
    providerEventId,
    confidence: 0.95,
    peakDecelerationMs2: peakFromSeverity(canonicalType, input.severity),
    startSpeedKmh: input.speedKmh,
    correlatedSourceIds: [{ kind: 'DRIVING_EVENT', id: input.id }],
  };
}

export function mapTripBehaviorEventToCandidate(input: {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: string;
  eventType: string;
  classification: string;
  startedAt: Date;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  confidence: number | null;
}): BrakingEventCandidate | null {
  if (!input.organizationId) return null;

  const isBrakingCategory = input.eventCategory === 'BRAKING';
  const isFullBrakingAbuse =
    input.eventCategory === 'ABUSE' && input.eventType === 'FULL_BRAKING';

  if (!isBrakingCategory && !isFullBrakingAbuse) return null;

  let canonicalType: BrakingEventCanonicalType;
  let primarySource: BrakingEventPrimarySource;
  let severity: number;

  if (isFullBrakingAbuse) {
    canonicalType = BrakingEventCanonicalType.FULL_BRAKING;
    primarySource = BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE;
    severity = 0.95;
  } else {
    primarySource = BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING;
    switch (input.classification) {
      case BehaviorEventClassification.EXTREME:
        canonicalType = BrakingEventCanonicalType.EXTREME_BRAKING;
        severity = 0.9;
        break;
      case BehaviorEventClassification.HARD:
        canonicalType = BrakingEventCanonicalType.HARSH_BRAKING;
        severity = 0.6;
        break;
      case BehaviorEventClassification.MODERATE:
        canonicalType = BrakingEventCanonicalType.MODERATE_BRAKING;
        severity = 0.4;
        break;
      case BehaviorEventClassification.LIGHT:
        return null;
      default:
        canonicalType = BrakingEventCanonicalType.UNKNOWN_BRAKING_EVENT;
        severity = 0.3;
    }
  }

  canonicalType = applyHighSpeedCanonicalType(canonicalType, input.startSpeedKmh);

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    occurredAt: input.startedAt,
    canonicalType,
    severity,
    primarySource,
    providerEventId: null,
    confidence: input.confidence ?? 0.75,
    peakDecelerationMs2: input.peakValue,
    startSpeedKmh: input.startSpeedKmh,
    correlatedSourceIds: [{ kind: 'TRIP_BEHAVIOR_EVENT', id: input.id }],
  };
}

export function mapDimoIntakeToCandidate(input: {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  eventType: DrivingEventType;
  eventTimestamp: Date;
  severity: number;
  providerEventId: string;
}): BrakingEventCandidate | null {
  let canonicalType: BrakingEventCanonicalType;
  switch (input.eventType) {
    case DrivingEventType.HARSH_BRAKING:
      canonicalType = BrakingEventCanonicalType.HARSH_BRAKING;
      break;
    case DrivingEventType.EXTREME_BRAKING:
      canonicalType = BrakingEventCanonicalType.EXTREME_BRAKING;
      break;
    default:
      return null;
  }

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    occurredAt: input.eventTimestamp,
    canonicalType,
    severity: input.severity,
    primarySource: BrakingEventPrimarySource.DIMO_PROVIDER,
    providerEventId: input.providerEventId,
    confidence: 0.98,
    peakDecelerationMs2: peakFromSeverity(canonicalType, input.severity),
    startSpeedKmh: null,
    correlatedSourceIds: [{ kind: 'DIMO_BRAKING_INTAKE', id: input.id }],
  };
}

function applyHighSpeedCanonicalType(
  base: BrakingEventCanonicalType,
  startSpeedKmh: number | null,
): BrakingEventCanonicalType {
  if (startSpeedKmh == null || startSpeedKmh < HIGH_SPEED_BRAKING_THRESHOLD_KMH) {
    return base;
  }
  if (
    base === BrakingEventCanonicalType.MODERATE_BRAKING ||
    base === BrakingEventCanonicalType.HARSH_BRAKING
  ) {
    return BrakingEventCanonicalType.HIGH_SPEED_BRAKING;
  }
  return base;
}

function peakFromSeverity(
  canonicalType: BrakingEventCanonicalType,
  severity: number,
): number {
  switch (canonicalType) {
    case BrakingEventCanonicalType.FULL_BRAKING:
      return 7.8;
    case BrakingEventCanonicalType.EXTREME_BRAKING:
      return Math.min(12, 7.0 + severity * 4);
    case BrakingEventCanonicalType.HARSH_BRAKING:
    case BrakingEventCanonicalType.HIGH_SPEED_BRAKING:
      return Math.min(9, 4.5 + severity * 5);
    case BrakingEventCanonicalType.MODERATE_BRAKING:
      return Math.min(6, 2.8 + severity * 3);
    default:
      return severity > 0 ? severity * 5 : 2.0;
  }
}

export function mergeCorrelatedSources(
  candidates: BrakingEventCandidate[],
): CorrelatedSourceRef[] {
  const seen = new Set<string>();
  const merged: CorrelatedSourceRef[] = [];
  for (const candidate of candidates) {
    for (const ref of candidate.correlatedSourceIds) {
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(ref);
    }
  }
  return merged;
}

export function pickIncidentWinner(
  candidates: BrakingEventCandidate[],
): BrakingEventCandidate {
  const sorted = [...candidates].sort((a, b) => {
    const sourceDiff =
      BRAKING_SOURCE_PRIORITY[a.primarySource] - BRAKING_SOURCE_PRIORITY[b.primarySource];
    if (sourceDiff !== 0) return sourceDiff;

    const typeDiff = CANONICAL_TYPE_RANK[b.canonicalType] - CANONICAL_TYPE_RANK[a.canonicalType];
    if (typeDiff !== 0) return typeDiff;

    const peakA = a.peakDecelerationMs2 ?? 0;
    const peakB = b.peakDecelerationMs2 ?? 0;
    if (peakB !== peakA) return peakB - peakA;

    return b.confidence - a.confidence;
  });

  const winner = sorted[0];
  const mergedSources = mergeCorrelatedSources(candidates);
  const providerEventId =
    candidates.find((c) => c.providerEventId)?.providerEventId ?? winner.providerEventId;

  const peakDecelerationMs2 = Math.max(
    ...candidates.map((c) => c.peakDecelerationMs2 ?? 0),
  );
  const startSpeedKmh = Math.max(
    ...candidates.map((c) => c.startSpeedKmh ?? 0),
  );

  return {
    ...winner,
    providerEventId,
    peakDecelerationMs2: peakDecelerationMs2 > 0 ? peakDecelerationMs2 : winner.peakDecelerationMs2,
    startSpeedKmh: startSpeedKmh > 0 ? startSpeedKmh : winner.startSpeedKmh,
    correlatedSourceIds: mergedSources,
    canonicalType: sorted.reduce(
      (best, c) =>
        CANONICAL_TYPE_RANK[c.canonicalType] > CANONICAL_TYPE_RANK[best]
          ? c.canonicalType
          : best,
      winner.canonicalType,
    ),
    severity: Math.max(...candidates.map((c) => c.severity)),
    confidence: Math.max(...candidates.map((c) => c.confidence)),
  };
}

export function correlateBrakingCandidates(
  candidates: BrakingEventCandidate[],
  dedupeWindowMs: number = DEFAULT_BRAKING_DEDUPE_WINDOW_MS,
): BrakingEventLedgerIncident[] {
  const groups = new Map<string, BrakingEventCandidate[]>();

  for (const candidate of candidates) {
    const key = brakingIncidentKey({
      vehicleId: candidate.vehicleId,
      tripId: candidate.tripId,
      occurredAt: candidate.occurredAt,
      dedupeWindowMs,
    });
    const bucket = groups.get(key) ?? [];
    bucket.push({ ...candidate, dedupeWindowMs });
    groups.set(key, bucket);
  }

  const incidents: BrakingEventLedgerIncident[] = [];
  for (const [incidentKey, group] of groups) {
    const winner = pickIncidentWinner(group);
    const sourceFingerprint = buildBrakingLedgerSourceFingerprint({
      organizationId: winner.organizationId,
      incidentKey,
    });
    incidents.push({
      incidentKey,
      sourceFingerprint,
      winner,
      correlated: group,
    });
  }

  return incidents.sort(
    (a, b) => a.winner.occurredAt.getTime() - b.winner.occurredAt.getTime(),
  );
}

export function summarizeCanonicalBrakingIncidents(
  incidents: BrakingEventLedgerIncident[],
): BrakingEventCanonicalTripSummary {
  if (incidents.length === 0) {
    return {
      tripId: null,
      vehicleId: '',
      organizationId: '',
      totalCanonicalEvents: 0,
      moderateBraking: 0,
      harshBraking: 0,
      extremeBraking: 0,
      fullBraking: 0,
      highSpeedBraking: 0,
      absIntervention: 0,
      unknownBraking: 0,
      hardBrakeCount: 0,
      fullBrakingCount: 0,
      extremeBrakeCount: 0,
      totalBrakingEvents: 0,
      brakingEventRows: [],
    };
  }

  const first = incidents[0].winner;
  const counts = {
    moderateBraking: 0,
    harshBraking: 0,
    extremeBraking: 0,
    fullBraking: 0,
    highSpeedBraking: 0,
    absIntervention: 0,
    unknownBraking: 0,
  };

  const brakingEventRows: BrakingEventCanonicalTripSummary['brakingEventRows'] = [];

  for (const incident of incidents) {
    const w = incident.winner;
    switch (w.canonicalType) {
      case BrakingEventCanonicalType.MODERATE_BRAKING:
        counts.moderateBraking += 1;
        break;
      case BrakingEventCanonicalType.HARSH_BRAKING:
        counts.harshBraking += 1;
        break;
      case BrakingEventCanonicalType.EXTREME_BRAKING:
        counts.extremeBraking += 1;
        break;
      case BrakingEventCanonicalType.FULL_BRAKING:
        counts.fullBraking += 1;
        break;
      case BrakingEventCanonicalType.HIGH_SPEED_BRAKING:
        counts.highSpeedBraking += 1;
        break;
      case BrakingEventCanonicalType.ABS_INTERVENTION:
        counts.absIntervention += 1;
        break;
      default:
        counts.unknownBraking += 1;
    }

    const start = w.startSpeedKmh;
    let end: number | null = null;
    if (start != null && w.peakDecelerationMs2 != null && w.peakDecelerationMs2 > 0) {
      const deltaKmh = (w.peakDecelerationMs2 / 3.6) * 1.0;
      end = Math.max(0, start - deltaKmh);
    } else if (start != null && start > 5) {
      end = Math.max(0, start * 0.72);
    }

    brakingEventRows.push({
      startSpeedKmh: start,
      endSpeedKmh: end,
      peakValue: w.peakDecelerationMs2,
      canonicalType: w.canonicalType,
    });
  }

  const hardBrakeCount =
    counts.harshBraking +
    counts.highSpeedBraking +
    counts.extremeBraking +
    counts.fullBraking;
  const extremeBrakeCount = counts.extremeBraking;
  const fullBrakingCount = counts.fullBraking;
  const totalBrakingEvents =
    counts.moderateBraking +
    counts.harshBraking +
    counts.extremeBraking +
    counts.fullBraking +
    counts.highSpeedBraking +
    counts.absIntervention +
    counts.unknownBraking;

  return {
    tripId: first.tripId,
    vehicleId: first.vehicleId,
    organizationId: first.organizationId,
    totalCanonicalEvents: incidents.length,
    ...counts,
    hardBrakeCount,
    fullBrakingCount,
    extremeBrakeCount,
    totalBrakingEvents,
    brakingEventRows,
  };
}

/**
 * Wear model note (Prompt 15):
 * `harshBrakeWearMultiplier()` in brake-status.ts is NOT applied in recalculate().
 * Active path uses `lookupSteppedFactor(hardBrakePer100Km, padHardBrakeAnchors)` and
 * `discHardBrakeAnchors` in brake-health.service.ts — a separate stepped model on the
 * same canonical hard-brake rate. Do not stack harshBrakeWearMultiplier on top.
 */
export const HARSH_BRAKE_WEAR_MULTIPLIER_STATUS = {
  function: 'harshBrakeWearMultiplier',
  module: 'brake-status.ts',
  appliedInRecalculate: false,
  activeWearFormula:
    'lookupSteppedFactor(hardBrakePer100Km, padHardBrakeAnchors|discHardBrakeAnchors)',
  activeModule: 'brake-health.service.ts',
} as const;
