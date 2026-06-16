import { Injectable, NotFoundException } from '@nestjs/common';
import type { VehicleLatestState } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ONLINE_MAX_MS, STANDBY_MAX_MS } from '@modules/vehicles/fleet-connectivity.util';
import { CLICKHOUSE_ANALYSIS_WINDOW_HOURS } from './data-analyse.constants';
import {
  SIGNAL_GROUP_DEFINITIONS,
  VEHICLE_LATEST_STATE_CATALOG,
} from './data-analyse-signal-catalog';
import {
  assessLaunchFeasibility,
  classifyDataFreshness,
  classifyHealthFreshness,
  classifyHfDetectionQuality,
  classifyIntervalStatus,
  computeIntervalStats,
  filterConnectedVehicles,
  formatSignalValue,
  tenantVehicleWhere,
} from './data-analyse.utils';
import type {
  DataAnalyseVehicleDto,
  HealthTraceDto,
  HighFrequencyAnalysisDto,
  LaunchFeasibilityDto,
  PipelineDto,
  SignalArrivalRowDto,
  SignalGroupDefinitionDto,
  TelemetryOverviewDto,
} from './data-analyse.types';

interface ClickHouseSnapshotStats {
  count: number;
  avgIntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  intervals: number[];
}

@Injectable()
export class DataAnalyseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickHouse: ClickHouseService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async listConnectedVehicles(orgId: string): Promise<DataAnalyseVehicleDto[]> {
    const fleet = await this.vehiclesService.getFleetConnectivity(orgId, {});
    const connected = filterConnectedVehicles(fleet.vehicles);
    return connected.map((v) => ({
      id: v.vehicleId,
      name:
        [v.make, v.model].filter(Boolean).join(' ').trim() ||
        v.licensePlate ||
        v.vehicleId,
      licensePlate: v.licensePlate,
      vin: v.vin,
      provider: v.provider ?? null,
      connectionStatus: v.connectionStatus,
      lastSeenAt: v.lastSeenAt,
      dimoTokenId: null,
    }));
  }

  async getTelemetryOverview(
    orgId: string,
    vehicleId: string,
  ): Promise<TelemetryOverviewDto> {
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    const signals = this.buildSignalRows(ctx.latestState, ctx.chStats, ctx.nowMs);
    const persisted = signals.filter((s) => s.persisted);
    const hfSignals = signals.filter(
      (s) =>
        s.persisted &&
        VEHICLE_LATEST_STATE_CATALOG.find((c) => c.signalName === s.signalName)
          ?.highFrequencyCandidate,
    );

    const chIntervals = ctx.chStats?.intervals ?? [];
    const intervalStats = computeIntervalStats(chIntervals);

    const missingExpected = VEHICLE_LATEST_STATE_CATALOG.filter((c) => {
      if (c.expectedIntervalMs == null) return false;
      const row = signals.find((s) => s.signalName === c.signalName);
      return !row?.persisted;
    }).map((c) => c.signalName);

    const lastSeenMs = ctx.latestState?.lastSeenAt?.getTime() ?? null;
    const freshness = classifyDataFreshness(
      lastSeenMs,
      ctx.nowMs,
      ONLINE_MAX_MS,
      STANDBY_MAX_MS,
    );

    const insufficientData = persisted.length < 3 || lastSeenMs == null;

    const notes: string[] = [];
    if (!this.clickHouse.isAvailable) {
      notes.push('ClickHouse unavailable — interval stats derived from latest-state timestamps only.');
    }
    if (insufficientData) {
      notes.push('Insufficient persisted signal coverage for reliable interval KPIs.');
    }

    return {
      lastTelemetryReceived: ctx.latestState?.lastSeenAt?.toISOString() ?? null,
      totalSignalsObserved: persisted.length,
      highFrequencySignalsObserved: hfSignals.length,
      averageObservedIntervalMs: intervalStats.averageMs,
      fastestObservedIntervalMs: intervalStats.fastestMs,
      slowestObservedIntervalMs: intervalStats.slowestMs,
      missingExpectedSignals: missingExpected,
      dataFreshnessStatus: freshness,
      insufficientData,
      notes,
    };
  }

  async getSignals(orgId: string, vehicleId: string): Promise<SignalArrivalRowDto[]> {
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    return this.buildSignalRows(ctx.latestState, ctx.chStats, ctx.nowMs);
  }

  async getHighFrequency(
    orgId: string,
    vehicleId: string,
  ): Promise<HighFrequencyAnalysisDto> {
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    const chAvailable = this.clickHouse.isAvailable;
    const waypointCount = await this.countWaypoints24h(vehicleId);

    const hfCatalog = VEHICLE_LATEST_STATE_CATALOG.filter((c) => c.highFrequencyCandidate);
    const signals = hfCatalog.map((entry) => {
      const state = ctx.latestState;
      const raw = state ? (state as Record<string, unknown>)[entry.field] : null;
      const hasValue = raw != null;
      const intervalStats = computeIntervalStats(ctx.chStats?.intervals ?? []);
      const quality = classifyHfDetectionQuality(
        intervalStats.averageMs,
        (waypointCount ?? 0) > 0,
      );
      const notes: string[] = [];
      if (!hasValue) {
        notes.push('Signal not currently persisted in vehicle_latest_states.');
      }
      if ((waypointCount ?? 0) === 0) {
        notes.push('No telemetry_waypoints rows in ClickHouse for analysis window.');
      }
      if (quality === 'Too sparse') {
        notes.push('Not sufficient for reliable launch-like start detection.');
      }

      let providerLatency: number | null = null;
      if (state?.sourceTimestamp && state?.providerFetchedAt) {
        providerLatency =
          state.providerFetchedAt.getTime() - state.sourceTimestamp.getTime();
      }

      return {
        signalName: entry.signalName,
        observedIntervalMs: intervalStats.averageMs,
        averageIntervalMs: intervalStats.averageMs,
        dropoutCount: intervalStats.dropoutCount,
        longestGapMs: intervalStats.longestGapMs,
        providerToBackendLatencyMs: providerLatency,
        detectionQuality: hasValue ? quality : ('Not available' as const),
        notes,
      };
    });

    const snapshotOnly = (waypointCount ?? 0) === 0;
    const anyHf = signals.some((s) => s.detectionQuality === 'Good for detection');

    return {
      available: anyHf || signals.some((s) => s.observedIntervalMs != null),
      message: snapshotOnly
        ? 'No high-frequency telemetry persisted for this vehicle. Only snapshot-level telemetry available.'
        : null,
      snapshotLevelOnly: snapshotOnly,
      clickHouseAvailable: chAvailable,
      signals,
      waypointCount24h: waypointCount,
    };
  }

  async getLaunchFeasibility(
    orgId: string,
    vehicleId: string,
  ): Promise<LaunchFeasibilityDto> {
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    const signalRows = this.buildSignalRows(ctx.latestState, ctx.chStats, ctx.nowMs);
    const available = signalRows.filter((s) => s.persisted).map((s) => s.signalName);

    if (ctx.latestState?.rawPayloadJson && typeof ctx.latestState.rawPayloadJson === 'object') {
      const keys = Object.keys(ctx.latestState.rawPayloadJson as Record<string, unknown>);
      for (const k of keys) {
        if (!available.includes(k)) available.push(k);
      }
    }

    const waypointCount = await this.countWaypoints24h(vehicleId);
    const intervalStats = computeIntervalStats(ctx.chStats?.intervals ?? []);
    const assessment = assessLaunchFeasibility({
      availableSignalNames: available,
      speedIntervalMs: intervalStats.averageMs,
      hasWaypointStream: (waypointCount ?? 0) > 0,
      snapshotOnly: (waypointCount ?? 0) === 0,
    });

    const providerLimitations: string[] = [];
    if (ctx.latestState?.providerSource) {
      providerLimitations.push(`Provider: ${ctx.latestState.providerSource}`);
    }
    if ((waypointCount ?? 0) === 0) {
      providerLimitations.push('HF waypoint stream not persisted — DIMO TELEMETRY_EVENTS path may still apply.');
    }

    return {
      feasibility: assessment.feasibility,
      availableSignals: available,
      missingSignals: assessment.missingSignals,
      observedIntervals: {
        snapshot_poll: intervalStats.averageMs,
        speed: intervalStats.averageMs,
      },
      minimumViableIntervalMs: 500,
      providerLimitations,
      recommendation: assessment.recommendation,
      reasons: assessment.reasons,
    };
  }

  async getHealthTrace(orgId: string, vehicleId: string): Promise<HealthTraceDto> {
    await this.assertVehicle(orgId, vehicleId);
    const nowMs = Date.now();

    const [brake, tireSetup, hvBattery, lvSnapshot, drivingImpact, eventCounts] =
      await Promise.all([
        this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } }),
        this.prisma.vehicleTireSetup.findFirst({
          where: { vehicleId, status: 'ACTIVE' },
        }),
        this.prisma.hvBatteryHealthCurrent.findUnique({ where: { vehicleId } }),
        this.prisma.batteryHealthSnapshot.findFirst({
          where: { vehicleId },
          orderBy: { recordedAt: 'desc' },
        }),
        this.prisma.vehicleDrivingImpactCurrent.findUnique({ where: { vehicleId } }),
        this.prisma.drivingEvent.groupBy({
          by: ['eventType'],
          where: {
            vehicleId,
            recordedAt: { gte: new Date(nowMs - 30 * 24 * 60 * 60 * 1000) },
          },
          _count: true,
        }),
      ]);

    const brakeFreshness = classifyHealthFreshness(brake?.lastRecalculatedAt, nowMs);
    const brakeInputs: string[] = [];
    const brakeMissing: string[] = [];
    if (drivingImpact) {
      brakeInputs.push('vehicle_driving_impact_current');
    } else {
      brakeMissing.push('vehicle_driving_impact_current');
    }
    if (eventCounts.some((e) => e.eventType === 'HARSH_BRAKING' || e.eventType === 'EXTREME_BRAKING')) {
      brakeInputs.push('driving_events (brake-related)');
    }

    const tireFreshness = tireSetup ? 'current' : 'not_available';
    const tireInputs: string[] = [];
    const tireMissing: string[] = ['tread_pressure_telemetry_trace'];
    if (tireSetup) tireInputs.push('vehicle_tire_setup');

    const batteryFreshness = classifyHealthFreshness(
      hvBattery?.lastPublishedAt ?? lvSnapshot?.recordedAt,
      nowMs,
    );
    const batteryInputs: string[] = [];
    const batteryMissing: string[] = [];
    if (lvSnapshot) batteryInputs.push('battery_health_snapshots');
    else batteryMissing.push('lv_battery_snapshots');
    if (hvBattery) batteryInputs.push('hv_battery_health_current');
    else batteryMissing.push('hv_battery_health_current');

    return {
      brake: {
        status: brake?.isInitialized
          ? brake.stateClass ?? 'initialized'
          : null,
        lastCalculationAt: brake?.lastRecalculatedAt?.toISOString() ?? null,
        calculationSource: brake ? 'BrakeHealthService / brake_health_current' : null,
        freshness: brake ? brakeFreshness : 'not_available',
        inputsAvailable: brakeInputs,
        inputsMissing: brakeMissing,
        evidence: {
          padsRemainingKm: brake?.padsRemainingKm ?? null,
          confidenceLabel: brake?.confidenceLabel ?? null,
          modeledTripCount: brake?.modeledTripCount ?? null,
          harshBrakingEvents30d: eventCounts
            .filter((e) => e.eventType === 'HARSH_BRAKING' || e.eventType === 'EXTREME_BRAKING')
            .reduce((a, e) => a + e._count, 0),
        },
        notes: brake
          ? brakeMissing.length > 0
            ? ['Health result exists, but source inputs are not fully traceable from persisted data.']
            : []
          : ['Calculation trace not fully available in current model.'],
      },
      tire: {
        status: tireSetup?.healthStatus ?? null,
        lastCalculationAt:
          tireSetup?.lastRecalculatedAt?.toISOString() ??
          tireSetup?.updatedAt?.toISOString() ??
          null,
        calculationSource: tireSetup ? 'TireHealthService / vehicle_tire_setup' : null,
        freshness: tireFreshness as HealthTraceDto['tire']['freshness'],
        inputsAvailable: tireInputs,
        inputsMissing: tireMissing,
        evidence: {
          activeSetupId: tireSetup?.id ?? null,
          overallHealthPercent: tireSetup?.overallHealthPercent ?? null,
          overallRemainingKm: tireSetup?.overallRemainingKm ?? null,
        },
        notes: [
          'Calculation input trace is not fully available in the current data model for per-signal tire inputs.',
        ],
      },
      battery: {
        status: hvBattery?.publicationState ?? (lvSnapshot ? 'LV snapshot' : null),
        lastCalculationAt:
          hvBattery?.lastPublishedAt?.toISOString() ??
          lvSnapshot?.recordedAt?.toISOString() ??
          null,
        calculationSource: 'CanonicalBatteryHealthService / battery_health_snapshots + hv_battery_health_current',
        freshness: batteryFreshness,
        inputsAvailable: batteryInputs,
        inputsMissing: batteryMissing,
        evidence: {
          lvVoltage: lvSnapshot?.voltageV ?? null,
          lvSoh: lvSnapshot?.sohPercent ?? null,
          hvPublishedSoh: hvBattery?.publishedSohPct ?? null,
          hvRawSoh: hvBattery?.rawSohPct ?? null,
        },
        notes: batteryMissing.length
          ? ['Input-source mapping unavailable for some battery scopes.']
          : [],
      },
    };
  }

  async getPipeline(orgId: string, vehicleId: string): Promise<PipelineDto> {
    const vehicle = await this.assertVehicle(orgId, vehicleId);
    const [latestState, lastPoll, lastTrip, hmTelemetry] = await Promise.all([
      this.prisma.vehicleLatestState.findUnique({ where: { vehicleId } }),
      this.prisma.dimoPollLog.findFirst({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleTrip.findFirst({
        where: { vehicleId },
        orderBy: { startTime: 'desc' },
        select: { startTime: true, behaviorEnrichmentStatus: true },
      }),
      vehicle.vin
        ? this.prisma.hmLatestTelemetryState.findFirst({
            where: { vin: vehicle.vin },
          })
        : Promise.resolve(null),
    ]);

    const provider =
      latestState?.providerSource ??
      (vehicle.dimoVehicleId ? 'DIMO' : hmTelemetry ? 'HIGH_MOBILITY' : null);

    const steps = [
      {
        step: 'Provider',
        status: provider ? ('available' as const) : ('unknown' as const),
        lastSeenAt: latestState?.providerFetchedAt?.toISOString() ?? null,
        sourceName: provider,
        notes: null,
      },
      {
        step: 'Ingestion',
        status: lastPoll ? ('available' as const) : ('unknown' as const),
        lastSeenAt: lastPoll?.finishedAt?.toISOString() ?? lastPoll?.startedAt?.toISOString() ?? null,
        sourceName: 'DimoSnapshotProcessor / dimo_poll_logs',
        notes: lastPoll?.errorMessage ?? null,
      },
      {
        step: 'Raw telemetry persistence',
        status: latestState?.rawPayloadJson ? ('available' as const) : ('not_persisted' as const),
        lastSeenAt: latestState?.updatedAt?.toISOString() ?? null,
        sourceName: 'vehicle_latest_states.raw_payload_json',
        notes: latestState?.rawPayloadJson ? null : 'Raw provider payload not stored for this vehicle.',
      },
      {
        step: 'Snapshot persistence',
        status: latestState ? ('available' as const) : ('not_persisted' as const),
        lastSeenAt: latestState?.updatedAt?.toISOString() ?? null,
        sourceName: 'vehicle_latest_states + ClickHouse telemetry_snapshots',
        notes: this.clickHouse.isAvailable
          ? null
          : 'ClickHouse mirror unavailable (CLICKHOUSE_URL not configured).',
      },
      {
        step: 'High-frequency persistence',
        status: this.clickHouse.isAvailable ? ('unknown' as const) : ('unavailable' as const),
        lastSeenAt: null,
        sourceName: 'ClickHouse telemetry_waypoints',
        notes: 'HF availability per vehicle — see High Frequency tab.',
      },
      {
        step: 'Trip processing',
        status: lastTrip ? ('available' as const) : ('unknown' as const),
        lastSeenAt: lastTrip?.startTime?.toISOString() ?? null,
        sourceName: 'TripEnrichmentOrchestrator / vehicle_trips',
        notes: lastTrip?.behaviorEnrichmentStatus ?? null,
      },
      {
        step: 'Health calculation',
        status: ('available' as const),
        lastSeenAt: latestState?.updatedAt?.toISOString() ?? null,
        sourceName: 'BrakeHealthService, TireHealthService, CanonicalBatteryHealthService (workers)',
        notes: 'Read-only trace — does not trigger recalculation.',
      },
      {
        step: 'Alert consumer',
        status: ('unknown' as const),
        lastSeenAt: null,
        sourceName: 'business-insights detectors',
        notes: 'Last alert timestamp not traceable from current read model.',
      },
    ];

    return {
      provider,
      steps,
      lastSuccessfulProcessing:
        lastPoll?.status === 'SUCCESS'
          ? lastPoll.finishedAt?.toISOString() ?? null
          : latestState?.updatedAt?.toISOString() ?? null,
      lastError: lastPoll?.status !== 'SUCCESS' ? lastPoll?.errorMessage ?? null : null,
    };
  }

  getSignalGroups(vehicleId?: string): SignalGroupDefinitionDto[] {
    // vehicleId reserved for future per-vehicle availability without extra DB roundtrip in list endpoint
    void vehicleId;
    return SIGNAL_GROUP_DEFINITIONS.map((g) => ({
      id: g.id,
      groupName: g.groupName,
      description: g.description,
      typicalSignals: [...g.typicalSignals],
      expectedIntervalMs: g.expectedIntervalMs,
      practicalUse: g.practicalUse,
      usedByModules: [...g.usedByModules],
      detectionRelevance: g.detectionRelevance,
      currentAvailability: 'unknown' as const,
      availabilityNotes: 'Select a vehicle and open Overview / Signal Logs for per-vehicle availability.',
    }));
  }

  async getSignalGroupsForVehicle(
    orgId: string,
    vehicleId: string,
  ): Promise<SignalGroupDefinitionDto[]> {
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    const rows = this.buildSignalRows(ctx.latestState, ctx.chStats, ctx.nowMs);
    const persistedGroups = new Set(rows.filter((r) => r.persisted).map((r) => r.signalGroup));

    return SIGNAL_GROUP_DEFINITIONS.map((g) => {
      const catalogGroups = g.catalogGroups ?? [];
      const matched = catalogGroups.filter((cg) => persistedGroups.has(cg));
      let availability: SignalGroupDefinitionDto['currentAvailability'] = 'unknown';
      let notes: string | null = null;

      if (g.id === 'vehicle_identity') {
        availability = ctx.vehicle.vin ? 'available' : 'partial';
        notes = ctx.vehicle.vin ? null : 'VIN not set on vehicle record.';
      } else if (catalogGroups.length === 0) {
        availability = 'unknown';
        notes = 'Not available in current persistence mapping.';
      } else if (matched.length === catalogGroups.length) {
        availability = 'available';
      } else if (matched.length > 0) {
        availability = 'partial';
        notes = `Partial — ${matched.length}/${catalogGroups.length} signal groups have persisted values.`;
      } else {
        availability = 'missing';
        notes = 'Signal not currently persisted for selected vehicle.';
      }

      return {
        id: g.id,
        groupName: g.groupName,
        description: g.description,
        typicalSignals: [...g.typicalSignals],
        expectedIntervalMs: g.expectedIntervalMs,
        practicalUse: g.practicalUse,
        usedByModules: [...g.usedByModules],
        detectionRelevance: g.detectionRelevance,
        currentAvailability: availability,
        availabilityNotes: notes,
      };
    });
  }

  private async loadVehicleContext(orgId: string, vehicleId: string) {
    const vehicle = await this.assertVehicle(orgId, vehicleId);
    const nowMs = Date.now();
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
    });
    const chStats = await this.querySnapshotIntervals(vehicleId);
    return { vehicle, latestState, chStats, nowMs };
  }

  private buildSignalRows(
    state: VehicleLatestState | null,
    chStats: ClickHouseSnapshotStats | null,
    nowMs: number,
  ): SignalArrivalRowDto[] {
    const avgInterval = chStats?.avgIntervalMs ?? null;
    const rows: SignalArrivalRowDto[] = VEHICLE_LATEST_STATE_CATALOG.map((entry) => {
      const raw = state ? (state as Record<string, unknown>)[entry.field] : null;
      const hasValue = raw != null && raw !== '';
      const providerTs = state?.sourceTimestamp?.toISOString() ?? null;
      const backendTs = state?.providerFetchedAt?.toISOString() ?? state?.updatedAt?.toISOString() ?? null;
      const lastSeen = state?.lastSeenAt?.toISOString() ?? null;

      return {
        signalName: entry.signalName,
        signalGroup: entry.signalGroup,
        latestValue: formatSignalValue(raw),
        unit: entry.unit,
        providerTimestamp: providerTs,
        backendReceivedTimestamp: backendTs,
        lastSeen,
        observedIntervalMs: avgInterval,
        expectedIntervalMs: entry.expectedIntervalMs,
        intervalStatus: classifyIntervalStatus(avgInterval, entry.expectedIntervalMs, hasValue),
        sourceProvider: state?.providerSource ?? state?.source ?? null,
        storageLocation: entry.storageLocation,
        usedByModules: entry.usedByModules,
        persisted: hasValue,
      };
    });

    if (state?.rawPayloadJson && typeof state.rawPayloadJson === 'object') {
      const payload = state.rawPayloadJson as Record<string, unknown>;
      for (const [key, value] of Object.entries(payload)) {
        if (rows.some((r) => r.signalName === key)) continue;
        rows.push({
          signalName: key,
          signalGroup: 'raw_payload',
          latestValue: formatSignalValue(value),
          unit: null,
          providerTimestamp: state.sourceTimestamp?.toISOString() ?? null,
          backendReceivedTimestamp: state.updatedAt?.toISOString() ?? null,
          lastSeen: state.lastSeenAt?.toISOString() ?? null,
          observedIntervalMs: chStats?.avgIntervalMs ?? null,
          expectedIntervalMs: null,
          intervalStatus: value != null ? 'Unknown' : 'Missing',
          sourceProvider: state.providerSource ?? state.source,
          storageLocation: 'vehicle_latest_states.raw_payload_json',
          usedByModules: ['Unknown'],
          persisted: value != null,
        });
      }
    }

    void nowMs;
    return rows;
  }

  private async querySnapshotIntervals(
    vehicleId: string,
  ): Promise<ClickHouseSnapshotStats | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const client = this.clickHouse.getClient();
      const result = await client.query({
        query: `
          SELECT
            count() AS cnt,
            avg(interval_ms) AS avg_ms,
            min(interval_ms) AS min_ms,
            max(interval_ms) AS max_ms
          FROM (
            SELECT
              dateDiff('millisecond',
                lagInFrame(recorded_at) OVER (ORDER BY recorded_at),
                recorded_at
              ) AS interval_ms
            FROM telemetry_snapshots
            WHERE vehicle_id = {vehicleId:String}
              AND recorded_at >= now() - INTERVAL {hours:UInt16} HOUR
          )
          WHERE interval_ms > 0
        `,
        query_params: {
          vehicleId,
          hours: CLICKHOUSE_ANALYSIS_WINDOW_HOURS,
        },
        format: 'JSONEachRow',
      });
      const rows = await result.json<{
        cnt: string;
        avg_ms: number | null;
        min_ms: number | null;
        max_ms: number | null;
      }>();
      const row = rows[0];
      if (!row || Number(row.cnt) === 0) return null;

      const intervalsResult = await client.query({
        query: `
          SELECT interval_ms
          FROM (
            SELECT
              dateDiff('millisecond',
                lagInFrame(recorded_at) OVER (ORDER BY recorded_at),
                recorded_at
              ) AS interval_ms
            FROM telemetry_snapshots
            WHERE vehicle_id = {vehicleId:String}
              AND recorded_at >= now() - INTERVAL {hours:UInt16} HOUR
          )
          WHERE interval_ms > 0
          LIMIT 500
        `,
        query_params: { vehicleId, hours: CLICKHOUSE_ANALYSIS_WINDOW_HOURS },
        format: 'JSONEachRow',
      });
      const intervalRows = await intervalsResult.json<{ interval_ms: number }>();

      return {
        count: Number(row.cnt),
        avgIntervalMs: row.avg_ms != null ? Math.round(row.avg_ms) : null,
        minIntervalMs: row.min_ms != null ? Math.round(row.min_ms) : null,
        maxIntervalMs: row.max_ms != null ? Math.round(row.max_ms) : null,
        intervals: intervalRows.map((r) => r.interval_ms),
      };
    } catch {
      return null;
    }
  }

  private async countWaypoints24h(vehicleId: string): Promise<number | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const client = this.clickHouse.getClient();
      const result = await client.query({
        query: `
          SELECT count() AS cnt
          FROM telemetry_waypoints
          WHERE vehicle_id = {vehicleId:String}
            AND recorded_at >= now() - INTERVAL {hours:UInt16} HOUR
        `,
        query_params: { vehicleId, hours: CLICKHOUSE_ANALYSIS_WINDOW_HOURS },
        format: 'JSONEachRow',
      });
      const rows = await result.json<{ cnt: string }>();
      return rows[0] ? Number(rows[0].cnt) : 0;
    } catch {
      return null;
    }
  }

  private async assertVehicle(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: tenantVehicleWhere(orgId, vehicleId),
      include: { dimoVehicle: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }
}
