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
import {
  buildDrivingEventsQuery,
  type DimoVehicleEventRecord,
} from './queries/driving-events.query';
import {
  buildTripSegmentsQuery,
  type DimoDetectionMechanism,
} from './queries/trip-segments.query';
import { buildEnergyEventSegmentsQuery } from './queries/energy-event-segments.query';

// ── V3 LTE_R1: native DIMO driving event record ────────────────────────────
// Re-exported for downstream consumers. Historically this interface was
// named `DimoNativeDrivingEventSample` and modelled a VSS-style signal row
// with per-name numeric counters (safetySystem*). That query path does not
// exist on DIMO GraphQL and returned HTTP 422. The canonical shape is now
// an Event record (name + metadata) as returned by `events(...)`.
// The legacy alias is kept (pointing at the new type) to avoid breaking any
// external imports during the migration window.
export type DimoNativeDrivingEventSample = DimoVehicleEventRecord;
export type { DimoVehicleEventRecord };

// ── Fuel consumption summary computed from DIMO fuel-level signals ────────
export interface DimoFuelSummary {
  /** First non-null powertrainFuelSystemAbsoluteLevel inside the trip window. */
  startAbsoluteLiters: number | null;
  /** Last non-null powertrainFuelSystemAbsoluteLevel inside the trip window. */
  endAbsoluteLiters: number | null;
  /** First non-null powertrainFuelSystemRelativeLevel (%) inside the trip window. */
  startRelativePct: number | null;
  /** Last non-null powertrainFuelSystemRelativeLevel (%) inside the trip window. */
  endRelativePct: number | null;
  /** Absolute time of the first fuel sample captured (for confidence). */
  startSampleAt: string | null;
  /** Absolute time of the last fuel sample captured (for confidence). */
  endSampleAt: string | null;
  /** True when endAbsolute - startAbsolute > refuel threshold (tank grew). */
  refuelDetected: boolean;
  /**
   * Liters actually consumed on the trip.  Positive values only; if a refuel
   * is detected or we can't compute a delta, this stays null.
   */
  fuelUsedLiters: number | null;
  /**
   * Confidence label.  `high` / `medium` / `low` when an absolute-level delta
   * was computed.  `single_sample` when only one absolute sample exists
   * (delta unknowable).  `null` when there is no absolute sample at all —
   * in that case the caller may still use `startRelativePct` / `endRelativePct`
   * together with the vehicle's tank capacity for a relative-level fallback.
   */
  confidence: 'high' | 'medium' | 'low' | 'single_sample' | null;
  /** How many non-null absolute-level samples were available in the window. */
  absoluteSampleCount: number;
  /** How many non-null relative-level samples were available in the window. */
  relativeSampleCount: number;
}

export interface CrankDataPoint {
  timestamp: string;
  voltage: number | null;
  rpm: number | null;
}

// ── Core data point from 20-second trip detection buckets ──
export interface TripCoreDataPoint {
  timestamp: string;
  // nullable: DIMO returns no ignition value for EVs (e.g. Tesla).
  // Coercing to false would mask "unknown" as "off" and falsely trigger
  // ignition-off-based end detection.
  isIgnitionOn: boolean | null;
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

// ── Energy-event segment (refuel / recharge) ──
// Emitted by DIMO's native RefuelDetector / RechargeDetector. Unlike trip
// segments this represents a STATIONARY window during which the fuel tank or
// the traction battery gained energy. The fuel/SoC deltas are derived from
// MIN/MAX aggregates of the canonical signals inside the segment bounds.
export interface DimoEnergyEventSegment {
  segmentId: string;
  mechanism: Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>;
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
  // Refuel-specific (null for recharge segments)
  fuelStartLiters: number | null;
  fuelEndLiters: number | null;
  fuelDeltaLiters: number | null;
  fuelStartPercent: number | null;
  fuelEndPercent: number | null;
  fuelDeltaPercent: number | null;
  // Recharge-specific (null for refuel segments)
  socStartPercent: number | null;
  socEndPercent: number | null;
  socDeltaPercent: number | null;
  energyStartKwh: number | null;
  energyEndKwh: number | null;
  energyDeltaKwh: number | null;
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
  // Order matters: changePointDetection is the most robust historical
  // mechanism, frequencyAnalysis catches sparse-signal trips, and
  // ignitionDetection is the tie-breaker for ICE vehicles with clean
  // ignition transitions. Previously ignitionDetection was declared on the
  // DIMO API but never iterated — missing many repairable trips.
  private readonly segmentMechanismFallbackOrder: DimoDetectionMechanism[] = [
    'changePointDetection',
    'frequencyAnalysis',
    'ignitionDetection',
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

  /**
   * Fetch energy-event segments (refuel / recharge) from DIMO's native
   * detectors. Combines both mechanisms by default and returns a flat,
   * chronologically sorted list of segments — one row per detected event.
   */
  async fetchEnergyEventSegments(
    tokenId: number,
    from: Date,
    to: Date,
    mechanisms: Array<Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>> = [
      'refuel',
      'recharge',
    ],
  ): Promise<DimoEnergyEventSegment[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const collected: DimoEnergyEventSegment[] = [];
    for (const mechanism of mechanisms) {
      const segments = await this.fetchEnergyEventSegmentsWithJwt(
        jwt,
        tokenId,
        from,
        to,
        mechanism,
      );
      collected.push(...segments);
    }

    return collected.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  private async fetchEnergyEventSegmentsWithJwt(
    jwt: string,
    tokenId: number,
    from: Date,
    to: Date,
    mechanism: Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>,
  ): Promise<DimoEnergyEventSegment[]> {
    const query = buildEnergyEventSegmentsQuery(tokenId, from, to, mechanism);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const segments: any[] = result?.data?.segments ?? [];
      return segments
        .map((segment) => this.parseEnergyEventSegment(tokenId, mechanism, segment))
        .filter((s): s is DimoEnergyEventSegment => s != null);
    } catch (err: any) {
      this.logger.warn(
        `Energy-event segment fetch failed for tokenId=${tokenId} mechanism=${mechanism}: ${err.message}`,
      );
      return [];
    }
  }

  private parseEnergyEventSegment(
    tokenId: number,
    mechanism: Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>,
    segment: any,
  ): DimoEnergyEventSegment | null {
    const startTimestamp =
      typeof segment?.start?.timestamp === 'string' ? segment.start.timestamp : null;
    if (!startTimestamp) return null;
    const endTimestamp =
      typeof segment?.end?.timestamp === 'string' ? segment.end.timestamp : null;

    const signalValues = this.groupNumericSignalValues(segment?.signals);
    const pick = (name: string): { min: number | null; max: number | null } => {
      const values = signalValues.get(name) ?? [];
      if (values.length === 0) return { min: null, max: null };
      return { min: Math.min(...values), max: Math.max(...values) };
    };

    const odometer = pick('powertrainTransmissionTravelledDistance');
    const fuelAbs = pick('powertrainFuelSystemAbsoluteLevel');
    const fuelRel = pick('powertrainFuelSystemRelativeLevel');
    const soc = pick('powertrainTractionBatteryStateOfChargeCurrent');
    const energy = pick('powertrainTractionBatteryStateOfChargeCurrentEnergy');

    const posDelta = (min: number | null, max: number | null): number | null =>
      min != null && max != null && max > min ? max - min : null;

    return {
      segmentId: `dimo-${mechanism}-${tokenId}-${new Date(startTimestamp).getTime()}`,
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
      odometerStartKm: odometer.min,
      odometerEndKm: odometer.max,
      fuelStartLiters: mechanism === 'refuel' ? fuelAbs.min : null,
      fuelEndLiters: mechanism === 'refuel' ? fuelAbs.max : null,
      fuelDeltaLiters:
        mechanism === 'refuel' ? posDelta(fuelAbs.min, fuelAbs.max) : null,
      fuelStartPercent: mechanism === 'refuel' ? fuelRel.min : null,
      fuelEndPercent: mechanism === 'refuel' ? fuelRel.max : null,
      fuelDeltaPercent:
        mechanism === 'refuel' ? posDelta(fuelRel.min, fuelRel.max) : null,
      socStartPercent: mechanism === 'recharge' ? soc.min : null,
      socEndPercent: mechanism === 'recharge' ? soc.max : null,
      socDeltaPercent:
        mechanism === 'recharge' ? posDelta(soc.min, soc.max) : null,
      energyStartKwh: mechanism === 'recharge' ? energy.min : null,
      energyEndKwh: mechanism === 'recharge' ? energy.max : null,
      energyDeltaKwh:
        mechanism === 'recharge' ? posDelta(energy.min, energy.max) : null,
    };
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
          // Preserve null when DIMO provides no ignition signal (EVs).
          // Only coerce to boolean when a numeric value is present.
          isIgnitionOn:
            typeof s.isIgnitionOn === 'number' ? s.isIgnitionOn >= 0.5 : null,
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
   * V3 LTE_R1 — Fetch native driving events from DIMO Telemetry API.
   *
   * Uses the canonical `events(tokenId, from, to, filter)` GraphQL query with
   * a server-side name filter restricted to `behavior.*`.
   *
   * Return shape is `DimoVehicleEventRecord` per event. Name → DrivingEventType
   * mapping is performed by the caller (see LteR1BehaviorEnrichmentService).
   *
   * Historical note: a prior `signals(safetySystem*)` query path was removed
   * in 2026-04 — those fields never existed on DIMO's SignalAggregations type
   * and silently returned HTTP 422, causing zero event ingestion for every
   * LTE_R1 vehicle since launch.
   */
  async fetchDrivingEvents(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<DimoVehicleEventRecord[]> {
    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return [];

    const query = buildDrivingEventsQuery(tokenId, from, to);
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      const events: any[] = result?.data?.events ?? [];
      return events
        .filter((e: any) => typeof e?.timestamp === 'string' && typeof e?.name === 'string')
        .map((e: any): DimoVehicleEventRecord => ({
          timestamp: e.timestamp,
          name: e.name,
          source: typeof e.source === 'string' ? e.source : '',
          durationNs: typeof e.durationNs === 'number' ? e.durationNs : 0,
          metadata: typeof e.metadata === 'string' ? e.metadata : null,
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    } catch (err: any) {
      this.logger.warn(
        `Driving events fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Compute fuel-consumption summary for a trip window using DIMO's fuel-
   * level signals (`powertrainFuelSystemAbsoluteLevel` in liters and
   * `powertrainFuelSystemRelativeLevel` in percent).
   *
   * Why this method exists:
   *   The TripDetection FSM captures a `startFuelLevel` only when the
   *   ignition transition at trip-start also carries a fresh fuel sample.
   *   On LTE_R1 vehicles DIMO batches fuel readings every ~10–60 s, so the
   *   start snapshot is frequently null even for healthy trips.  Instead of
   *   relying on the FSM snapshot, we re-query the trip window after it has
   *   ended and pick the first/last absolute fuel samples, then compute
   *   consumption (`fuelUsedLiters = startAbs - endAbs`, clamped to >= 0).
   *
   * Confidence classification:
   *   - `high`          : first sample within 5 min of startTime, last sample
   *                       within 5 min of endTime, ≥ 2 absolute samples.
   *   - `medium`        : first/last sample within 15 min of trip boundaries.
   *   - `low`           : samples present but outside the 15-min window.
   *   - `single_sample` : exactly 1 absolute sample — delta cannot be derived
   *                       reliably (falls through to relative fallback upstream).
   *   - `null`          : no absolute sample at all.
   *
   * Refuel guard (tightened V4.6.46):
   *   Flag an in-trip refuel only when `endAbsolute > startAbsolute + 2.0 L`
   *   AND the trip window is at least 3 min long.  A single noisy 30 s AVG
   *   bucket on a very short trip no longer silently kills the whole trip.
   */
  async fetchFuelSummary(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<DimoFuelSummary> {
    const empty: DimoFuelSummary = {
      startAbsoluteLiters: null,
      endAbsoluteLiters: null,
      startRelativePct: null,
      endRelativePct: null,
      startSampleAt: null,
      endSampleAt: null,
      refuelDetected: false,
      fuelUsedLiters: null,
      confidence: null,
      absoluteSampleCount: 0,
      relativeSampleCount: 0,
    };

    const jwt = await this.auth.getVehicleJwt(tokenId);
    if (!jwt) return empty;

    const query = `
      query TripFuelSummary {
        signals(
          tokenId: ${tokenId}
          from: "${from.toISOString()}"
          to: "${to.toISOString()}"
          interval: "30s"
        ) {
          timestamp
          powertrainFuelSystemAbsoluteLevel(agg: AVG)
          powertrainFuelSystemRelativeLevel(agg: AVG)
        }
      }
    `.trim();

    let signals: any[] = [];
    try {
      const result = await this.telemetry.queryGraphQL(jwt, query);
      signals = Array.isArray(result?.data?.signals) ? result.data.signals : [];
    } catch (err: any) {
      this.logger.warn(
        `Fuel summary fetch failed for tokenId=${tokenId}: ${err.message}`,
      );
      return empty;
    }

    const ordered = signals
      .filter((s: any) => typeof s?.timestamp === 'string')
      .sort(
        (a: any, b: any) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    let firstAbs: { value: number; at: string } | null = null;
    let lastAbs: { value: number; at: string } | null = null;
    let firstRel: number | null = null;
    let lastRel: number | null = null;
    let absoluteSampleCount = 0;
    let relativeSampleCount = 0;

    for (const s of ordered) {
      const abs =
        typeof s.powertrainFuelSystemAbsoluteLevel === 'number'
          ? s.powertrainFuelSystemAbsoluteLevel
          : null;
      const rel =
        typeof s.powertrainFuelSystemRelativeLevel === 'number'
          ? s.powertrainFuelSystemRelativeLevel
          : null;

      if (abs != null) {
        absoluteSampleCount++;
        if (firstAbs == null) firstAbs = { value: abs, at: s.timestamp };
        lastAbs = { value: abs, at: s.timestamp };
      }
      if (rel != null) {
        relativeSampleCount++;
        if (firstRel == null) firstRel = rel;
        lastRel = rel;
      }
    }

    if (firstAbs == null || lastAbs == null) {
      // Fall back to relative-only info so the caller can still store status
      // and, if tank capacity is known, derive liters from the % delta.
      return {
        ...empty,
        startRelativePct: firstRel,
        endRelativePct: lastRel,
        relativeSampleCount,
      };
    }

    // Single-sample guard: first === last, so delta is unknowable.  Keep the
    // absolute values visible but mark confidence explicitly; upstream can
    // either fall back to relative-% or leave the trip untouched.
    if (absoluteSampleCount < 2) {
      return {
        startAbsoluteLiters: firstAbs.value,
        endAbsoluteLiters: lastAbs.value,
        startRelativePct: firstRel,
        endRelativePct: lastRel,
        startSampleAt: firstAbs.at,
        endSampleAt: lastAbs.at,
        refuelDetected: false,
        fuelUsedLiters: null,
        confidence: 'single_sample',
        absoluteSampleCount,
        relativeSampleCount,
      };
    }

    const delta = firstAbs.value - lastAbs.value;
    const tripDurationMs = to.getTime() - from.getTime();
    // Tightened refuel guard (V4.6.46): require meaningful tank growth AND
    // at least 3 min of trip so noisy single buckets don't kill short trips.
    const refuelDetected =
      lastAbs.value - firstAbs.value > 2.0 && tripDurationMs >= 180_000;
    const fuelUsedLiters = refuelDetected ? null : delta > 0 ? delta : 0;

    const boundaryDeltaMsStart = Math.abs(
      new Date(firstAbs.at).getTime() - from.getTime(),
    );
    const boundaryDeltaMsEnd = Math.abs(
      new Date(lastAbs.at).getTime() - to.getTime(),
    );

    let confidence: 'high' | 'medium' | 'low' | null;
    if (fuelUsedLiters == null) {
      confidence = 'low';
    } else if (
      boundaryDeltaMsStart <= 5 * 60_000 &&
      boundaryDeltaMsEnd <= 5 * 60_000
    ) {
      confidence = 'high';
    } else if (
      boundaryDeltaMsStart <= 15 * 60_000 &&
      boundaryDeltaMsEnd <= 15 * 60_000
    ) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      startAbsoluteLiters: firstAbs.value,
      endAbsoluteLiters: lastAbs.value,
      startRelativePct: firstRel,
      endRelativePct: lastRel,
      startSampleAt: firstAbs.at,
      endSampleAt: lastAbs.at,
      refuelDetected,
      fuelUsedLiters,
      confidence,
      absoluteSampleCount,
      relativeSampleCount,
    };
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
