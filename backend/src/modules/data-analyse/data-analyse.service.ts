import { Injectable, NotFoundException } from '@nestjs/common';
import type { VehicleLatestState } from '@prisma/client';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { DeviceConnectionQueryService } from '@modules/dimo/device-connection-query.service';
import { RpmWebhookQueryService } from '@modules/dimo/rpm-webhook-query.service';
import { ONLINE_MAX_MS, STANDBY_MAX_MS } from '@modules/vehicles/fleet-connectivity.util';
import {
  CLICKHOUSE_ANALYSIS_WINDOW_HOURS,
  HIGH_FREQUENCY_THRESHOLD_MS,
} from './data-analyse.constants';
import {
  SIGNAL_GROUP_DEFINITIONS,
  VEHICLE_LATEST_STATE_CATALOG,
} from './data-analyse-signal-catalog';
import {
  assessLaunchFeasibility,
  assessLaunchDetectionUsefulness,
  classifyDataFreshness,
  classifyHealthFreshness,
  classifyHfDetectionQuality,
  classifyIntervalStatus,
  classifyReliabilityStatus,
  computeIntervalStats,
  deriveHfAvailability,
  describeEnrichmentSkip,
  filterConnectedVehicles,
  formatSignalValue,
  resolveHfMirrorStatus,
  tenantVehicleWhere,
} from './data-analyse.utils';
import type {
  DataAnalyseVehicleDto,
  EventArchitectureDto,
  EventLayerStatus,
  HealthTraceDto,
  HighFrequencyAnalysisDto,
  HfPracticalUse,
  LaunchFeasibilityDto,
  PipelineDto,
  SignalArrivalRowDto,
  SignalGroupDefinitionDto,
  TelemetryOverviewDto,
} from './data-analyse.types';
import {
  isLteR1NativeEventCapable,
  shouldRunIceEventContextEnrichment,
} from '@modules/vehicle-intelligence/event-context/engine-context.guards';

import type { ClickHouseDiagnosticsDto } from '@modules/clickhouse/clickhouse-diagnostics.types';
import { ClickHouseDiagnosticsService } from '@modules/clickhouse/clickhouse-diagnostics.service';

interface ClickHouseSnapshotStats {
  count: number;
  avgIntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  intervals: number[];
}

interface SignalColumnAggregate {
  sampleCount24h: number;
  sampleCount7d: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

interface SignalIntervalStats {
  medianIntervalMs: number | null;
  p95IntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  gapCount: number;
  largestGapMs: number | null;
  averageMs?: number | null;
  medianMs?: number | null;
  p95Ms?: number | null;
  fastestMs?: number | null;
  slowestMs?: number | null;
  dropoutCount?: number;
  longestGapMs?: number | null;
  intervals?: number[];
}

@Injectable()
export class DataAnalyseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickHouse: ClickHouseService,
    private readonly vehiclesService: VehiclesService,
    private readonly clickHouseHf: ClickHouseHfService,
    private readonly deviceConnectionQuery: DeviceConnectionQueryService,
    private readonly rpmWebhookQuery: RpmWebhookQueryService,
    private readonly clickHouseDiagnostics: ClickHouseDiagnosticsService,
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

  /**
   * Org-scoped ClickHouse infrastructure diagnostics for internal debug surfaces.
   * Reuses ClickHouseDiagnosticsService — safe to call from Monitoring later.
   * OrgScopingGuard on the controller enforces tenant access.
   */
  async getClickHouseDiagnostics(
    _orgId: string,
  ): Promise<ClickHouseDiagnosticsDto> {
    return this.clickHouseDiagnostics.getDiagnostics();
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

    // Separate, clearly-named persistence-layer counts. "waypoints missing" is
    // intentionally NOT the same as "HF missing": telemetry_hf_points stands on
    // its own. Each window is queried independently so 24h/7d never bleed into
    // each other.
    const [
      waypointCount,
      waypointCount7d,
      snapshotSampleCount24h,
      snapshotSampleCount7d,
    ] = await Promise.all([
      this.countWaypoints(vehicleId, 24),
      this.countWaypoints(vehicleId, 24 * 7),
      this.countSnapshots(vehicleId, 24),
      this.countSnapshots(vehicleId, 24 * 7),
    ]);

    const hfCatalog = VEHICLE_LATEST_STATE_CATALOG.filter((c) => c.highFrequencyCandidate);
    const columnAggregates = await this.querySignalColumnAggregates(vehicleId, hfCatalog);
    const waypointSpeedStats =
      (waypointCount ?? 0) > 0
        ? await this.queryWaypointColumnStats(vehicleId, 'speed_kmh')
        : null;

    const signals = await Promise.all(
      hfCatalog.map(async (entry) => {
        const state = ctx.latestState;
        const raw = state ? (state as Record<string, unknown>)[entry.field] : null;
        const hasValue = raw != null;
        const colKey = entry.clickhouseColumn ?? entry.signalName;
        const aggregate =
          entry.signalName === 'speed' && waypointSpeedStats
            ? waypointSpeedStats
            : columnAggregates.get(colKey) ?? null;

        let intervalStats: ReturnType<typeof computeIntervalStats> | null = null;
        if (aggregate?.intervals && aggregate.intervals.length > 0) {
          intervalStats = computeIntervalStats(aggregate.intervals);
        } else if (entry.clickhouseColumn && (aggregate?.sampleCount24h ?? 0) > 0) {
          const colInterval = await this.queryColumnIntervalStats(
            vehicleId,
            entry.clickhouseColumn,
            entry.clickhouseTable ?? 'telemetry_snapshots',
          );
          if (colInterval) {
            intervalStats = {
              averageMs: colInterval.averageMs ?? colInterval.medianIntervalMs ?? null,
              medianMs: colInterval.medianIntervalMs ?? colInterval.medianMs ?? null,
              p95Ms: colInterval.p95IntervalMs ?? colInterval.p95Ms ?? null,
              fastestMs: colInterval.minIntervalMs ?? colInterval.fastestMs ?? null,
              slowestMs: colInterval.maxIntervalMs ?? colInterval.slowestMs ?? null,
              dropoutCount: colInterval.gapCount ?? colInterval.dropoutCount ?? 0,
              longestGapMs: colInterval.largestGapMs ?? colInterval.longestGapMs ?? null,
            };
          }
        }

        const medianIntervalMs = intervalStats?.medianMs ?? null;
        const sampleCount24h = aggregate?.sampleCount24h ?? (hasValue ? null : 0);
        const reliabilityStatus = classifyReliabilityStatus({
          sampleCount24h,
          medianIntervalMs,
          expectedIntervalMs: entry.expectedIntervalMs,
          hasPersistedValue: hasValue || (sampleCount24h ?? 0) > 0,
        });

        const hasPersistedHf =
          entry.signalName === 'speed'
            ? (waypointCount ?? 0) > 0 || (sampleCount24h ?? 0) > 0
            : (sampleCount24h ?? 0) > 0;

        // Report the ACTUAL persistence source this row's stats came from, so the
        // page never mislabels a snapshot-derived interval as a waypoint/HF one.
        const actualSource: string =
          entry.signalName === 'speed' && (waypointCount ?? 0) > 0
            ? 'telemetry_waypoints'
            : entry.clickhouseColumn && (sampleCount24h ?? 0) > 0
              ? entry.clickhouseTable ?? 'telemetry_snapshots'
              : hasValue
                ? 'vehicle_latest_states'
                : entry.storageTable ?? 'vehicle_latest_states';

        const quality = classifyHfDetectionQuality(
          medianIntervalMs ?? intervalStats?.averageMs ?? null,
          hasPersistedHf,
        );
        const launchDetectionUsefulness = assessLaunchDetectionUsefulness({
          signalKey: entry.signalName,
          reliabilityStatus,
          medianIntervalMs,
          sampleCount24h,
        });

        const notes: string[] = [];
        if (!hasValue && (sampleCount24h ?? 0) === 0) {
          notes.push('Signal not currently persisted for this vehicle.');
        }
        if (entry.clickhouseColumn == null) {
          notes.push('No ClickHouse column mapped — interval stats from snapshots unavailable.');
        }
        if (!chAvailable) {
          notes.push('ClickHouse unavailable — counts/intervals may be incomplete.');
        }
        if (entry.signalName === 'speed' && (waypointCount ?? 0) === 0) {
          notes.push('No telemetry_waypoints in 24h — using snapshot-level speed only.');
        }
        if (quality === 'Too sparse') {
          notes.push('Interval too sparse for reliable launch-like start detection.');
        }

        let providerLatency: number | null = null;
        if (state?.sourceTimestamp && state?.providerFetchedAt) {
          providerLatency =
            state.providerFetchedAt.getTime() - state.sourceTimestamp.getTime();
        }

        const explanation = this.buildHfExplanation({
          entry,
          reliabilityStatus,
          launchDetectionUsefulness,
          sampleCount24h,
          medianIntervalMs,
          waypointCount,
        });

        return {
          signalKey: entry.signalName,
          signalName: entry.signalName,
          displayName: entry.displayName ?? entry.signalName,
          sourceProvider: state?.providerSource ?? state?.source ?? null,
          pollGroup: entry.pollGroup ?? 'DIMO_SNAPSHOT',
          storageTable: actualSource,
          sampleCount24h,
          sampleCount7d: aggregate?.sampleCount7d ?? null,
          firstSeenAt: aggregate?.firstSeenAt ?? state?.lastSeenAt?.toISOString() ?? null,
          lastSeenAt: aggregate?.lastSeenAt ?? state?.lastSeenAt?.toISOString() ?? null,
          medianIntervalMs,
          p95IntervalMs: intervalStats?.p95Ms ?? null,
          minIntervalMs: intervalStats?.fastestMs ?? null,
          maxIntervalMs: intervalStats?.slowestMs ?? null,
          gapCount: intervalStats?.dropoutCount ?? null,
          largestGapMs: intervalStats?.longestGapMs ?? null,
          reliabilityStatus,
          practicalUse: this.resolvePracticalUse(entry),
          launchDetectionUsefulness,
          explanation,
          observedIntervalMs: medianIntervalMs ?? intervalStats?.averageMs ?? null,
          averageIntervalMs: intervalStats?.averageMs ?? medianIntervalMs,
          dropoutCount: intervalStats?.dropoutCount ?? null,
          longestGapMs: intervalStats?.longestGapMs ?? null,
          providerToBackendLatencyMs: providerLatency,
          detectionQuality: hasValue || (sampleCount24h ?? 0) > 0 ? quality : ('Not available' as const),
          notes,
        };
      }),
    );

    // Best-effort HF-layer status from the ClickHouse telemetry_hf_* mirror.
    // Analytics-only and must never break this endpoint — failures are swallowed.
    const hfStatus = await this.loadHfLayerStatus(vehicleId, ctx.nowMs);

    // `available` must reflect REAL high-frequency evidence, not ~30s snapshots.
    // A snapshot stream at its expected ~30s cadence used to flip this true via
    // reliabilityStatus=GOOD, which misleadingly implied active HF abuse
    // detection. Require a persisted HF stream (waypoints / hf_points) OR an
    // observed per-signal interval at the high-frequency threshold (<=2s).
    const hasSubSecondCadence = signals.some(
      (s) =>
        s.medianIntervalMs != null &&
        s.medianIntervalMs <= HIGH_FREQUENCY_THRESHOLD_MS,
    );

    // Single source of truth for the HF decision so the UI cannot contradict
    // itself ("HF active" + "snapshot-only"). waypoints and hf_points are
    // independent: either one means the vehicle is NOT snapshot-only.
    const hfDecision = deriveHfAvailability({
      waypointCount,
      hfPointCount24h: hfStatus.hfPointCount24h ?? 0,
      hasSubSecondCadence,
      snapshotSampleCount24h,
    });

    return {
      available: hfDecision.available,
      message: this.buildHfMessage(hfDecision, hfStatus.hfMirrorStatus),
      snapshotLevelOnly: hfDecision.snapshotOnly,
      hfAvailabilityStatus: hfDecision.status,
      clickHouseAvailable: chAvailable,
      signals,
      waypointCount24h: waypointCount,
      waypointCount7d,
      snapshotSampleCount24h,
      snapshotSampleCount7d,
      ...hfStatus,
    };
  }

  /**
   * Builds an honest top-level HF status message that distinguishes the layers:
   *   - true snapshot-only           → HF abuse detection NOT active
   *   - hf_points present, no route  → clarify the two are separate concerns
   *   - waypoints present            → no warning needed
   */
  private buildHfMessage(
    decision: ReturnType<typeof deriveHfAvailability>,
    mirrorStatus: HighFrequencyAnalysisDto['hfMirrorStatus'],
  ): string | null {
    if (decision.snapshotOnly) {
      return 'Snapshot-level telemetry only (~30s). No high-frequency points (telemetry_hf_points) or route waypoints (telemetry_waypoints) in 24h — high-frequency abuse detection is NOT active for this vehicle.';
    }
    if (decision.hasHfPoints && !decision.hasWaypoints) {
      const mirror =
        mirrorStatus === 'enabled'
          ? ' HF mirror is enabled.'
          : mirrorStatus === 'disabled'
            ? ' HF mirror is disabled.'
            : '';
      return `High-frequency signal points present (telemetry_hf_points); no route waypoint stream (telemetry_waypoints) — these are separate layers, not a contradiction.${mirror}`;
    }
    return null;
  }

  /**
   * Best-effort read of the HF mirror layer status (telemetry_hf_*). Returns an
   * empty object on any failure so getHighFrequency never breaks. Analytics-only.
   */
  private async loadHfLayerStatus(
    vehicleId: string,
    nowMs: number,
  ): Promise<Partial<HighFrequencyAnalysisDto>> {
    // The mirror flag is derivable regardless of ClickHouse reachability.
    const hfMirrorStatus = resolveHfMirrorStatus();

    if (!this.clickHouse.isAvailable) {
      return { hfConfigured: this.clickHouse.isConfigured, hfMirrorStatus };
    }

    const to = new Date(nowMs);
    const from24h = new Date(nowMs - 24 * 60 * 60 * 1000);
    const from7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

    try {
      const [availability24h, availability7d, recent] = await Promise.all([
        this.clickHouseHf.getHfAvailability(vehicleId, from24h, to),
        this.clickHouseHf.getHfAvailability(vehicleId, from7d, to),
        this.clickHouseHf.getRecentHfEvents(vehicleId, from24h, to, 50),
      ]);

      return {
        hfConfigured: this.clickHouse.isConfigured,
        hfMirrorStatus,
        hfPointCount24h: availability24h.available ? availability24h.pointCount : null,
        hfPointCount7d: availability7d.available ? availability7d.pointCount : null,
        hfLatestPointAt: availability24h.latestPointAt ?? availability7d.latestPointAt,
        hfSignalGroupsSeen: availability7d.signalGroups,
        hfRecentEvents: recent.available
          ? recent.events.map((e) => ({
              eventType: e.eventType,
              severity: e.severity,
              eventStart: e.eventStart,
              eventEnd: e.eventEnd,
              durationMs: e.durationMs,
              confidence: e.confidence,
              primaryValue: e.primaryValue,
              primaryUnit: e.primaryUnit,
            }))
          : [],
      };
    } catch {
      return { hfConfigured: this.clickHouse.isConfigured, hfMirrorStatus };
    }
  }

  /**
   * LTE_R1 Event Context Architecture diagnostic (read-only). Surfaces the new
   * intake/enrichment/feasibility layers honestly. No detection, no Tesla/EV ICE
   * context — EV vehicles report powertrainApplicable=false and ICE layers are
   * marked skipped/unavailable.
   */
  async getEventArchitecture(
    orgId: string,
    vehicleId: string,
  ): Promise<EventArchitectureDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: tenantVehicleWhere(orgId, vehicleId),
      select: { id: true, hardwareType: true, fuelType: true, dimoVehicleId: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const vehicleInput = {
      hardwareType: vehicle.hardwareType,
      fuelType: vehicle.fuelType,
    };
    const nativeCapable = isLteR1NativeEventCapable(vehicleInput);
    const powertrainApplicable = shouldRunIceEventContextEnrichment(vehicleInput);

    const now = Date.now();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);

    // ── Native DIMO behavior events + per-event context assessment tally ──────
    const drivingEvents = await this.prisma.drivingEvent.findMany({
      where: { vehicleId, recordedAt: { gte: since7d } },
      select: { id: true, recordedAt: true, metadataJson: true },
    });
    const nativeCount7d = drivingEvents.length;
    const nativeCount24h = drivingEvents.filter((e) => e.recordedAt >= since24h).length;

    let ctxCompleted = 0;
    let ctxInsufficient = 0;
    let ctxFailed = 0;
    let ctxSkipped = 0;
    let ctxWindows = 0;
    for (const e of drivingEvents) {
      const ca = (e.metadataJson as Record<string, unknown> | null)?.contextAssessment as
        | Record<string, unknown>
        | undefined;
      if (!ca || typeof ca !== 'object') continue;
      ctxWindows++;
      switch (ca.status) {
        case 'COMPLETED':
          ctxCompleted++;
          break;
        case 'INSUFFICIENT_CONTEXT':
          ctxInsufficient++;
          break;
        case 'FAILED':
          ctxFailed++;
          break;
        case 'SKIPPED_NOT_APPLICABLE':
          ctxSkipped++;
          break;
        default:
          break;
      }
    }

    // ── Device connection webhook events (OBD plug/unplug) ─────────────────────
    const deviceEvents = await this.prisma.dimoDeviceConnectionEvent.findMany({
      where: { vehicleId, observedAt: { gte: since7d } },
      select: { id: true, eventType: true, observedAt: true },
      orderBy: { observedAt: 'desc' },
    });
    const deviceEvents7d = deviceEvents.length;
    const lastUnplugged = deviceEvents.find(
      (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    );
    const lastPlugged = deviceEvents.find(
      (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
    );
    const openUnpluggedEpisode =
      !!lastUnplugged &&
      (!lastPlugged || lastUnplugged.observedAt.getTime() > lastPlugged.observedAt.getTime());

    const rpmCandidates = await this.prisma.rpmWebhookCandidate.findMany({
      where: { vehicleId, observedAt: { gte: since7d } },
      select: { id: true, observedAt: true, observedValue: true, status: true, threshold: true },
      orderBy: { observedAt: 'desc' },
    });
    const rpmCandidates7d = rpmCandidates.length;
    const rpmCandidates24h = rpmCandidates.filter((r) => r.observedAt >= since24h).length;
    const lastRpm = rpmCandidates[0] ?? null;
    const maxRpm7d =
      rpmCandidates.length > 0 ? Math.max(...rpmCandidates.map((r) => r.observedValue)) : null;

    const hasDimoLink = vehicle.dimoVehicleId != null;

    // ── HF cadence / trip signal summary (reuse existing read model) ──────────
    const hf = await this.getHighFrequency(orgId, vehicleId);
    const medians = hf.signals
      .map((s) => s.medianIntervalMs)
      .filter((v): v is number => v != null);
    const p95s = hf.signals.map((s) => s.p95IntervalMs).filter((v): v is number => v != null);
    const medianIntervalMs = medians.length ? Math.min(...medians) : null;
    const p95IntervalMs = p95s.length ? Math.max(...p95s) : null;
    const expectedEngineSignals = ['rpm', 'throttle', 'engineLoad', 'coolant', 'speed'];
    const seenKeys = new Set(hf.signals.map((s) => s.signalKey.toLowerCase()));
    const missingSignals = powertrainApplicable
      ? expectedEngineSignals.filter(
          (sig) => ![...seenKeys].some((k) => k.includes(sig.toLowerCase())),
        )
      : [];

    // ── Layer status assembly ────────────────────────────────────────────────
    const nativeEventIntake = ((): EventArchitectureDto['nativeEventIntake'] => {
      if (!nativeCapable) {
        return {
          status: 'unavailable',
          label: 'Nicht verfügbar',
          detail: 'Fahrzeug ist kein LTE_R1-Gerät — kein nativer DIMO-Event-Intake.',
        };
      }
      const status: EventLayerStatus = nativeCount7d > 0 ? 'active' : 'no_events';
      return {
        status,
        label: status === 'active' ? 'Aktiv' : 'Keine Ereignisse',
        detail:
          status === 'active'
            ? 'Native DIMO Behavior Events werden empfangen und gespeichert.'
            : 'LTE_R1-fähig, aber in den letzten 7 Tagen keine nativen Ereignisse.',
        counters: [{ label: 'Native Events (24h/7d)', value: `${nativeCount24h} / ${nativeCount7d}` }],
      };
    })();

    const deviceConnectionWebhookIntake = ((): EventArchitectureDto['deviceConnectionWebhookIntake'] => {
      let status: EventLayerStatus = 'unknown';
      if (deviceEvents7d > 0) status = 'active';
      else if (hasDimoLink) status = 'not_configured';

      const labelMap: Record<string, string> = {
        active: 'Aktiv',
        not_configured: 'Nicht konfiguriert',
        unknown: 'Unbekannt',
      };
      const detailMap: Record<string, string> = {
        active: 'OBD-Stecker Ein-/Aus-Events werden über DIMO Vehicle Triggers empfangen.',
        not_configured:
          'DIMO-Fahrzeug vorhanden, aber keine OBD-Verbindungs-Events in den letzten 7 Tagen.',
        unknown: 'Keine OBD-Verbindungs-Events beobachtet — Status unklar.',
      };
      const counters: Array<{ label: string; value: string }> = [
        { label: 'Events (7d)', value: String(deviceEvents7d) },
      ];
      if (lastUnplugged) {
        counters.push({
          label: 'Letztes Ausstecken',
          value: lastUnplugged.observedAt.toISOString(),
        });
      }
      if (lastPlugged) {
        counters.push({
          label: 'Letztes Einstecken',
          value: lastPlugged.observedAt.toISOString(),
        });
      }
      counters.push({
        label: 'Offene Aussteck-Episode',
        value: openUnpluggedEpisode ? 'ja' : 'nein',
      });
      return {
        status,
        label: labelMap[status] ?? 'Unbekannt',
        detail: detailMap[status] ?? detailMap.unknown,
        counters,
      };
    })();

    const rpmWebhookIntake = ((): EventArchitectureDto['rpmWebhookIntake'] => {
      if (!powertrainApplicable) {
        return {
          status: 'skipped',
          label: 'Übersprungen',
          detail: 'RPM-Webhooks nur für LTE_R1/ICE — Tesla/EV nicht anwendbar.',
        };
      }
      let status: EventLayerStatus = 'unknown';
      if (rpmCandidates7d > 0) status = 'active';
      else if (hasDimoLink) status = 'not_configured';

      const labelMap: Record<string, string> = {
        active: 'Aktiv',
        not_configured: 'Nicht konfiguriert',
        unknown: 'Unbekannt',
        skipped: 'Übersprungen',
      };
      const detailMap: Record<string, string> = {
        active:
          'High-RPM-Events (vss.powertrainCombustionEngineSpeed) werden über DIMO Vehicle Triggers empfangen.',
        not_configured:
          'DIMO-Fahrzeug vorhanden, aber keine RPM-Webhook-Kandidaten in den letzten 7 Tagen.',
        unknown: 'Keine RPM-Webhook-Events beobachtet.',
        skipped: 'Antrieb nicht ICE-fähig.',
      };
      const counters: Array<{ label: string; value: string }> = [
        { label: 'Kandidaten (24h/7d)', value: `${rpmCandidates24h} / ${rpmCandidates7d}` },
      ];
      if (lastRpm) {
        counters.push({
          label: 'Letzter Trigger',
          value: `${Math.round(lastRpm.observedValue)} rpm @ ${lastRpm.observedAt.toISOString()}`,
        });
      }
      if (maxRpm7d != null) {
        counters.push({ label: 'Max RPM (7d)', value: `${Math.round(maxRpm7d)} rpm` });
      }
      return {
        status,
        label: labelMap[status] ?? 'Unbekannt',
        detail: detailMap[status] ?? detailMap.unknown,
        counters,
      };
    })();

    const eventContextEnrichment = ((): EventArchitectureDto['eventContextEnrichment'] => {
      if (!powertrainApplicable) {
        return {
          status: 'skipped',
          label: 'Übersprungen',
          detail: 'ICE-Kontextanreicherung nur für LTE_R1/ICE — Tesla/EV übersprungen.',
        };
      }
      let status: EventLayerStatus = 'unknown';
      if (ctxCompleted > 0) status = 'active';
      else if (ctxInsufficient > 0) status = 'insufficient';
      else if (ctxFailed > 0) status = 'failed';
      else if (ctxWindows === 0) status = 'no_events';
      const labelMap: Record<string, string> = {
        active: 'Aktiv',
        insufficient: 'Nicht ausreichend',
        failed: 'Fehlgeschlagen',
        no_events: 'Keine Ereignisse',
        unknown: 'Unbekannt',
      };
      return {
        status,
        label: labelMap[status] ?? 'Unbekannt',
        detail:
          'Kontextfenster um native Events (T±30s) — Signalqualität & konservative Kontextklassifikation.',
        counters: [
          { label: 'Vollständig', value: String(ctxCompleted) },
          { label: 'Nicht ausreichend', value: String(ctxInsufficient) },
          { label: 'Fehler', value: String(ctxFailed) },
          { label: 'Übersprungen', value: String(ctxSkipped) },
        ],
      };
    })();

    const tripSignalSummaryEnrichment = ((): EventArchitectureDto['tripSignalSummaryEnrichment'] => {
      const map: Record<string, { status: EventLayerStatus; label: string }> = {
        hf_available: { status: 'active', label: 'Aktiv' },
        sparse: { status: 'sparse', label: 'Sparse' },
        snapshot_only: { status: 'snapshot_only', label: 'Nur Snapshot (~30s)' },
        missing: { status: 'unavailable', label: 'Nicht verfügbar' },
        unknown: { status: 'unknown', label: 'Unbekannt' },
      };
      const entry = map[hf.hfAvailabilityStatus ?? 'unknown'] ?? map.unknown;
      return {
        status: entry.status,
        label: entry.label,
        detail:
          'Beschreibende Trip-Signal-Zusammenfassung (Geschwindigkeit, Kadenz, Datenqualität) — keine Kurzzeit-Misuse-Erkennung.',
      };
    })();

    return {
      powertrainApplicable,
      powertrainNote: powertrainApplicable
        ? 'LTE_R1/ICE — Motorkontext anwendbar.'
        : nativeCapable
          ? 'LTE_R1, aber kein Verbrennungsmotor — Motorkontext (RPM/Last/Kühlmittel) nicht anwendbar.'
          : 'Kein LTE_R1-Gerät — neue Event-Context-Architektur nicht anwendbar.',
      nativeEventIntake,
      deviceConnectionWebhookIntake,
      rpmWebhookIntake,
      eventContextEnrichment,
      tripSignalSummaryEnrichment,
      detectorFeasibility: {
        nativeBehaviorEvents: nativeCapable,
        deviceConnectionWebhooks: !!hasDimoLink,
        rpmWebhooks: powertrainApplicable && rpmCandidates7d > 0,
        contextClassification: powertrainApplicable,
        shortEventHfDerivedDetection: nativeCapable ? 'disabled' : 'not_reliable',
        notes: [
          'Kurzzeit-Misuse stützt sich auf native Events + Ereigniskontext, nicht auf sparse Whole-Trip-HF.',
          'OBD Ein-/Aus-Events dienen der Konnektivitäts-/Tamper-Evidenz — kein Motormisuse.',
          'RPM-Webhooks sind Evidenz-Anker (>5000 rpm), keine automatischen Misuse-Cases.',
          ...(powertrainApplicable
            ? []
            : ['Tesla/EV: ICE-Motorkontext wird bewusst nicht angewendet.']),
        ],
      },
      metrics: {
        effectiveCadenceMs: medianIntervalMs,
        medianIntervalMs,
        p95IntervalMs,
        missingSignals,
        contextWindowsProcessed: ctxWindows,
        deviceConnectionEvents7d: deviceEvents7d,
        rpmWebhookCandidates7d: rpmCandidates7d,
        openUnpluggedEpisode,
      },
    };
  }

  async getDeviceConnectionEvents(
    orgId: string,
    vehicleId: string,
    opts?: { debugRaw?: boolean },
  ) {
    return this.deviceConnectionQuery.getVehicleSummary(orgId, vehicleId, {
      eventLimit: 50,
      includeRawPayload: opts?.debugRaw === true,
    });
  }

  async getRpmWebhookCandidates(orgId: string, vehicleId: string) {
    return this.rpmWebhookQuery.getVehicleSummary(orgId, vehicleId, { limit: 50 });
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
    const speedSignal = signalRows.find((s) => s.signalName === 'speed');
    const hf = await this.getHighFrequency(orgId, vehicleId);
    const speedHf = hf.signals.find((s) => s.signalKey === 'speed');
    const intervalStats = computeIntervalStats(ctx.chStats?.intervals ?? []);
    const assessment = assessLaunchFeasibility({
      availableSignalNames: available,
      speedIntervalMs: speedHf?.medianIntervalMs ?? speedSignal?.observedIntervalMs ?? intervalStats.medianMs,
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
      observedIntervals: Object.fromEntries(
        hf.signals.map((s) => [s.signalKey, s.medianIntervalMs]),
      ),
      minimumViableIntervalMs: 500,
      providerLimitations,
      recommendation: assessment.recommendation,
      reasons: assessment.reasons,
    };
  }

  async getHealthTrace(orgId: string, vehicleId: string): Promise<HealthTraceDto> {
    await this.assertVehicle(orgId, vehicleId);
    const nowMs = Date.now();
    const ctx = await this.loadVehicleContext(orgId, vehicleId);
    const signalRows = this.buildSignalRows(ctx.latestState, ctx.chStats, ctx.nowMs);

    const brakeSignals = ['speed', 'odometer', 'brake_pad_percent'];
    const tireSignals = ['tire_pressure_fl', 'tire_pressure_fr', 'tire_pressure_rl', 'tire_pressure_rr', 'tire_health_percent', 'speed', 'odometer'];
    const batterySignals = ['lv_battery_voltage', 'ev_soc', 'traction_battery_voltage', 'traction_battery_soh', 'traction_battery_power'];

    const traceSignals = (keys: string[]) =>
      keys.map((k) => {
        const row = signalRows.find((r) => r.signalName === k);
        return {
          signal: k,
          arriving: row?.persisted ?? false,
          lastSeen: row?.lastSeen ?? null,
          intervalStatus: row?.intervalStatus ?? 'Missing',
        };
      });

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

    const tirePressureArriving = [
      'tire_pressure_fl',
      'tire_pressure_fr',
      'tire_pressure_rl',
      'tire_pressure_rr',
    ].some((k) => signalRows.find((r) => r.signalName === k)?.persisted);
    const brakeHasEventInputs = eventCounts.some(
      (e) => e.eventType === 'HARSH_BRAKING' || e.eventType === 'EXTREME_BRAKING',
    );

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
        inputBasis: brake ? (brakeHasEventInputs ? 'mixed' : 'modeled') : 'unknown',
        inputsAvailable: brakeInputs,
        inputsMissing: brakeMissing,
        evidence: {
          padsRemainingKm: brake?.padsRemainingKm ?? null,
          confidenceLabel: brake?.confidenceLabel ?? null,
          modeledTripCount: brake?.modeledTripCount ?? null,
          harshBrakingEvents30d: eventCounts
            .filter((e) => e.eventType === 'HARSH_BRAKING' || e.eventType === 'EXTREME_BRAKING')
            .reduce((a, e) => a + e._count, 0),
          consumedSignals: traceSignals(brakeSignals),
          calculationBlocked: !brake?.isInitialized,
          calculationWeakened: brakeMissing.length > 0,
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
        inputBasis: tireSetup ? (tirePressureArriving ? 'mixed' : 'modeled') : 'unknown',
        inputsAvailable: tireInputs,
        inputsMissing: tireMissing,
        evidence: {
          activeSetupId: tireSetup?.id ?? null,
          overallHealthPercent: tireSetup?.overallHealthPercent ?? null,
          overallRemainingKm: tireSetup?.overallRemainingKm ?? null,
          consumedSignals: traceSignals(tireSignals),
          calculationBlocked: !tireSetup,
          calculationWeakened: tireMissing.length > 0,
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
        inputBasis:
          lvSnapshot && hvBattery
            ? 'mixed'
            : lvSnapshot
              ? 'signal-based'
              : hvBattery
                ? 'modeled'
                : 'unknown',
        inputsAvailable: batteryInputs,
        inputsMissing: batteryMissing,
        evidence: {
          lvVoltage: lvSnapshot?.voltageV ?? null,
          lvSoh: lvSnapshot?.sohPercent ?? null,
          hvPublishedSoh: hvBattery?.publishedSohPct ?? null,
          hvRawSoh: hvBattery?.rawSohPct ?? null,
          consumedSignals: traceSignals(batterySignals),
          calculationBlocked: batteryMissing.length === batterySignals.length,
          calculationWeakened: batteryMissing.length > 0 && batteryMissing.length < batterySignals.length,
        },
        notes: batteryMissing.length
          ? ['Input-source mapping unavailable for some battery scopes.']
          : [],
      },
    };
  }

  async getPipeline(orgId: string, vehicleId: string): Promise<PipelineDto> {
    const vehicle = await this.assertVehicle(orgId, vehicleId);
    const nowMs = Date.now();
    const [latestState, lastPoll, lastTrip, hmTelemetry, waypointCount, hfAvailability] =
      await Promise.all([
        this.prisma.vehicleLatestState.findUnique({ where: { vehicleId } }),
        this.prisma.dimoPollLog.findFirst({
          where: { vehicleId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.vehicleTrip.findFirst({
          where: { vehicleId },
          orderBy: { startTime: 'desc' },
          select: {
            startTime: true,
            behaviorEnrichmentStatus: true,
            behaviorEnrichmentError: true,
          },
        }),
        vehicle.vin
          ? this.prisma.hmLatestTelemetryState.findFirst({
              where: { vin: vehicle.vin },
            })
          : Promise.resolve(null),
        this.countWaypoints24h(vehicleId),
        this.clickHouse.isAvailable
          ? this.clickHouseHf
              .getHfAvailability(
                vehicleId,
                new Date(nowMs - 24 * 60 * 60 * 1000),
                new Date(nowMs),
              )
              .catch(() => null)
          : Promise.resolve(null),
      ]);

    const hfPointCount = hfAvailability?.available ? hfAvailability.pointCount : 0;
    const hfMirrorStatus = resolveHfMirrorStatus();

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
        status: !this.clickHouse.isAvailable
          ? ('unavailable' as const)
          : (waypointCount ?? 0) > 0 || hfPointCount > 0
            ? ('available' as const)
            : ('not_persisted' as const),
        lastSeenAt: hfAvailability?.latestPointAt ?? null,
        sourceName: 'ClickHouse telemetry_hf_points + telemetry_waypoints',
        notes:
          (waypointCount ?? 0) > 0 || hfPointCount > 0
            ? `${hfPointCount} HF point(s) (telemetry_hf_points) and ${waypointCount ?? 0} waypoint(s) (telemetry_waypoints) in last 24h. HF mirror: ${hfMirrorStatus}.`
            : `No HF points in 24h. telemetry_waypoints has no write producer (planned/read-only). HF mirror: ${hfMirrorStatus}.`,
      },
      {
        step: 'Trip processing',
        status: lastTrip ? ('available' as const) : ('unknown' as const),
        lastSeenAt: lastTrip?.startTime?.toISOString() ?? null,
        sourceName: 'TripEnrichmentOrchestrator / vehicle_trips',
        notes:
          lastTrip?.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA'
            ? `Last trip behaviour enrichment skipped — ${describeEnrichmentSkip(lastTrip.behaviorEnrichmentError)}`
            : lastTrip?.behaviorEnrichmentStatus ?? null,
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
    void vehicleId;
    return SIGNAL_GROUP_DEFINITIONS.map((g) => this.mapSignalGroupDefinition(g, 'unknown', 'Select a vehicle and open Overview / Signal Logs for per-vehicle availability.'));
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

      return this.mapSignalGroupDefinition(g, availability, notes);
    });
  }

  private mapSignalGroupDefinition(
    g: (typeof SIGNAL_GROUP_DEFINITIONS)[number],
    availability: SignalGroupDefinitionDto['currentAvailability'],
    notes: string | null,
  ): SignalGroupDefinitionDto {
    return {
      id: g.id,
      groupName: g.groupName,
      description: g.description,
      typicalSignals: [...g.typicalSignals],
      expectedIntervalMs: g.expectedIntervalMs,
      practicalUse: g.practicalUse,
      usedByModules: [...g.usedByModules],
      detectionRelevance: g.detectionRelevance,
      sourceProvider: (g as { sourceProvider?: string }).sourceProvider ?? null,
      storageLocation: (g as { storageLocation?: string }).storageLocation ?? null,
      limitations: (g as { limitations?: string }).limitations ?? null,
      currentAvailability: availability,
      availabilityNotes: notes,
    };
  }

  private resolvePracticalUse(entry: SignalCatalogEntry): HfPracticalUse[] {
    if (entry.practicalUse?.length) return [...entry.practicalUse];
    const out = new Set<HfPracticalUse>();
    for (const mod of entry.usedByModules) {
      if (mod === 'Live Map') out.add('Live Map');
      if (mod === 'Trips' || mod === 'Driving Analysis') out.add('Trip Reconstruction');
      if (mod === 'Brake Health') out.add('Brake Health');
      if (mod === 'Tire Health') out.add('Tire Health');
      if (mod === 'Battery Health') out.add('Battery Health');
      if (mod === 'Alerts') out.add('Alerts');
    }
    return [...out];
  }

  private buildHfExplanation(params: {
    entry: SignalCatalogEntry;
    reliabilityStatus: string;
    launchDetectionUsefulness: string;
    sampleCount24h: number | null;
    medianIntervalMs: number | null;
    waypointCount: number | null;
  }): string {
    const parts: string[] = [];
    parts.push(`Reliability: ${params.reliabilityStatus}.`);
    if (params.sampleCount24h != null) {
      parts.push(`${params.sampleCount24h} samples in 24h.`);
    }
    if (params.medianIntervalMs != null) {
      parts.push(`Median interval ~${Math.round(params.medianIntervalMs / 1000)}s.`);
    }
    if (params.launchDetectionUsefulness !== 'UNKNOWN') {
      parts.push(`Launch detection: ${params.launchDetectionUsefulness}.`);
    }
    if (params.entry.signalName === 'speed' && (params.waypointCount ?? 0) === 0) {
      parts.push('HF waypoint stream absent — speed from snapshots only.');
    }
    return parts.join(' ');
  }

  private async querySignalColumnAggregates(
    vehicleId: string,
    catalog: SignalCatalogEntry[],
  ): Promise<Map<string, SignalColumnAggregate & { intervals?: number[] }>> {
    const out = new Map<string, SignalColumnAggregate & { intervals?: number[] }>();
    if (!this.clickHouse.isAvailable) return out;

    const columns = [
      ...new Set(
        catalog
          .map((c) => c.clickhouseColumn)
          .filter((c): c is string => !!c),
      ),
    ];
    if (columns.length === 0) return out;

    const selects = columns
      .map(
        (col) => `
          countIf(${col} IS NOT NULL AND recorded_at >= now() - INTERVAL 24 HOUR) AS ${col}_cnt_24h,
          countIf(${col} IS NOT NULL AND recorded_at >= now() - INTERVAL 7 DAY) AS ${col}_cnt_7d,
          minIf(recorded_at, ${col} IS NOT NULL AND recorded_at >= now() - INTERVAL 7 DAY) AS ${col}_first,
          maxIf(recorded_at, ${col} IS NOT NULL AND recorded_at >= now() - INTERVAL 7 DAY) AS ${col}_last`,
      )
      .join(',\n');

    try {
      const client = this.clickHouse.getClient();
      const result = await client.query({
        query: `
          SELECT ${selects}
          FROM telemetry_snapshots
          WHERE vehicle_id = {vehicleId:String}
            AND recorded_at >= now() - INTERVAL 7 DAY
        `,
        query_params: { vehicleId },
        format: 'JSONEachRow',
      });
      const rows = await result.json<Record<string, string | number>>();
      const row = rows[0];
      if (!row) return out;
      for (const col of columns) {
        out.set(col, {
          sampleCount24h: Number(row[`${col}_cnt_24h`] ?? 0),
          sampleCount7d: Number(row[`${col}_cnt_7d`] ?? 0),
          firstSeenAt: row[`${col}_first`] ? String(row[`${col}_first`]) : null,
          lastSeenAt: row[`${col}_last`] ? String(row[`${col}_last`]) : null,
        });
      }
    } catch {
      return out;
    }
    return out;
  }

  private async queryColumnIntervalStats(
    vehicleId: string,
    column: string,
    table: 'telemetry_snapshots' | 'telemetry_waypoints',
  ): Promise<SignalIntervalStats | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const client = this.clickHouse.getClient();
      const result = await client.query({
        query: `
          SELECT interval_ms
          FROM (
            SELECT dateDiff('millisecond',
              lagInFrame(recorded_at) OVER (ORDER BY recorded_at),
              recorded_at
            ) AS interval_ms
            FROM ${table}
            WHERE vehicle_id = {vehicleId:String}
              AND ${column} IS NOT NULL
              AND recorded_at >= now() - INTERVAL {hours:UInt16} HOUR
          )
          WHERE interval_ms > 0
          LIMIT 500
        `,
        query_params: { vehicleId, hours: CLICKHOUSE_ANALYSIS_WINDOW_HOURS },
        format: 'JSONEachRow',
      });
      const rows = await result.json<{ interval_ms: number }>();
      const stats = computeIntervalStats(rows.map((r) => r.interval_ms));
      return {
        medianIntervalMs: stats.medianMs,
        p95IntervalMs: stats.p95Ms,
        minIntervalMs: stats.fastestMs,
        maxIntervalMs: stats.slowestMs,
        gapCount: stats.dropoutCount,
        largestGapMs: stats.longestGapMs,
        averageMs: stats.averageMs,
        medianMs: stats.medianMs,
        p95Ms: stats.p95Ms,
        fastestMs: stats.fastestMs,
        slowestMs: stats.slowestMs,
        dropoutCount: stats.dropoutCount,
        intervals: rows.map((r) => r.interval_ms),
      };
    } catch {
      return null;
    }
  }

  private async queryWaypointColumnStats(
    vehicleId: string,
    column: string,
  ): Promise<(SignalColumnAggregate & { intervals?: number[] }) | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const client = this.clickHouse.getClient();
      const agg = await client.query({
        query: `
          SELECT
            countIf(${column} IS NOT NULL AND recorded_at >= now() - INTERVAL 24 HOUR) AS cnt_24h,
            countIf(${column} IS NOT NULL AND recorded_at >= now() - INTERVAL 7 DAY) AS cnt_7d,
            minIf(recorded_at, ${column} IS NOT NULL) AS first_at,
            maxIf(recorded_at, ${column} IS NOT NULL) AS last_at
          FROM telemetry_waypoints
          WHERE vehicle_id = {vehicleId:String}
            AND recorded_at >= now() - INTERVAL 7 DAY
        `,
        query_params: { vehicleId },
        format: 'JSONEachRow',
      });
      const rows = await agg.json<{
        cnt_24h: string;
        cnt_7d: string;
        first_at: string | null;
        last_at: string | null;
      }>();
      const row = rows[0];
      if (!row) return null;
      const intervals = await this.queryColumnIntervalStats(vehicleId, column, 'telemetry_waypoints');
      return {
        sampleCount24h: Number(row.cnt_24h ?? 0),
        sampleCount7d: Number(row.cnt_7d ?? 0),
        firstSeenAt: row.first_at,
        lastSeenAt: row.last_at,
        intervals: intervals?.intervals,
      };
    } catch {
      return null;
    }
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

  private countWaypoints24h(vehicleId: string): Promise<number | null> {
    return this.countWaypoints(vehicleId, CLICKHOUSE_ANALYSIS_WINDOW_HOURS);
  }

  /** Count telemetry_waypoints (route stream) rows in a trailing window. */
  private async countWaypoints(
    vehicleId: string,
    hours: number,
  ): Promise<number | null> {
    return this.countTableRows('telemetry_waypoints', vehicleId, hours);
  }

  /** Count telemetry_snapshots (~30s snapshot mirror) rows in a window. */
  private async countSnapshots(
    vehicleId: string,
    hours: number,
  ): Promise<number | null> {
    return this.countTableRows('telemetry_snapshots', vehicleId, hours);
  }

  private async countTableRows(
    table: 'telemetry_waypoints' | 'telemetry_snapshots',
    vehicleId: string,
    hours: number,
  ): Promise<number | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const client = this.clickHouse.getClient();
      const result = await client.query({
        query: `
          SELECT count() AS cnt
          FROM ${table}
          WHERE vehicle_id = {vehicleId:String}
            AND recorded_at >= now() - INTERVAL {hours:UInt16} HOUR
        `,
        query_params: { vehicleId, hours },
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
