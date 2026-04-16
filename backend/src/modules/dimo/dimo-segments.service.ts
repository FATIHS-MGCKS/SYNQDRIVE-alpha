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
import {
  buildTripSegmentsQuery,
  type DimoDetectionMechanism,
} from './queries/trip-segments.query';

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

export interface DimoTripSegment {
  segmentId: string;
  mechanism: DimoDetectionMechanism;
  startTime: string;
  endTime: string | null;
  isOngoing: boolean;
  startedBeforeRange: boolean;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  distanceKm: number | null;
  maxSpeedKmh: number | null;
}

// ── Detected trip segment ──
/** @internal No longer used — kept only as type reference for migration compatibility. Remove in next major cleanup. */
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

@Injectable()
export class DimoSegmentsService {
  private readonly logger = new Logger(DimoSegmentsService.name);
  private readonly segmentMechanismFallbackOrder: DimoDetectionMechanism[] = [
    'changePointDetection',
    'frequencyAnalysis',
  ];

  constructor(
    private readonly auth: DimoAuthService,
    private readonly telemetry: DimoTelemetryService,
  ) {}

  // V1 trip detection (fetchAndDetectTrips, detectTrips, finalizeTrip) REMOVED.
  // Replaced by: TripReconciliationService (repair layer) + V2 FSM (live engine).
  // See: trips/reconciliation/trip-reconciliation.service.ts

  async fetchTripSegments(
    tokenId: number,
    from: Date,
    to: Date,
    mechanisms: DimoDetectionMechanism[] = this.segmentMechanismFallbackOrder,
  ): Promise<DimoTripSegment[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    for (const mechanism of mechanisms) {
      const segments = await this.fetchTripSegmentsWithJwt(
        jwt,
        tokenId,
        from,
        to,
        mechanism,
      );
      if (segments.length > 0) {
        return segments;
      }
    }

    return [];
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

  private async fetchTripSegmentsWithJwt(
    jwt: string,
    tokenId: number,
    from: Date,
    to: Date,
    mechanism: DimoDetectionMechanism,
  ): Promise<DimoTripSegment[]> {
    const query = buildTripSegmentsQuery(tokenId, from, to, mechanism);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const segments: any[] = result?.data?.segments ?? [];
      return segments
        .map((segment) => this.parseTripSegment(tokenId, mechanism, segment))
        .filter((segment): segment is DimoTripSegment => segment != null)
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Trip segment fetch failed for tokenId=${tokenId} mechanism=${mechanism}: ${err.message}`,
      );
      return [];
    }
  }

  private parseTripSegment(
    tokenId: number,
    mechanism: DimoDetectionMechanism,
    segment: any,
  ): DimoTripSegment | null {
    const startTimestamp =
      typeof segment?.start?.timestamp === 'string'
        ? segment.start.timestamp
        : null;
    if (!startTimestamp) return null;

    const endTimestamp =
      typeof segment?.end?.timestamp === 'string' ? segment.end.timestamp : null;
    const signalValues = this.groupNumericSignalValues(segment?.signals);
    const odometerValues =
      signalValues.get('powertrainTransmissionTravelledDistance') ?? [];
    const speedValues = signalValues.get('speed') ?? [];

    const odometerStartKm = odometerValues.length > 0 ? Math.min(...odometerValues) : null;
    const odometerEndKm = odometerValues.length > 0 ? Math.max(...odometerValues) : null;
    const distanceKm =
      odometerStartKm != null &&
      odometerEndKm != null &&
      odometerEndKm >= odometerStartKm
        ? odometerEndKm - odometerStartKm
        : null;

    return {
      segmentId: this.buildSegmentId(tokenId, startTimestamp),
      mechanism,
      startTime: startTimestamp,
      endTime: endTimestamp,
      isOngoing: segment?.isOngoing === true,
      startedBeforeRange: segment?.startedBeforeRange === true,
      durationSeconds:
        typeof segment?.duration === 'number' ? segment.duration : 0,
      startLatitude:
        typeof segment?.start?.value?.latitude === 'number'
          ? segment.start.value.latitude
          : null,
      startLongitude:
        typeof segment?.start?.value?.longitude === 'number'
          ? segment.start.value.longitude
          : null,
      endLatitude:
        typeof segment?.end?.value?.latitude === 'number'
          ? segment.end.value.latitude
          : null,
      endLongitude:
        typeof segment?.end?.value?.longitude === 'number'
          ? segment.end.value.longitude
          : null,
      odometerStartKm,
      odometerEndKm,
      distanceKm,
      maxSpeedKmh: speedValues.length > 0 ? Math.max(...speedValues) : null,
    };
  }

  private groupNumericSignalValues(
    signals: unknown,
  ): Map<string, number[]> {
    const grouped = new Map<string, number[]>();
    const rows = Array.isArray(signals) ? signals : [];

    for (const row of rows) {
      const name =
        typeof (row as { name?: unknown })?.name === 'string'
          ? ((row as { name: string }).name as string)
          : null;
      const value =
        typeof (row as { value?: unknown })?.value === 'number'
          ? ((row as { value: number }).value as number)
          : null;

      if (!name || value == null) continue;

      const list = grouped.get(name) ?? [];
      list.push(value);
      grouped.set(name, list);
    }

    return grouped;
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
