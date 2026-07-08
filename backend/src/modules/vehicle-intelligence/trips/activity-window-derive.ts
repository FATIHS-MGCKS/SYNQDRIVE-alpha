import type { IgnitionSegmentFinding } from './detectors/ignition-segment.detector';
import type { MotionSegmentFinding } from './detectors/motion-segment.detector';
import type {
  ActivityEvidenceSource,
  ActivityWindowConfidence,
  ActivityWindowType,
  TripActivityWindowRow,
} from '@modules/clickhouse/clickhouse-activity-windows.types';

export interface SnapshotSample {
  recordedAt: Date;
  speedKmh: number | null;
  isIgnitionOn: boolean | null;
  odometerKm: number | null;
}

type ActivityClass = 'moving' | 'idle' | 'parked';

const MOVING_SPEED_THRESHOLD_KMH = 2;
const MIN_STATE_WINDOW_MS = 60_000;

function mapSegmentConfidence(
  confidence: 'LOW' | 'MEDIUM' | 'HIGH',
): ActivityWindowConfidence {
  return confidence;
}

function baseRow(input: {
  orgId: string;
  vehicleId: string;
  tripId: string;
  bookingId?: string | null;
  activityType: ActivityWindowType;
  windowStart: Date;
  windowEnd: Date;
  pointCount: number;
  maxSpeedKmh?: number | null;
  odometerDeltaKm?: number | null;
  hasActivity: boolean;
  confidence: ActivityWindowConfidence;
  evidenceSource: ActivityEvidenceSource;
}): TripActivityWindowRow {
  return {
    orgId: input.orgId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    bookingId: input.bookingId ?? null,
    activityType: input.activityType,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    pointCount: input.pointCount,
    maxSpeedKmh: input.maxSpeedKmh ?? null,
    odometerDeltaKm: input.odometerDeltaKm ?? null,
    hasActivity: input.hasActivity,
    confidence: input.confidence,
    evidenceSource: input.evidenceSource,
  };
}

export function buildIgnitionActivityWindows(
  ctx: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    bookingId?: string | null;
  },
  segments: IgnitionSegmentFinding[],
): TripActivityWindowRow[] {
  return segments.map((seg) =>
    baseRow({
      ...ctx,
      activityType: 'ignition_on',
      windowStart: seg.segmentStart,
      windowEnd: seg.segmentEnd,
      pointCount: 0,
      hasActivity: true,
      confidence: mapSegmentConfidence(seg.confidence),
      evidenceSource: 'telemetry_state_changes',
    }),
  );
}

export function buildMovingActivityWindows(
  ctx: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    bookingId?: string | null;
  },
  segments: MotionSegmentFinding[],
): TripActivityWindowRow[] {
  return segments.map((seg) =>
    baseRow({
      ...ctx,
      activityType: 'moving',
      windowStart: seg.segmentStart,
      windowEnd: seg.segmentEnd,
      pointCount: 0,
      hasActivity: true,
      confidence: mapSegmentConfidence(seg.confidence),
      evidenceSource: 'telemetry_state_changes',
    }),
  );
}

export function buildTripSummaryWindow(
  ctx: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    bookingId?: string | null;
    windowStart: Date;
    windowEnd: Date;
  },
  summary: {
    pointCount: number;
    maxSpeedKmh: number;
    odometerDeltaKm: number;
  },
): TripActivityWindowRow {
  const hasActivity =
    summary.maxSpeedKmh > MOVING_SPEED_THRESHOLD_KMH ||
    summary.odometerDeltaKm > 0.05;
  return baseRow({
    ...ctx,
    activityType: 'trip_summary',
    pointCount: summary.pointCount,
    maxSpeedKmh: summary.maxSpeedKmh,
    odometerDeltaKm: summary.odometerDeltaKm,
    hasActivity,
    confidence:
      hasActivity && summary.pointCount >= 5
        ? 'HIGH'
        : hasActivity
          ? 'MEDIUM'
          : 'LOW',
    evidenceSource: 'telemetry_snapshots',
  });
}

function classifySnapshot(sample: SnapshotSample): ActivityClass {
  const speed = sample.speedKmh ?? 0;
  if (speed > MOVING_SPEED_THRESHOLD_KMH) return 'moving';
  if (sample.isIgnitionOn === true) return 'idle';
  return 'parked';
}

/** Derive idle/parked windows from ~30s snapshot cadence inside a trip window. */
export function deriveIdleParkedWindows(
  ctx: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    bookingId?: string | null;
  },
  samples: SnapshotSample[],
  minDurationMs = MIN_STATE_WINDOW_MS,
): TripActivityWindowRow[] {
  if (samples.length === 0) return [];

  const sorted = [...samples].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  const windows: TripActivityWindowRow[] = [];
  let runStart = 0;

  const flushRun = (runEnd: number) => {
    const startSample = sorted[runStart];
    const endSample = sorted[runEnd];
    const activityType = classifySnapshot(startSample);
    if (activityType === 'moving') {
      return;
    }

    const durationMs =
      endSample.recordedAt.getTime() - startSample.recordedAt.getTime();
    if (durationMs < minDurationMs) return;

    const slice = sorted.slice(runStart, runEnd + 1);
    const speeds = slice
      .map((s) => s.speedKmh)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const odometers = slice
      .map((s) => s.odometerKm)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const odometerDeltaKm =
      odometers.length >= 2
        ? Math.max(0, odometers[odometers.length - 1] - odometers[0])
        : 0;

    windows.push(
      baseRow({
        ...ctx,
        activityType,
        windowStart: startSample.recordedAt,
        windowEnd: endSample.recordedAt,
        pointCount: slice.length,
        maxSpeedKmh: speeds.length > 0 ? Math.max(...speeds) : 0,
        odometerDeltaKm,
        hasActivity: activityType === 'idle',
        confidence: slice.length >= 3 ? 'MEDIUM' : 'LOW',
        evidenceSource: 'telemetry_snapshots',
      }),
    );
  };

  for (let i = 1; i < sorted.length; i++) {
    if (classifySnapshot(sorted[i]) !== classifySnapshot(sorted[runStart])) {
      flushRun(i - 1);
      runStart = i;
    }
  }
  flushRun(sorted.length - 1);

  return windows;
}

export function dedupeActivityWindows(
  windows: TripActivityWindowRow[],
): TripActivityWindowRow[] {
  const seen = new Set<string>();
  const out: TripActivityWindowRow[] = [];
  for (const w of windows) {
    const key = [
      w.activityType,
      w.windowStart.toISOString(),
      w.windowEnd.toISOString(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
