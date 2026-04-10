import { Injectable, Logger } from '@nestjs/common';

export interface MapMatchedLeg {
  distance: number;
  duration: number;
  roadClass: string;
  speedLimit: number | null;
  geometry: [number, number][];
}

export interface MapMatchResult {
  matchedGeometry: [number, number][];
  legs: MapMatchedLeg[];
  totalDistance: number;
  confidence: number;
}

// ── Speeding Sections Architecture ──────────────────────────────────────────

export interface RoutePointFull {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

export interface OverspeedPoint {
  index: number;
  timestamp: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  speedLimitKmh: number;
  overByKmh: number;
  limitSource: 'mapbox' | 'fallback';
}

export type SpeedingSeverity = 'low' | 'moderate' | 'high' | 'severe';

export interface SpeedingSection {
  sectionIndex: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  approxDistanceMeters: number;
  representativeSpeedLimitKmh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxOverSpeedKmh: number;
  avgOverSpeedKmh: number;
  pointCount: number;
  mapboxLimitPointCount: number;
  fallbackLimitPointCount: number;
  primaryLimitSource: 'mapbox' | 'fallback' | 'mixed';
  severity: SpeedingSeverity;
  /** Coordinates for map rendering: [lng, lat][] */
  coordinates: [number, number][];
}

export interface SpeedingAnalysis {
  speedingSectionCount: number;
  speedingDistanceMeters: number;
  speedingDurationSeconds: number;
  maxOverSpeedKmh: number;
  avgOverSpeedKmh: number;
  speedingExposurePercent: number;
  sections: SpeedingSection[];
  /** @deprecated Legacy compat — point-based percentage */
  speedingPercent: number;
  /** @deprecated Legacy compat — now equals speedingSectionCount */
  speedingSegments: number;
}

const ROAD_CLASS_TO_TYPE: Record<string, 'city' | 'highway' | 'country'> = {
  motorway: 'highway',
  motorway_link: 'highway',
  trunk: 'highway',
  trunk_link: 'highway',
  primary: 'country',
  primary_link: 'country',
  secondary: 'country',
  secondary_link: 'country',
  tertiary: 'country',
  tertiary_link: 'country',
  residential: 'city',
  service: 'city',
  living_street: 'city',
  unclassified: 'country',
  road: 'country',
};

@Injectable()
export class MapboxService {
  private readonly logger = new Logger(MapboxService.name);
  private readonly token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

  async mapMatchRoute(
    coordinates: { longitude: number; latitude: number; timestamp?: string }[],
  ): Promise<MapMatchResult | null> {
    if (!this.token || coordinates.length < 2) return null;

    const MAX_COORDS = 100;
    const sampled = coordinates.length > MAX_COORDS
      ? coordinates.filter((_, i) => i % Math.ceil(coordinates.length / MAX_COORDS) === 0)
      : coordinates;

    const coordStr = sampled.map((c) => `${c.longitude},${c.latitude}`).join(';');
    const timestamps = sampled.every((c) => c.timestamp)
      ? `&timestamps=${sampled.map((c) => Math.floor(new Date(c.timestamp!).getTime() / 1000)).join(';')}`
      : '';

    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordStr}?access_token=${this.token}&geometries=geojson&overview=full&annotations=speed,maxspeed,distance&tidy=true${timestamps}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.matchings?.length) {
        this.logger.debug(`Map matching returned ${data.code} for ${sampled.length} points`);
        return null;
      }

      const matching = data.matchings[0];
      const matchedGeometry: [number, number][] = matching.geometry?.coordinates ?? [];

      const legs: MapMatchedLeg[] = (matching.legs ?? []).map((leg: any, i: number) => {
        const annotation = leg.annotation ?? {};
        const distances: number[] = annotation.distance ?? [];
        const speeds: number[] = annotation.speed ?? [];
        const maxspeeds: any[] = annotation.maxspeed ?? [];

        const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
        const speedLimit = maxspeeds.length > 0
          ? maxspeeds.reduce((best: number | null, ms: any) => {
              let val = ms?.speed ?? ms?.value;
              if (typeof val === 'number' && ms?.unit === 'mph') val = Math.round(val * 1.60934);
              return typeof val === 'number' && (best === null || val > best) ? val : best;
            }, null as number | null)
          : null;

        const roadClass = this.inferRoadClassFromSpeed(avgSpeed, speedLimit);

        return {
          distance: leg.distance ?? 0,
          duration: leg.duration ?? 0,
          roadClass,
          speedLimit,
          geometry: [],
        };
      });

      const totalDistance = legs.reduce((s, l) => s + l.distance, 0);

      return {
        matchedGeometry,
        legs,
        totalDistance: totalDistance || matching.distance || 0,
        confidence: matching.confidence ?? 0,
      };
    } catch (err: any) {
      this.logger.warn(`Mapbox map matching failed: ${err.message}`);
      return null;
    }
  }

  deriveRoadTypeDistribution(
    legs: MapMatchedLeg[],
    totalDistance: number,
  ): { cityPercent: number; highwayPercent: number; countryPercent: number; cityKm: number; highwayKm: number; countryKm: number } {
    if (!legs.length || totalDistance <= 0) {
      return { cityPercent: 33, highwayPercent: 34, countryPercent: 33, cityKm: 0, highwayKm: 0, countryKm: 0 };
    }

    let cityM = 0;
    let highwayM = 0;
    let countryM = 0;

    for (const leg of legs) {
      const type = ROAD_CLASS_TO_TYPE[leg.roadClass] ?? this.inferTypeFromDistance(leg);
      switch (type) {
        case 'city': cityM += leg.distance; break;
        case 'highway': highwayM += leg.distance; break;
        case 'country': countryM += leg.distance; break;
      }
    }

    const total = cityM + highwayM + countryM || 1;
    return {
      cityPercent: Math.round((cityM / total) * 100),
      highwayPercent: Math.round((highwayM / total) * 100),
      countryPercent: Math.round((countryM / total) * 100),
      cityKm: Math.round(cityM / 100) / 10,
      highwayKm: Math.round(highwayM / 100) / 10,
      countryKm: Math.round(countryM / 100) / 10,
    };
  }

  /**
   * @deprecated Use analyzeSpeedingSections() for section-based analysis.
   * Kept for backward compatibility only.
   */
  detectSpeeding(
    legs: MapMatchedLeg[],
    routePoints: { speedKmh: number | null }[],
  ): { speedingPercent: number; maxOverSpeedKmh: number; speedingSegments: number } {
    const analysis = this.analyzeSpeedingSections(legs, routePoints as RoutePointFull[]);
    return {
      speedingPercent: analysis.speedingPercent,
      maxOverSpeedKmh: analysis.maxOverSpeedKmh,
      speedingSegments: analysis.speedingSectionCount,
    };
  }

  // ── Speeding Sections Analysis Pipeline ───────────────────────────────────

  private static readonly TOLERANCE = 1.05;
  /** Max consecutive non-overspeed points allowed inside an active section */
  private static readonly HYSTERESIS_GAP_POINTS = 2;
  /** Max time gap (seconds) to tolerate inside a section */
  private static readonly HYSTERESIS_GAP_SECONDS = 10;

  analyzeSpeedingSections(
    legs: MapMatchedLeg[],
    routePoints: RoutePointFull[],
  ): SpeedingAnalysis {
    const empty: SpeedingAnalysis = {
      speedingSectionCount: 0,
      speedingDistanceMeters: 0,
      speedingDurationSeconds: 0,
      maxOverSpeedKmh: 0,
      avgOverSpeedKmh: 0,
      speedingExposurePercent: 0,
      sections: [],
      speedingPercent: 0,
      speedingSegments: 0,
    };

    if (!routePoints.length) return empty;

    // Step 1: detect overspeed per point with leg-local limits
    const overspeedFlags = this.detectOverspeedPoints(legs, routePoints);

    // Step 2: group into sections with hysteresis
    const sections = this.buildSections(routePoints, overspeedFlags);

    // Step 3: derive summary
    return this.deriveSummary(sections, routePoints, overspeedFlags);
  }

  /**
   * Step 1 — per-point overspeed detection with leg-local speed limits.
   * Returns an array parallel to routePoints where each entry is either
   * null (not overspeeding) or an OverspeedPoint.
   */
  detectOverspeedPoints(
    legs: MapMatchedLeg[],
    routePoints: RoutePointFull[],
  ): (OverspeedPoint | null)[] {
    const step = routePoints.length > 100 ? Math.ceil(routePoints.length / 100) : 1;

    return routePoints.map((p, i) => {
      if (p.speedKmh == null) return null;

      const legIdx = Math.min(Math.floor(i / step), Math.max(legs.length - 1, 0));
      const legLimit = legs[legIdx]?.speedLimit ?? null;
      const limit = legLimit ?? this.defaultLimitForSpeed(p.speedKmh);
      const limitSource: 'mapbox' | 'fallback' = legLimit != null ? 'mapbox' : 'fallback';
      const threshold = limit * MapboxService.TOLERANCE;

      if (p.speedKmh <= threshold) return null;

      return {
        index: i,
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        speedLimitKmh: limit,
        overByKmh: Math.round((p.speedKmh - limit) * 10) / 10,
        limitSource,
      };
    });
  }

  /**
   * Step 2 — group consecutive overspeed points into sections.
   * Hysteresis: short non-overspeed gaps (≤2 points or ≤10s) don't split.
   */
  private buildSections(
    routePoints: RoutePointFull[],
    flags: (OverspeedPoint | null)[],
  ): SpeedingSection[] {
    const sections: SpeedingSection[] = [];

    let activePoints: OverspeedPoint[] = [];
    let activeAllIndices: number[] = [];
    let gapCount = 0;

    const finalize = () => {
      if (!activePoints.length) return;
      sections.push(this.createSection(sections.length, routePoints, activePoints, activeAllIndices));
      activePoints = [];
      activeAllIndices = [];
      gapCount = 0;
    };

    for (let i = 0; i < flags.length; i++) {
      const op = flags[i];

      if (op) {
        activePoints.push(op);
        activeAllIndices.push(i);
        gapCount = 0;
      } else if (activePoints.length > 0) {
        gapCount++;

        // Check time gap if possible
        const lastOp = activePoints[activePoints.length - 1];
        const timeDiff = this.timeDiffSeconds(lastOp.timestamp, routePoints[i].timestamp);

        if (gapCount > MapboxService.HYSTERESIS_GAP_POINTS ||
            (timeDiff != null && timeDiff > MapboxService.HYSTERESIS_GAP_SECONDS)) {
          finalize();
          gapCount = 0;
        } else {
          activeAllIndices.push(i);
        }
      }
    }
    finalize();

    return sections;
  }

  /**
   * Create a single SpeedingSection from its constituent overspeed points.
   */
  private createSection(
    idx: number,
    routePoints: RoutePointFull[],
    overspeedPts: OverspeedPoint[],
    allIndices: number[],
  ): SpeedingSection {
    const first = overspeedPts[0];
    const last = overspeedPts[overspeedPts.length - 1];

    const durationS = Math.max(0, Math.round(
      (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000,
    ));

    let distM = 0;
    for (let j = 1; j < allIndices.length; j++) {
      const a = routePoints[allIndices[j - 1]];
      const b = routePoints[allIndices[j]];
      distM += MapboxService.haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    }

    const speeds = overspeedPts.map((p) => p.speedKmh);
    const overs = overspeedPts.map((p) => p.overByKmh);
    const limits = overspeedPts.map((p) => p.speedLimitKmh);
    const mapboxCount = overspeedPts.filter((p) => p.limitSource === 'mapbox').length;
    const fallbackCount = overspeedPts.filter((p) => p.limitSource === 'fallback').length;

    const maxSpeed = Math.max(...speeds);
    const avgSpeed = Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10;
    const maxOver = Math.max(...overs);
    const avgOver = Math.round((overs.reduce((a, b) => a + b, 0) / overs.length) * 10) / 10;
    const repLimit = MapboxService.snapToStandardLimit(limits);

    const coordinates: [number, number][] = allIndices.map((i) => [routePoints[i].longitude, routePoints[i].latitude]);

    return {
      sectionIndex: idx,
      startedAt: first.timestamp,
      endedAt: last.timestamp,
      durationSeconds: durationS,
      startLatitude: first.latitude,
      startLongitude: first.longitude,
      endLatitude: last.latitude,
      endLongitude: last.longitude,
      approxDistanceMeters: Math.round(distM),
      representativeSpeedLimitKmh: repLimit,
      maxSpeedKmh: maxSpeed,
      avgSpeedKmh: avgSpeed,
      maxOverSpeedKmh: maxOver,
      avgOverSpeedKmh: avgOver,
      pointCount: overspeedPts.length,
      mapboxLimitPointCount: mapboxCount,
      fallbackLimitPointCount: fallbackCount,
      primaryLimitSource: mapboxCount > 0 && fallbackCount > 0 ? 'mixed' : mapboxCount > 0 ? 'mapbox' : 'fallback',
      severity: this.classifySeverity(maxOver, avgOver, durationS, distM),
      coordinates,
    };
  }

  /**
   * Severity model combining overspeed magnitude, duration, and distance.
   *
   * Thresholds:
   *   SEVERE  — avgOver ≥ 30 km/h, OR maxOver ≥ 50 km/h, OR (avgOver ≥ 20 AND duration ≥ 60s)
   *   HIGH    — avgOver ≥ 20 km/h, OR maxOver ≥ 35 km/h, OR (avgOver ≥ 10 AND duration ≥ 120s)
   *   MODERATE— avgOver ≥ 10 km/h, OR maxOver ≥ 20 km/h, OR duration ≥ 60s
   *   LOW     — everything else
   */
  private classifySeverity(
    maxOver: number, avgOver: number, durationS: number, _distM: number,
  ): SpeedingSeverity {
    if (avgOver >= 30 || maxOver >= 50 || (avgOver >= 20 && durationS >= 60)) return 'severe';
    if (avgOver >= 20 || maxOver >= 35 || (avgOver >= 10 && durationS >= 120)) return 'high';
    if (avgOver >= 10 || maxOver >= 20 || durationS >= 60) return 'moderate';
    return 'low';
  }

  /**
   * Step 3 — derive trip-level summary from sections.
   */
  private deriveSummary(
    sections: SpeedingSection[],
    routePoints: RoutePointFull[],
    flags: (OverspeedPoint | null)[],
  ): SpeedingAnalysis {
    const totalDistM = this.totalRouteDistanceM(routePoints);
    const speedingDistM = sections.reduce((s, sec) => s + sec.approxDistanceMeters, 0);
    const speedingDurS = sections.reduce((s, sec) => s + sec.durationSeconds, 0);
    const maxOver = sections.length > 0 ? Math.max(...sections.map((s) => s.maxOverSpeedKmh)) : 0;
    const allOvers = sections.flatMap((s) => [s.avgOverSpeedKmh]);
    const avgOver = allOvers.length > 0
      ? Math.round((allOvers.reduce((a, b) => a + b, 0) / allOvers.length) * 10) / 10
      : 0;

    const exposure = totalDistM > 0
      ? Math.round((speedingDistM / totalDistM) * 1000) / 10
      : 0;

    // Legacy point-based percent for backward compat
    const overCount = flags.filter((f) => f != null).length;
    const withSpeed = routePoints.filter((p) => p.speedKmh != null).length || 1;
    const legacyPercent = Math.round((overCount / withSpeed) * 100);

    return {
      speedingSectionCount: sections.length,
      speedingDistanceMeters: Math.round(speedingDistM),
      speedingDurationSeconds: speedingDurS,
      maxOverSpeedKmh: Math.round(maxOver),
      avgOverSpeedKmh: avgOver,
      speedingExposurePercent: exposure,
      sections,
      speedingPercent: legacyPercent,
      speedingSegments: sections.length,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private inferRoadClassFromSpeed(avgSpeed: number | null, speedLimit: number | null): string {
    const ref = speedLimit ?? avgSpeed;
    if (ref == null) return 'unclassified';
    if (ref > 100) return 'motorway';
    if (ref > 70) return 'trunk';
    if (ref > 50) return 'secondary';
    return 'residential';
  }

  private inferTypeFromDistance(leg: MapMatchedLeg): 'city' | 'highway' | 'country' {
    if (leg.speedLimit != null) {
      if (leg.speedLimit > 100) return 'highway';
      if (leg.speedLimit <= 50) return 'city';
      return 'country';
    }
    return 'country';
  }

  private static readonly STANDARD_LIMITS = [30, 50, 60, 70, 80, 100, 120, 130];

  /**
   * Determine a representative speed limit from an array of per-point limits.
   * Uses the mode (most frequent value), snapped to the nearest standard limit.
   */
  private static snapToStandardLimit(limits: number[]): number {
    const freq = new Map<number, number>();
    for (const l of limits) {
      const snapped = MapboxService.STANDARD_LIMITS.reduce((best, s) =>
        Math.abs(s - l) < Math.abs(best - l) ? s : best,
      );
      freq.set(snapped, (freq.get(snapped) ?? 0) + 1);
    }
    let bestLimit = 50;
    let bestCount = 0;
    for (const [limit, count] of freq) {
      if (count > bestCount) { bestCount = count; bestLimit = limit; }
    }
    return bestLimit;
  }

  defaultLimitForSpeed(speedKmh: number): number {
    if (speedKmh > 130) return 130;
    if (speedKmh > 80) return 100;
    return 50;
  }

  private timeDiffSeconds(a: string, b: string): number | null {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (isNaN(ta) || isNaN(tb)) return null;
    return Math.abs(tb - ta) / 1000;
  }

  private totalRouteDistanceM(points: RoutePointFull[]): number {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += MapboxService.haversineM(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
    }
    return d;
  }

  static haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
