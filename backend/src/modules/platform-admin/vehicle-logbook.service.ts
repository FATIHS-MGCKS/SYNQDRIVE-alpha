import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class VehicleLogbookService {
  private readonly logger = new Logger(VehicleLogbookService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Vehicle list with logbook status ──────────────────────────────────

  async getVehicleList() {
    // Platform-wide admin view — capped to prevent pathological queries as the
    // platform grows. When this is hit, the view should paginate (future).
    const PLATFORM_LOGBOOK_HARD_LIMIT = 2000;
    const vehicles = await this.prisma.vehicle.findMany({
      include: {
        logbookConfig: true,
        latestState: { select: { lastSeenAt: true, online: true, updatedAt: true } },
        dimoVehicle: { select: { tokenId: true, connectionStatus: true } },
        tripDetectionState: { select: { state: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: PLATFORM_LOGBOOK_HARD_LIMIT,
    });

    return vehicles.map((v) => ({
      id: v.id,
      licensePlate: v.licensePlate,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      hardwareType: (v as any).hardwareType ?? 'UNKNOWN',
      connectionStatus: v.dimoVehicle?.connectionStatus ?? null,
      dimoTokenId: v.dimoVehicle?.tokenId ?? null,
      logbook: v.logbookConfig
        ? {
            enabled: v.logbookConfig.enabled && (!v.logbookConfig.expiresAt || v.logbookConfig.expiresAt > new Date()),
            enabledAt: v.logbookConfig.enabledAt,
            expiresAt: v.logbookConfig.expiresAt,
            enabledBy: v.logbookConfig.enabledBy,
            notes: v.logbookConfig.notes,
          }
        : { enabled: false, enabledAt: null, expiresAt: null, enabledBy: null, notes: null },
      lastSeen: v.latestState?.lastSeenAt ?? null,
      online: v.latestState?.online ?? false,
      tripState: v.tripDetectionState?.state ?? null,
    }));
  }

  // ── Enable / Disable ──────────────────────────────────────────────────

  async enableLogbook(vehicleId: string, durationHours: number, enabledBy?: string, notes?: string) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 3600_000);

    await this.prisma.vehicleLogbookConfig.upsert({
      where: { vehicleId },
      create: { vehicleId, enabled: true, enabledAt: now, expiresAt, enabledBy, notes },
      update: { enabled: true, enabledAt: now, expiresAt, enabledBy, notes },
    });

    return { vehicleId, enabled: true, enabledAt: now, expiresAt };
  }

  async disableLogbook(vehicleId: string) {
    await this.prisma.vehicleLogbookConfig.upsert({
      where: { vehicleId },
      create: { vehicleId, enabled: false },
      update: { enabled: false, expiresAt: null },
    });
    return { vehicleId, enabled: false };
  }

  // ── Full Detail Assembly ──────────────────────────────────────────────

  async getVehicleDetail(vehicleId: string) {
    const [vehicle, latestState, tripDetState, recentTrips, recentPollLogs, dtcEvents, batteryFeatures, hvBattery] =
      await Promise.all([
        this.prisma.vehicle.findUnique({
          where: { id: vehicleId },
          include: { dimoVehicle: true, logbookConfig: true },
        }),
        this.prisma.vehicleLatestState.findFirst({ where: { vehicleId } }),
        this.prisma.vehicleTripDetectionState.findUnique({ where: { vehicleId } }),
        this.prisma.vehicleTrip.findMany({
          where: { vehicleId },
          orderBy: { startTime: 'desc' },
          take: 10,
          select: {
            id: true, tripStatus: true, startTime: true, endTime: true,
            distanceKm: true, durationMinutes: true, avgSpeedKmh: true, maxSpeedKmh: true,
            enrichedAt: true, behaviorEnrichedAt: true,
            accelerationEventCount: true, brakingEventCount: true, abuseEventCount: true,
            speedingSectionCount: true, speedingPercent: true, maxOverSpeedKmh: true,
            driverName: true, detectionProfile: true,
            startDetectionMode: true, endDetectionMode: true,
            startConfidence: true, endConfidence: true,
          },
        }),
        this.prisma.dimoPollLog.findMany({
          where: { vehicleId },
          orderBy: { startedAt: 'desc' },
          take: 50,
        }),
        this.prisma.vehicleDtcEvent.findMany({
          where: { vehicleId },
          orderBy: { lastSeenAt: 'desc' },
          take: 20,
        }),
        this.prisma.batteryFeatures.findUnique({ where: { vehicleId } }),
        this.prisma.hvBatteryHealthCurrent.findUnique({ where: { vehicleId } }).catch(() => null),
      ]);

    if (!vehicle) return null;

    // ── Overview ───────────────────────────────────────
    const overview = {
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      hardwareType: (vehicle as any).hardwareType ?? 'UNKNOWN',
      connectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      dimoTokenId: vehicle.dimoVehicle?.tokenId ?? null,
      logbook: vehicle.logbookConfig ?? null,
      lastSeenAt: latestState?.lastSeenAt ?? null,
      online: latestState?.online ?? false,
      tripDetectionState: tripDetState?.state ?? 'UNKNOWN',
      activeTripId: tripDetState?.activeTripId ?? null,
      detectionProfile: tripDetState?.detectionProfile ?? null,
      lastSnapshotEvidence: tripDetState?.lastSnapshotEvidenceAt ?? null,
      lvBatteryTracking: batteryFeatures != null,
      hvBatteryTracking: hvBattery != null,
      lvPublicationState: batteryFeatures?.publicationState ?? null,
      hvPublicationState: hvBattery?.publicationState ?? null,
    };

    // ── Signal Groups / Coverage ──────────────────────
    const signalCoverage = this.analyzeSignalCoverage(latestState);

    // ── Workers & Timeline ────────────────────────────
    const timeline = recentPollLogs.map((log) => ({
      id: log.id,
      timestamp: log.startedAt,
      jobType: log.jobType,
      status: log.status,
      durationMs: log.durationMs,
      errorMessage: log.errorMessage,
      meta: log.metaJson,
    }));

    // ── Trip Detection ────────────────────────────────
    const tripDetection = tripDetState
      ? {
          state: tripDetState.state,
          detectionProfile: tripDetState.detectionProfile,
          activeTripId: tripDetState.activeTripId,
          possibleStartAt: tripDetState.possibleStartAt,
          possibleEndAt: tripDetState.possibleEndAt,
          lastActivityAt: tripDetState.lastActivityAt,
          lastSnapshotEvidenceAt: tripDetState.lastSnapshotEvidenceAt,
          lastMeaningfulMovementAt: tripDetState.lastMeaningfulMovementAt,
          endValidationAttempts: tripDetState.endValidationAttempts,
          cusumValidatedAt: tripDetState.cusumValidatedAt,
          startDetectionMode: tripDetState.startDetectionMode,
          startConfidence: tripDetState.startConfidence,
          endDetectionMode: tripDetState.endDetectionMode,
          endConfidence: tripDetState.endConfidence,
          lastEvidenceSummary: tripDetState.lastEvidenceSummary,
          updatedAt: tripDetState.updatedAt,
        }
      : null;

    // ── HF Analysis ──────────────────────────────────
    const hfAnalysis = recentTrips
      .filter((t) => t.behaviorEnrichedAt)
      .map((t) => ({
        tripId: t.id,
        startTime: t.startTime,
        endTime: t.endTime,
        enrichedAt: t.behaviorEnrichedAt,
        accelerationEvents: t.accelerationEventCount,
        brakingEvents: t.brakingEventCount,
        abuseEvents: t.abuseEventCount,
        detectionProfile: t.detectionProfile,
      }));

    // ── DTC ──────────────────────────────────────────
    const dtcInfo = {
      lastPollAt: latestState?.lastDtcPollAt ?? null,
      lastSuccessAt: latestState?.lastDtcSuccessfulCheckAt ?? null,
      pollStatus: latestState?.dtcPollStatus ?? null,
      pollError: latestState?.dtcPollError ?? null,
      activeCodes: dtcEvents.filter((e) => e.isActive),
      historicalCodes: dtcEvents.filter((e) => !e.isActive),
      rawObdList: latestState?.obdDtcList ?? null,
    };

    // ── Derived Fields / UI Mapping ──────────────────
    const uiMapping = this.buildUiMapping(latestState, batteryFeatures, hvBattery, tripDetState, dtcEvents);

    // ── Raw ──────────────────────────────────────────
    const rawPayload = latestState?.rawPayloadJson ?? null;

    return {
      overview,
      signalCoverage,
      timeline,
      recentTrips,
      tripDetection,
      hfAnalysis,
      dtcInfo,
      uiMapping,
      rawPayload,
    };
  }

  // ── Signal Coverage Analysis ──────────────────────────────────────────

  private analyzeSignalCoverage(state: any) {
    if (!state) return { groups: [], summary: 'No snapshot data available' };

    const fields: { name: string; field: string; group: string; uiUsage: string }[] = [
      { name: 'Speed', field: 'speedKmh', group: 'Core Telemetry', uiUsage: 'Fleet Status, Trip Detection' },
      { name: 'Odometer', field: 'odometerKm', group: 'Core Telemetry', uiUsage: 'Fleet Status, Health Calcs' },
      { name: 'Location (Lat)', field: 'latitude', group: 'Core Telemetry', uiUsage: 'Fleet Map, Trips' },
      { name: 'Location (Lng)', field: 'longitude', group: 'Core Telemetry', uiUsage: 'Fleet Map, Trips' },
      { name: 'Ignition', field: 'isIgnitionOn', group: 'Core Telemetry', uiUsage: 'Trip Detection' },
      { name: 'Engine Load', field: 'engineLoad', group: 'Core Telemetry', uiUsage: 'Trip Detection, Perf' },
      { name: 'Fuel Level (%)', field: 'fuelLevelRelative', group: 'Fuel / Energy', uiUsage: 'Fleet Status, Vehicle Overview' },
      { name: 'Fuel Level (L)', field: 'fuelLevelAbsolute', group: 'Fuel / Energy', uiUsage: 'Trip Fuel Tracking' },
      { name: 'EV SoC (%)', field: 'evSoc', group: 'Fuel / Energy', uiUsage: 'Fleet Status, HV Battery' },
      { name: 'Range (km)', field: 'rangeKm', group: 'Fuel / Energy', uiUsage: 'Fleet Status' },
      { name: '12V Battery (V)', field: 'lvBatteryVoltage', group: 'Battery', uiUsage: 'LV Battery Health' },
      { name: 'Coolant Temp (°C)', field: 'coolantTempC', group: 'Engine', uiUsage: 'HF Enrichment, Abuse' },
      { name: 'Oil Level', field: 'oilLevelRelative', group: 'Engine', uiUsage: 'Vehicle Health' },
      { name: 'DEF Level', field: 'defLevel', group: 'Engine', uiUsage: 'Vehicle Health' },
      { name: 'Tire FL', field: 'tirePressureFl', group: 'Tires', uiUsage: 'Tire Health' },
      { name: 'Tire FR', field: 'tirePressureFr', group: 'Tires', uiUsage: 'Tire Health' },
      { name: 'Tire RL', field: 'tirePressureRl', group: 'Tires', uiUsage: 'Tire Health' },
      { name: 'Tire RR', field: 'tirePressureRr', group: 'Tires', uiUsage: 'Tire Health' },
    ];

    const signals = fields.map((f) => ({
      ...f,
      value: state[f.field] ?? null,
      present: state[f.field] != null,
      lastUpdated: state.updatedAt,
    }));

    const present = signals.filter((s) => s.present).length;
    const total = signals.length;
    const summary = `${present}/${total} signals present (${Math.round((present / total) * 100)}%)`;

    const groups = [...new Set(fields.map((f) => f.group))].map((g) => {
      const groupSignals = signals.filter((s) => s.group === g);
      const gPresent = groupSignals.filter((s) => s.present).length;
      return {
        name: g,
        signals: groupSignals,
        present: gPresent,
        total: groupSignals.length,
        status: gPresent === groupSignals.length ? 'healthy' : gPresent > 0 ? 'partial' : 'missing',
      };
    });

    return { groups, summary, lastUpdated: state.updatedAt };
  }

  // ── UI Field Mapping ──────────────────────────────────────────────────

  private buildUiMapping(state: any, battery: any, hvBattery: any, tripDet: any, dtcEvents: any[]) {
    const mappings: {
      uiField: string;
      page: string;
      backendField: string;
      signalOrigin: string;
      value: any;
      lastUpdated: string | null;
      status: 'healthy' | 'missing_signal' | 'null_value' | 'stale' | 'unsupported';
      reason: string;
    }[] = [];

    const add = (uiField: string, page: string, backendField: string, signalOrigin: string, value: any, lastUpdated: any) => {
      let status: any = 'healthy';
      let reason = 'Signal present and current';
      if (value == null) {
        status = 'null_value';
        reason = `${backendField} is null — signal "${signalOrigin}" not present in latest snapshot`;
      } else if (lastUpdated && Date.now() - new Date(lastUpdated).getTime() > 600_000) {
        status = 'stale';
        reason = `Last updated ${Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000)}min ago — snapshot may be delayed`;
      }
      mappings.push({ uiField, page, backendField, signalOrigin, value, lastUpdated: lastUpdated?.toISOString?.() ?? lastUpdated ?? null, status, reason });
    };

    const lu = state?.updatedAt ?? null;
    add('Fuel %', 'Fleet Status / Vehicle Overview', 'fuelLevelRelative', 'powertrainFuelSystemRelativeLevel', state?.fuelLevelRelative, lu);
    add('EV SoC %', 'Fleet Status / Vehicle Overview', 'evSoc', 'powertrainTractionBatteryStateOfChargeCurrent', state?.evSoc, lu);
    add('Odometer', 'Fleet Status / Vehicle Detail', 'odometerKm', 'chassisAxleRow1WheelRightTirePressure → aftermarket.odo', state?.odometerKm, lu);
    add('Speed', 'Fleet Status', 'speedKmh', 'chassisSpeed', state?.speedKmh, lu);
    add('Location', 'Fleet Map / Address', 'latitude+longitude', 'currentLocationCoordinates', state?.latitude != null ? `${state.latitude?.toFixed(4)},${state.longitude?.toFixed(4)}` : null, lu);
    add('12V Battery', 'Vehicle Health Box', 'lvBatteryVoltage', 'lowVoltageBatteryCurrentVoltage', state?.lvBatteryVoltage, lu);
    add('12V SOH', 'Health Tab / Battery Card', 'publishedSohPct', 'computed from rest/crank features', battery?.publishedSohPct, battery?.updatedAt);
    add('12V Pub State', 'Health Tab / Battery Card', 'publicationState', 'computed maturity', battery?.publicationState, battery?.updatedAt);
    add('HV SOH', 'Health Tab / HV Card', 'publishedSohPct', 'computed from SoC snapshots', hvBattery?.publishedSohPct, hvBattery?.updatedAt);
    add('HV Pub State', 'Health Tab / HV Card', 'publicationState', 'computed maturity', hvBattery?.publicationState, hvBattery?.updatedAt);
    add('Trip State', 'Internal / Trip Detection', 'state', 'snapshot evidence → state machine', tripDet?.state, tripDet?.updatedAt);
    add('Active DTC Count', 'Vehicle Health / Error Codes', 'vehicleDtcEvent.isActive', 'obdDTCList polling', dtcEvents.filter((e: any) => e.isActive).length, state?.lastDtcPollAt);
    add('Coolant Temp', 'HF Enrichment / Abuse Detection', 'coolantTempC', 'obd.engineCoolantTemperature', state?.coolantTempC, lu);
    add('Ignition', 'Trip Detection Evidence', 'isIgnitionOn', 'dimoAftermarket.*.isLocationTrusted or powertrainCombustionEngineIsRunning', state?.isIgnitionOn, lu);
    add('Oil Level', 'Vehicle Health', 'oilLevelRelative', 'obd.oilLevel', state?.oilLevelRelative, lu);

    return mappings;
  }
}
