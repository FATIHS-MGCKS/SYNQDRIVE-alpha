import { Injectable, Logger } from '@nestjs/common';
import { DimoAuthService } from './dimo-auth.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { buildTripDetectionCoreQuery } from './queries/trip-detection-core.query';
import { buildRouteEnrichmentQuery } from './queries/route-enrichment.query';
import { buildEnvironmentTemperatureQuery } from './queries/environment-temperature.query';
import { buildPerformanceQuery } from './queries/performance.query';
import { buildTirePressureHistoryQuery } from './queries/tire-pressure-history.query';
import { buildHighFrequencyQuery } from './queries/high-frequency.query';
import { buildBatteryCrankQuery } from './queries/battery-crank.query';
import { buildDrivingEventsQuery } from './queries/driving-events.query';

// ── V3 LTE_R1: native DIMO driving event signal sample ──
export interface DimoNativeDrivingEventSample {
  timestamp: string;
  safetySystemBrakingHarshBraking: number | null;
  safetySystemBrakingExtremeEmergency: number | null;
  safetySystemAccelerationHarshAcceleration: number | null;
  safetySystemCorneringHarshCornering: number | null;
  speed: number | null;
}

export interface CrankDataPoint {
  timestamp: string;
  voltage: number | null;
  rpm: number | null;
}

// ── Core data point from 20-second trip detection buckets ──
export interface TripCoreDataPoint {
  timestamp: string;
  isIgnitionOn: boolean;
  speed: number | null;
  travelledDistance: number | null;
  fuelAbsoluteLevel: number | null;
  batteryEnergy: number | null;
}

// ── Detected trip segment ──
export interface DetectedTrip {
  startTime: string;
  endTime: string | null;
  isOngoing: boolean;
  startOdometer: number | null;
  endOdometer: number | null;
  startFuelLevel: number | null;
  endFuelLevel: number | null;
  startBatteryEnergy: number | null;
  endBatteryEnergy: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  durationSeconds: number;
  corePoints: TripCoreDataPoint[];
}

// ── Route point from 7-second enrichment buckets ──
export interface RoutePoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

// ── Temperature reading from 2-minute buckets ──
export interface TemperatureReading {
  timestamp: string;
  temperatureC: number;
}

// ── Performance reading from 15-second buckets ──
export interface PerformanceReading {
  timestamp: string;
  engineCoolantTempC: number | null;
  rpm: number | null;
  throttlePosition: number | null;
  engineLoad: number | null;
}

// ── High frequency reading from 1-second post-trip enrichment ──
export interface HighFrequencyReading {
  timestamp: string;
  speedKmh: number | null;
  engineCoolantTempC: number | null;
  rpm: number | null;
  throttlePosition: number | null;
  engineLoad: number | null;
  /** kW from powertrainTractionBatteryCurrentPower (W → kW) */
  tractionBatteryPowerKw: number | null;
}

// ── Tire pressure reading from 3-minute buckets ──
export interface TirePressureReading {
  timestamp: string;
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
}

const GAP_TIMEOUT_MS = 20 * 60 * 1000;
const MIN_TRIP_DURATION_MS = 60 * 1000;

@Injectable()
export class DimoSegmentsService {
  private readonly logger = new Logger(DimoSegmentsService.name);

  constructor(
    private readonly auth: DimoAuthService,
    private readonly telemetry: DimoTelemetryService,
  ) {}

  // ────────────────────────────────────────────────────────
  // ⚠️  LEGACY V1 TRIP DETECTION — DEPRECATED
  //
  // The methods below (fetchAndDetectTrips, detectTrips, finalizeTrip) are the
  // original V1 signal-based trip detection path. They use a simple
  // `isIgnitionOn && speed > 0` heuristic that is NOT profile-aware and produces
  // incorrect results for EVs and HYBRIDs.
  //
  // These methods are NO LONGER called by the live V2 trip orchestration engine.
  // The live engine is driven by:
  //   DimoSnapshotProcessor → TripDetectionOrchestrationService
  //
  // These methods are retained ONLY for:
  //   • The manual admin-only POST /vehicles/:id/trips/sync endpoint (for
  //     historical back-fill or debugging by platform admins).
  //   • Backward compatibility with the TripsService.syncTripsFromSegments path.
  //
  // Do NOT call these methods from any worker, scheduler, or live orchestration path.
  // ────────────────────────────────────────────────────────

  /**
   * @deprecated V1 legacy path. Use the V2 live orchestration engine instead.
   *   (TripDetectionOrchestrationService via DimoSnapshotProcessor)
   */
  async fetchAndDetectTrips(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<DetectedTrip[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) {
      this.logger.warn(`No vehicle JWT for tokenId=${tokenId}`);
      return [];
    }

    const corePoints = await this.fetchTripCoreData(jwt, tokenId, from, to);
    if (corePoints.length === 0) {
      this.logger.debug(`No trip core data for tokenId=${tokenId} in range`);
      return [];
    }

    const trips = this.detectTrips(corePoints);
    this.logger.debug(
      `Detected ${trips.length} trips from ${corePoints.length} core points for tokenId=${tokenId}`,
    );
    return trips;
  }

  async fetchRawTripCoreData(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<TripCoreDataPoint[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];
    return this.fetchTripCoreData(jwt, tokenId, from, to);
  }

  private async fetchTripCoreData(
    jwt: string,
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<TripCoreDataPoint[]> {
    const query = buildTripDetectionCoreQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];

      return signals
        .filter((s: any) => s.timestamp)
        .map((s: any) => ({
          timestamp: s.timestamp,
          isIgnitionOn:
            typeof s.isIgnitionOn === 'number' ? s.isIgnitionOn >= 0.5 : false,
          speed: typeof s.speed === 'number' ? s.speed : null,
          travelledDistance:
            typeof s.powertrainTransmissionTravelledDistance === 'number'
              ? s.powertrainTransmissionTravelledDistance
              : null,
          fuelAbsoluteLevel:
            typeof s.powertrainFuelSystemAbsoluteLevel === 'number'
              ? s.powertrainFuelSystemAbsoluteLevel
              : null,
          batteryEnergy:
            typeof s.powertrainTractionBatteryStateOfChargeCurrentEnergy ===
            'number'
              ? s.powertrainTractionBatteryStateOfChargeCurrentEnergy
              : null,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Trip core fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * @deprecated V1 legacy detection. isIgnitionOn-based, not profile-aware.
   *   Not used by the live V2 engine. Retained for admin manual-sync only.
   *
   * Trip boundary detection from core signal time series.
   * START: isIgnitionOn=true AND speed>0
   * END:   isIgnitionOn=false AND speed=0
   * GAP:   20 minutes with no qualifying data → auto-finalize
   */
  private detectTrips(points: TripCoreDataPoint[]): DetectedTrip[] {
    const trips: DetectedTrip[] = [];
    let activePoints: TripCoreDataPoint[] = [];
    let lastActiveTime = 0;

    for (const point of points) {
      const pointMs = new Date(point.timestamp).getTime();
      const isDriving = point.isIgnitionOn && point.speed != null && point.speed > 0;

      if (isDriving) {
        if (
          activePoints.length > 0 &&
          lastActiveTime > 0 &&
          pointMs - lastActiveTime > GAP_TIMEOUT_MS
        ) {
          this.finalizeTrip(activePoints, trips, false);
          activePoints = [];
        }
        activePoints.push(point);
        lastActiveTime = pointMs;
      } else {
        const isEnded =
          !point.isIgnitionOn &&
          (point.speed == null || point.speed === 0);

        if (activePoints.length > 0 && isEnded) {
          activePoints.push(point);
          if (lastActiveTime > 0 && pointMs - lastActiveTime > GAP_TIMEOUT_MS) {
            this.finalizeTrip(activePoints, trips, false);
            activePoints = [];
            lastActiveTime = 0;
          }
        } else if (activePoints.length > 0) {
          if (lastActiveTime > 0 && pointMs - lastActiveTime > GAP_TIMEOUT_MS) {
            this.finalizeTrip(activePoints, trips, false);
            activePoints = [];
            lastActiveTime = 0;
          }
        }
      }
    }

    if (activePoints.length > 0) {
      const lastPoint = activePoints[activePoints.length - 1];
      const lastIsDriving =
        lastPoint.isIgnitionOn && lastPoint.speed != null && lastPoint.speed > 0;
      this.finalizeTrip(activePoints, trips, lastIsDriving);
    }

    return trips;
  }

  /** @deprecated V1 legacy path. See detectTrips() above. */
  private finalizeTrip(
    points: TripCoreDataPoint[],
    trips: DetectedTrip[],
    isOngoing: boolean,
  ): void {
    if (points.length < 2) return;

    const startMs = new Date(points[0].timestamp).getTime();
    const endMs = new Date(points[points.length - 1].timestamp).getTime();
    if (endMs - startMs < MIN_TRIP_DURATION_MS) return;

    const odometerValues = points
      .filter((p) => p.travelledDistance != null)
      .map((p) => p.travelledDistance!);
    const startOdometer =
      odometerValues.length > 0 ? odometerValues[0] : null;
    const endOdometer =
      odometerValues.length > 0
        ? odometerValues[odometerValues.length - 1]
        : null;

    if (
      startOdometer != null &&
      endOdometer != null &&
      endOdometer - startOdometer < 0.1
    ) {
      return;
    }

    const fuelValues = points.filter((p) => p.fuelAbsoluteLevel != null);
    const energyValues = points.filter((p) => p.batteryEnergy != null);
    const speeds = points
      .filter((p) => p.speed != null && p.speed > 0)
      .map((p) => p.speed!);

    trips.push({
      startTime: points[0].timestamp,
      endTime: isOngoing ? null : points[points.length - 1].timestamp,
      isOngoing,
      startOdometer,
      endOdometer,
      startFuelLevel:
        fuelValues.length > 0 ? fuelValues[0].fuelAbsoluteLevel : null,
      endFuelLevel:
        fuelValues.length > 0
          ? fuelValues[fuelValues.length - 1].fuelAbsoluteLevel
          : null,
      startBatteryEnergy:
        energyValues.length > 0 ? energyValues[0].batteryEnergy : null,
      endBatteryEnergy:
        energyValues.length > 0
          ? energyValues[energyValues.length - 1].batteryEnergy
          : null,
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      avgSpeed:
        speeds.length > 0
          ? Math.round(
              (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10,
            ) / 10
          : null,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : null,
      durationSeconds: (endMs - startMs) / 1000,
      corePoints: points,
    });
  }

  // ────────────────────────────────────────────────────────
  // ROUTE ENRICHMENT (7-second resolution)
  // ────────────────────────────────────────────────────────

  async fetchRouteEnrichment(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<RoutePoint[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildRouteEnrichmentQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return this.parseRoutePoints(signals);
    } catch (err: any) {
      this.logger.warn(
        `Route enrichment fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  private parseRoutePoints(signals: any[]): RoutePoint[] {
    const points: RoutePoint[] = [];
    for (const s of signals) {
      const coords = s.currentLocationCoordinates;
      let lat: number | null = null;
      let lng: number | null = null;
      if (coords) {
        if (typeof coords.latitude === 'number') lat = coords.latitude;
        else if (typeof coords.lat === 'number') lat = coords.lat;
        if (typeof coords.longitude === 'number') lng = coords.longitude;
        else if (typeof coords.lng === 'number') lng = coords.lng;
        else if (typeof coords.lon === 'number') lng = coords.lon;
      }
      if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
        points.push({
          latitude: lat,
          longitude: lng,
          speedKmh: typeof s.speed === 'number' ? s.speed : null,
          timestamp: s.timestamp,
        });
      }
    }
    return points.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  // ────────────────────────────────────────────────────────
  // ENVIRONMENT TEMPERATURE (2-minute resolution)
  // ────────────────────────────────────────────────────────

  async fetchEnvironmentTemperature(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<TemperatureReading[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildEnvironmentTemperatureQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return signals
        .filter(
          (s: any) =>
            s.timestamp && typeof s.exteriorAirTemperature === 'number',
        )
        .map((s: any) => ({
          timestamp: s.timestamp,
          temperatureC: s.exteriorAirTemperature,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Temperature fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // PERFORMANCE (15-second resolution)
  // ────────────────────────────────────────────────────────

  async fetchPerformance(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<PerformanceReading[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildPerformanceQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return signals
        .filter((s: any) => s.timestamp)
        .map((s: any) => ({
          timestamp: s.timestamp,
          engineCoolantTempC:
            typeof s.powertrainCombustionEngineECT === 'number'
              ? s.powertrainCombustionEngineECT
              : null,
          rpm:
            typeof s.powertrainCombustionEngineSpeed === 'number'
              ? s.powertrainCombustionEngineSpeed
              : null,
          throttlePosition:
            typeof s.obdThrottlePosition === 'number'
              ? s.obdThrottlePosition
              : null,
          engineLoad:
            typeof s.obdEngineLoad === 'number' ? s.obdEngineLoad : null,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Performance fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // TIRE PRESSURE HISTORY (3-minute resolution)
  // ────────────────────────────────────────────────────────

  async fetchTirePressureHistory(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<TirePressureReading[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildTirePressureHistoryQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return signals
        .filter((s: any) => s.timestamp)
        .map((s: any) => ({
          timestamp: s.timestamp,
          frontLeft:
            typeof s.chassisAxleRow1WheelLeftTirePressure === 'number'
              ? s.chassisAxleRow1WheelLeftTirePressure
              : null,
          frontRight:
            typeof s.chassisAxleRow1WheelRightTirePressure === 'number'
              ? s.chassisAxleRow1WheelRightTirePressure
              : null,
          rearLeft:
            typeof s.chassisAxleRow2WheelLeftTirePressure === 'number'
              ? s.chassisAxleRow2WheelLeftTirePressure
              : null,
          rearRight:
            typeof s.chassisAxleRow2WheelRightTirePressure === 'number'
              ? s.chassisAxleRow2WheelRightTirePressure
              : null,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Tire pressure fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────

  async fetchHighFrequency(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<HighFrequencyReading[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildHighFrequencyQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return signals
        .filter((s: any) => s.timestamp)
        .map((s: any) => {
          const w =
            typeof s.powertrainTractionBatteryCurrentPower === 'number'
              ? s.powertrainTractionBatteryCurrentPower
              : null;
          return {
            timestamp: s.timestamp,
            speedKmh:
              typeof s.speed === 'number' ? s.speed : null,
            engineCoolantTempC:
              typeof s.powertrainCombustionEngineECT === 'number'
                ? s.powertrainCombustionEngineECT
                : null,
            rpm:
              typeof s.powertrainCombustionEngineSpeed === 'number'
                ? s.powertrainCombustionEngineSpeed
                : null,
            throttlePosition:
              typeof s.obdThrottlePosition === 'number'
                ? s.obdThrottlePosition
                : null,
            engineLoad:
              typeof s.obdEngineLoad === 'number' ? s.obdEngineLoad : null,
            tractionBatteryPowerKw: w != null ? w / 1000 : null,
          };
        })
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `High frequency fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  buildSegmentId(tokenId: number, startTimestamp: string): string {
    return `dimo-seg-${tokenId}-${new Date(startTimestamp).getTime()}`;
  }

  /**
   * V3 LTE_R1 — Fetch native driving event signals from DIMO Telemetry API.
   *
   * Returns only 1-second samples where at least one harsh-event signal is
   * truthy (> 0).  Samples where all event signals are null or 0 are excluded.
   *
   * Signal mapping:
   *   safetySystemBrakingHarshBraking        → HARSH_BRAKING
   *   safetySystemBrakingExtremeEmergency    → EXTREME_BRAKING
   *   safetySystemAccelerationHarshAcceleration → HARSH_ACCELERATION
   *   safetySystemCorneringHarshCornering    → HARSH_CORNERING
   */
  async fetchDrivingEvents(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<DimoNativeDrivingEventSample[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildDrivingEventsQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];
      return signals
        .filter(
          (s: any) =>
            s.timestamp &&
            ((s.safetySystemBrakingHarshBraking != null && s.safetySystemBrakingHarshBraking > 0) ||
              (s.safetySystemBrakingExtremeEmergency != null && s.safetySystemBrakingExtremeEmergency > 0) ||
              (s.safetySystemAccelerationHarshAcceleration != null && s.safetySystemAccelerationHarshAcceleration > 0) ||
              (s.safetySystemCorneringHarshCornering != null && s.safetySystemCorneringHarshCornering > 0)),
        )
        .map((s: any) => ({
          timestamp: s.timestamp,
          safetySystemBrakingHarshBraking: typeof s.safetySystemBrakingHarshBraking === 'number' ? s.safetySystemBrakingHarshBraking : null,
          safetySystemBrakingExtremeEmergency: typeof s.safetySystemBrakingExtremeEmergency === 'number' ? s.safetySystemBrakingExtremeEmergency : null,
          safetySystemAccelerationHarshAcceleration: typeof s.safetySystemAccelerationHarshAcceleration === 'number' ? s.safetySystemAccelerationHarshAcceleration : null,
          safetySystemCorneringHarshCornering: typeof s.safetySystemCorneringHarshCornering === 'number' ? s.safetySystemCorneringHarshCornering : null,
          speed: typeof s.speed === 'number' ? s.speed : null,
        }))
        .sort((a: DimoNativeDrivingEventSample, b: DimoNativeDrivingEventSample) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(`Driving events fetch failed for tokenId=${tokenId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch a broader window of TripDetectionCore data centred around a
   * POSSIBLE_END candidate timestamp.  Used exclusively for targeted
   * CUSUM trip-end validation — NOT for continuous live tracking.
   *
   * @param tokenId     DIMO vehicle token
   * @param centreAt    Timestamp of the POSSIBLE_END candidate
   * @param lookbackMs  How far before centreAt to fetch (default 15 min)
   * @param lookaheadMs How far after centreAt to fetch (default 5 min)
   */
  async fetchEndValidationWindow(
    tokenId: number,
    centreAt: Date,
    lookbackMs = 15 * 60_000,
    lookaheadMs = 5 * 60_000,
  ): Promise<TripCoreDataPoint[]> {
    const from = new Date(centreAt.getTime() - lookbackMs);
    const to = new Date(centreAt.getTime() + lookaheadMs);
    return this.fetchRawTripCoreData(tokenId, from, to);
  }

  /**
   * Find the reading with the timestamp closest to a target time.
   */
  static closestReading<T extends { timestamp: string }>(
    readings: T[],
    targetTime: Date,
  ): T | null {
    if (readings.length === 0) return null;
    const targetMs = targetTime.getTime();
    let best = readings[0];
    let bestDelta = Math.abs(new Date(best.timestamp).getTime() - targetMs);
    for (let i = 1; i < readings.length; i++) {
      const delta = Math.abs(
        new Date(readings[i].timestamp).getTime() - targetMs,
      );
      if (delta < bestDelta) {
        best = readings[i];
        bestDelta = delta;
      }
    }
    return best;
  }

  /**
   * Fetches low-voltage battery + RPM time series around a crank event.
   * Used by BatteryV2Service for start/crank feature extraction only.
   */
  async fetchCrankWindow(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<CrankDataPoint[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildBatteryCrankQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const signals: any[] = result?.data?.signals ?? [];

      return signals
        .filter((s: any) => s.timestamp)
        .map((s: any) => ({
          timestamp: s.timestamp,
          voltage:
            typeof s.lowVoltageBatteryCurrentVoltage === 'number'
              ? s.lowVoltageBatteryCurrentVoltage
              : null,
          rpm:
            typeof s.powertrainCombustionEngineSpeed === 'number'
              ? s.powertrainCombustionEngineSpeed
              : null,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Battery crank window fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }
}
