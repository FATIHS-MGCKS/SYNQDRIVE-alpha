/**
 * G1.2 pure coordinate selector — derives physical refuel stop from telemetry only.
 * No station identity, OSM candidates, or resolver output in inputs.
 *
 * Policy: physical_refuel_forecourt_dwell_medoid_v2
 */

export const PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2 =
  'physical_refuel_forecourt_dwell_medoid_v2';

export const PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION = 'g1.2b-v1';

export type PhysicalRefuelCoordinateStatus =
  | 'SELECTED'
  | 'NO_DWELL_FOUND'
  | 'AMBIGUOUS'
  | 'INSUFFICIENT_EVIDENCE';

export interface RouteGpsSample {
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh?: number | null;
}

export interface PhysicalRefuelCoordinateInput {
  routeSamples: RouteGpsSample[];
  /** Detector- or provider-derived fuel-rise onset (ISO UTC). */
  fuelRiseOnsetAt: string;
  /** Optional provider segment start — provenance/diagnostics only; NOT a lookback cutoff (G1.2b). */
  eventStartAt?: string | null;
  policyVersion?: string;
}

export interface PhysicalRefuelCoordinateProvenance {
  policyVersion: string;
  source: 'route_gps_speed_joint';
  sampleCount: number;
  clusterStart: string;
  clusterEnd: string;
  distanceSpreadMeters: number;
  speedStatistics: {
    min: number | null;
    max: number | null;
    median: number | null;
  };
  temporalOffsetToRiseSec: number;
  candidateCount: number;
  rejectionReasons: string[];
  selectedClusterRank: number;
  /** Provider segment start when supplied — diagnostic only, does not bound lookback. */
  eventStartAtMs?: number | null;
  lookbackStartMs: number;
}

export interface PhysicalRefuelCoordinateResult {
  status: PhysicalRefuelCoordinateStatus;
  coordinate?: { latitude: number; longitude: number };
  provenance: PhysicalRefuelCoordinateProvenance;
}

export interface PhysicalRefuelCoordinateSelectorConfig {
  speedThresholdKmh: number;
  minClusterPoints: number;
  maxGapSec: number;
  lookbackMaxSec: number;
  maxClusterEndToRiseSec: number;
  maxSpatialSpreadMeters: number;
  ambiguityMarginSec: number;
}

export const DEFAULT_PHYSICAL_REFUEL_COORDINATE_SELECTOR_CONFIG: PhysicalRefuelCoordinateSelectorConfig =
  {
    /** G1.1 incident: forecourt creep observed at 6.5–9.75 km/h before 0 km/h dwell. */
    speedThresholdKmh: 10,
    minClusterPoints: 2,
    maxGapSec: 30,
    lookbackMaxSec: 30 * 60,
    maxClusterEndToRiseSec: 15 * 60,
    maxSpatialSpreadMeters: 80,
    ambiguityMarginSec: 30,
  };

interface ClusterPoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
}

interface RankedCluster {
  points: ClusterPoint[];
  startAt: string;
  endAt: string;
  endMs: number;
  temporalOffsetToRiseSec: number;
  spreadMeters: number;
  medoid: { latitude: number; longitude: number };
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medoid(points: ClusterPoint[]): { latitude: number; longitude: number } {
  let best = points[0];
  let bestSum = Infinity;
  for (const p of points) {
    let sum = 0;
    for (const q of points) {
      sum += haversineMeters(p.latitude, p.longitude, q.latitude, q.longitude);
    }
    if (sum < bestSum) {
      bestSum = sum;
      best = p;
    }
  }
  return { latitude: best.latitude, longitude: best.longitude };
}

function clusterSpreadMeters(points: ClusterPoint[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      max = Math.max(
        max,
        haversineMeters(
          points[i].latitude,
          points[i].longitude,
          points[j].latitude,
          points[j].longitude,
        ),
      );
    }
  }
  return max;
}

function effectiveSpeedKmh(
  sample: RouteGpsSample,
  previous: RouteGpsSample | null,
  threshold: number,
): number | null {
  if (sample.speedKmh != null) return sample.speedKmh;
  if (
    previous?.latitude != null &&
    previous?.longitude != null &&
    sample.latitude != null &&
    sample.longitude != null &&
    previous.speedKmh != null &&
    previous.speedKmh <= threshold
  ) {
    const driftM = haversineMeters(
      previous.latitude,
      previous.longitude,
      sample.latitude,
      sample.longitude,
    );
    if (driftM <= 15) return previous.speedKmh;
  }
  return null;
}

function enrichEffectiveSpeeds(
  samples: RouteGpsSample[],
  threshold: number,
): RouteGpsSample[] {
  const enriched: RouteGpsSample[] = [];
  for (const sample of samples) {
    const prev = enriched.length ? enriched[enriched.length - 1] : null;
    const effective = effectiveSpeedKmh(sample, prev, threshold);
    enriched.push({
      ...sample,
      speedKmh: effective,
    });
  }
  return enriched;
}

function isStationaryOrCreep(sample: RouteGpsSample, threshold: number): boolean {
  if (sample.latitude == null || sample.longitude == null) return false;
  if (sample.speedKmh == null) return false;
  return sample.speedKmh <= threshold;
}

function detectLowSpeedClusters(
  samples: RouteGpsSample[],
  config: PhysicalRefuelCoordinateSelectorConfig,
): ClusterPoint[][] {
  const clusters: ClusterPoint[][] = [];
  let current: ClusterPoint[] = [];
  let lastTs: number | null = null;

  for (const s of samples) {
    const ts = new Date(s.timestamp).getTime();
    const gapBreak = lastTs != null && (ts - lastTs) / 1000 > config.maxGapSec;
    const low = isStationaryOrCreep(s, config.speedThresholdKmh);

    if (low && !gapBreak) {
      current.push({
        timestamp: s.timestamp,
        latitude: s.latitude!,
        longitude: s.longitude!,
        speedKmh: s.speedKmh ?? null,
      });
    } else {
      if (current.length >= config.minClusterPoints) clusters.push([...current]);
      current =
        low && s.latitude != null && s.longitude != null
          ? [
              {
                timestamp: s.timestamp,
                latitude: s.latitude,
                longitude: s.longitude,
                speedKmh: s.speedKmh ?? null,
              },
            ]
          : [];
    }
    lastTs = ts;
  }
  if (current.length >= config.minClusterPoints) clusters.push(current);
  return clusters;
}

function rankClusters(
  clusters: ClusterPoint[][],
  riseOnsetMs: number,
  config: PhysicalRefuelCoordinateSelectorConfig,
): { ranked: RankedCluster[]; rejectionReasons: string[] } {
  const rejectionReasons: string[] = [];
  const ranked: RankedCluster[] = [];

  for (const points of clusters) {
    const endMs = new Date(points[points.length - 1].timestamp).getTime();
    const temporalOffsetToRiseSec = (riseOnsetMs - endMs) / 1000;
    const spreadMeters = clusterSpreadMeters(points);

    if (temporalOffsetToRiseSec < 0) {
      rejectionReasons.push(
        `cluster_ends_after_rise:${points[0].timestamp}..${points[points.length - 1].timestamp}`,
      );
      continue;
    }
    if (temporalOffsetToRiseSec > config.maxClusterEndToRiseSec) {
      rejectionReasons.push(
        `cluster_too_early:${points[points.length - 1].timestamp}_offset_${Math.round(temporalOffsetToRiseSec)}s`,
      );
      continue;
    }
    if (spreadMeters > config.maxSpatialSpreadMeters) {
      rejectionReasons.push(
        `cluster_spread_${Math.round(spreadMeters)}m_exceeds_${config.maxSpatialSpreadMeters}m`,
      );
      continue;
    }

    ranked.push({
      points,
      startAt: points[0].timestamp,
      endAt: points[points.length - 1].timestamp,
      endMs,
      temporalOffsetToRiseSec,
      spreadMeters,
      medoid: medoid(points),
    });
  }

  ranked.sort((a, b) => a.temporalOffsetToRiseSec - b.temporalOffsetToRiseSec);
  return { ranked, rejectionReasons };
}

export function derivePhysicalRefuelCoordinate(
  input: PhysicalRefuelCoordinateInput,
  config: PhysicalRefuelCoordinateSelectorConfig = DEFAULT_PHYSICAL_REFUEL_COORDINATE_SELECTOR_CONFIG,
): PhysicalRefuelCoordinateResult {
  const policyVersion = input.policyVersion ?? PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2;
  const riseOnsetMs = new Date(input.fuelRiseOnsetAt).getTime();
  /** G1.2b: fuel-rise onset is the sole temporal anchor; provider segment start must not clip pre-rise dwell. */
  const lookbackStartMs = riseOnsetMs - config.lookbackMaxSec * 1000;
  const eventStartAtMs = input.eventStartAt ? new Date(input.eventStartAt).getTime() : null;

  const baseProvenance = {
    policyVersion,
    source: 'route_gps_speed_joint' as const,
    sampleCount: 0,
    clusterStart: '',
    clusterEnd: '',
    distanceSpreadMeters: 0,
    speedStatistics: { min: null, max: null, median: null },
    temporalOffsetToRiseSec: 0,
    candidateCount: 0,
    rejectionReasons: [] as string[],
    selectedClusterRank: 0,
    eventStartAtMs,
    lookbackStartMs,
  };

  const gpsSamples = input.routeSamples.filter(
    (s) =>
      s.latitude != null &&
      s.longitude != null &&
      new Date(s.timestamp).getTime() <= riseOnsetMs &&
      new Date(s.timestamp).getTime() >= lookbackStartMs,
  );

  if (!gpsSamples.length) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      provenance: {
        ...baseProvenance,
        rejectionReasons: ['no_gps_samples_in_lookback_window'],
      },
    };
  }

  const preRiseSamples = enrichEffectiveSpeeds(
    gpsSamples.filter((s) => new Date(s.timestamp).getTime() <= riseOnsetMs),
    config.speedThresholdKmh,
  );
  const clusters = detectLowSpeedClusters(preRiseSamples, config);
  const { ranked, rejectionReasons } = rankClusters(clusters, riseOnsetMs, config);

  if (!ranked.length) {
    return {
      status: 'NO_DWELL_FOUND',
      provenance: {
        ...baseProvenance,
        sampleCount: preRiseSamples.length,
        candidateCount: clusters.length,
        rejectionReasons,
      },
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  if (
    second &&
    second.temporalOffsetToRiseSec - best.temporalOffsetToRiseSec <= config.ambiguityMarginSec
  ) {
    return {
      status: 'AMBIGUOUS',
      provenance: {
        ...baseProvenance,
        sampleCount: best.points.length,
        clusterStart: best.startAt,
        clusterEnd: best.endAt,
        distanceSpreadMeters: best.spreadMeters,
        speedStatistics: {
          min: Math.min(...best.points.map((p) => p.speedKmh ?? Infinity)),
          max: Math.max(...best.points.map((p) => p.speedKmh ?? -Infinity)),
          median: median(best.points.map((p) => p.speedKmh ?? 0).filter((v) => v !== Infinity)),
        },
        temporalOffsetToRiseSec: best.temporalOffsetToRiseSec,
        candidateCount: ranked.length,
        rejectionReasons: [
          ...rejectionReasons,
          `ambiguous_top2_margin_${Math.round(second.temporalOffsetToRiseSec - best.temporalOffsetToRiseSec)}s`,
        ],
        selectedClusterRank: 0,
      },
    };
  }

  const speeds = best.points.map((p) => p.speedKmh).filter((v): v is number => v != null);
  return {
    status: 'SELECTED',
    coordinate: best.medoid,
    provenance: {
      policyVersion,
      source: 'route_gps_speed_joint',
      sampleCount: best.points.length,
      clusterStart: best.startAt,
      clusterEnd: best.endAt,
      distanceSpreadMeters: best.spreadMeters,
      speedStatistics: {
        min: speeds.length ? Math.min(...speeds) : null,
        max: speeds.length ? Math.max(...speeds) : null,
        median: median(speeds),
      },
      temporalOffsetToRiseSec: best.temporalOffsetToRiseSec,
      candidateCount: ranked.length,
      rejectionReasons,
      selectedClusterRank: 1,
      eventStartAtMs,
      lookbackStartMs,
    },
  };
}
