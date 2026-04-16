import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  SohPublicationState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryHealthService } from './battery-health.service';
import { BatteryV2Service } from './battery-v2.service';
import { BatteryEvidenceService } from './battery-evidence.service';
import { HvBatteryHealthService } from './hv-battery-health.service';
import { daysBetween, getLvCalibrationProgress } from './soh-publication';

export type BatteryStatus =
  | 'ready'
  | 'calibrating'
  | 'stabilizing'
  | 'no_recent_data'
  | 'estimate_unavailable'
  | 'unsupported';

export type BatteryCondition =
  | 'good'
  | 'watch'
  | 'attention'
  | 'calibrating'
  | 'unknown';

export interface FreshnessInfo {
  observedAt: string | null;
  ageMs: number | null;
  isFresh: boolean;
}

function freshnessFromDate(date: Date | null | undefined, maxAgeMs: number): FreshnessInfo {
  if (!date) {
    return { observedAt: null, ageMs: null, isFresh: false };
  }
  const ageMs = Math.max(0, Date.now() - date.getTime());
  return {
    observedAt: date.toISOString(),
    ageMs,
    isFresh: ageMs <= maxAgeMs,
  };
}

function mapEvidenceSource(source: BatteryEvidenceSourceType | null | undefined): string | null {
  if (!source) return null;
  return source.toLowerCase();
}

function parseNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

@Injectable()
export class CanonicalBatteryHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryHealthService: BatteryHealthService,
    private readonly batteryV2Service: BatteryV2Service,
    private readonly hvBatteryHealthService: HvBatteryHealthService,
    private readonly batteryEvidenceService: BatteryEvidenceService,
  ) {}

  async getSummary(vehicleId: string) {
    const [
      vehicle,
      latestState,
      latestLvSnapshot,
      trend7,
      trend30,
      v2,
      hvStatus,
      specs,
      batteryEvents,
      lvEvidenceRecent,
      hvProviderSohEvidence,
    ] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, fuelType: true, hvBatteryCapacityKwh: true },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastSeenAt: true,
          lvBatteryVoltage: true,
          evSoc: true,
          rangeKm: true,
          tractionBatteryPowerKw: true,
          tractionBatterySohPercent: true,
          tractionBatteryTemperatureC: true,
          tractionBatteryChargingPowerKw: true,
          tractionBatteryAddedEnergyKwh: true,
          tractionBatteryIsCharging: true,
          tractionBatteryChargingCableConnected: true,
          tractionBatteryCurrentVoltage: true,
          tractionBatteryGrossCapacityKwh: true,
          tractionBatteryCurrentEnergyKwh: true,
        },
      }),
      this.batteryHealthService.getLatest(vehicleId),
      this.batteryHealthService.getSohTrend(vehicleId, 7),
      this.batteryHealthService.getSohTrend(vehicleId, 30),
      this.batteryV2Service.getV2Health(vehicleId),
      this.hvBatteryHealthService.getHvBatteryStatus(vehicleId),
      this.prisma.vehicleBatterySpec.findFirst({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleServiceEvent.findMany({
        where: { vehicleId, eventType: 'BATTERY_REPLACEMENT' },
        orderBy: { eventDate: 'desc' },
        take: 10,
      }),
      this.batteryEvidenceService.listRecent(vehicleId, {
        scope: BatteryEvidenceScope.LV,
        take: 25,
      }),
      this.batteryEvidenceService.getLatest(vehicleId, {
        scope: BatteryEvidenceScope.HV,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
      }),
    ]);

    if (!vehicle) return null;

    const isEv =
      vehicle.fuelType === 'ELECTRIC' || vehicle.fuelType === 'PLUGIN_HYBRID';
    const lvPubState: SohPublicationState =
      (v2?.publicationState as SohPublicationState | undefined) ??
      SohPublicationState.INITIAL_CALIBRATION;
    const lvIsCalibrating = lvPubState === SohPublicationState.INITIAL_CALIBRATION;
    const lvIsStabilizing = lvPubState === SohPublicationState.STABILIZING;

    const lvVoltage =
      parseNum(latestLvSnapshot?.voltageV) ??
      parseNum(latestState?.lvBatteryVoltage) ??
      null;
    const lvPublishedSoh = parseNum(v2?.publishedSohPct);
    const lvLegacySoh = parseNum(latestLvSnapshot?.sohPercent);
    const lvHealthPercent = lvIsCalibrating
      ? null
      : lvPublishedSoh ?? lvLegacySoh ?? null;
    const lvEstimatedHealthPercent = lvIsCalibrating
      ? parseNum(v2?.stabilizedSohPct) ??
        parseNum(v2?.rawSohPct) ??
        parseNum(v2?.estimatedSohPct)
      : null;

    const lvLastChecked =
      latestLvSnapshot?.recordedAt ??
      (latestState?.lastSeenAt ?? null);
    const lvFreshness = freshnessFromDate(lvLastChecked, 48 * 60 * 60 * 1000);

    let lvCondition: BatteryCondition = 'unknown';
    if (lvIsCalibrating) lvCondition = 'calibrating';
    else if (lvHealthPercent != null) {
      if (lvHealthPercent < 50) lvCondition = 'attention';
      else if (lvHealthPercent < 70) lvCondition = 'watch';
      else lvCondition = 'good';
    } else if (lvVoltage != null) {
      if (lvVoltage < 11.5) lvCondition = 'attention';
      else if (lvVoltage < 12.0) lvCondition = 'watch';
      else lvCondition = 'good';
    }

    const lvStatus: BatteryStatus = !lvVoltage && !v2
      ? 'estimate_unavailable'
      : lvIsCalibrating
        ? 'calibrating'
        : lvIsStabilizing
          ? 'stabilizing'
          : lvFreshness.isFresh
            ? 'ready'
            : 'no_recent_data';

    const lvCalibrationProgress = getLvCalibrationProgress({
      qualifiedEventCount: v2?.qualifiedEventCount ?? 0,
      daysSinceFirstMeasurement: daysBetween(
        (v2?.firstUsableMeasurementAt as Date | null | undefined) ?? null,
        new Date(),
      ),
      restObservationCount: v2?.restObservationCount ?? 0,
      crankObservationCount: v2?.crankObservationCount ?? 0,
    });

    const trendDirection = this.computeTrendDirection(trend30);
    const hvStatusAny = hvStatus as any;

    const providerSohFromLatestState = parseNum(
      latestState?.tractionBatterySohPercent,
    );
    const providerSohFromEvidence = parseNum(hvProviderSohEvidence?.numericValue);
    const providerSoh = providerSohFromEvidence ?? providerSohFromLatestState;
    const providerSohFreshness = freshnessFromDate(
      hvProviderSohEvidence?.observedAt ??
        (latestState?.lastSeenAt ?? null),
      45 * 24 * 60 * 60 * 1000,
    );

    const hvPublishedSoh = parseNum(hvStatusAny?.publishedSohPercent);
    const hvRawSoh = parseNum(hvStatusAny?.rawSohPercent);
    const hvModelSoh = parseNum(hvStatusAny?.sohPercent);

    const hvHealthPercent =
      providerSoh != null && providerSohFreshness.isFresh
        ? providerSoh
        : hvPublishedSoh ?? hvRawSoh ?? hvModelSoh ?? null;

    const hvSourceType =
      providerSoh != null && providerSohFreshness.isFresh
        ? 'provider_reported'
        : mapEvidenceSource(
            hvProviderSohEvidence?.sourceType ??
              (hvStatusAny?.sohSourceType as
                | BatteryEvidenceSourceType
                | undefined),
          ) ??
          (hvStatusAny?.sohMethod === 'degradation_model'
            ? 'model_derived'
            : hvStatusAny?.sohMethod
              ? 'telemetry_derived'
              : null);

    const hvMethod =
      providerSoh != null && providerSohFreshness.isFresh
        ? 'provider_reported_soh'
        : (hvStatusAny?.sohMethod ?? null);

    const hvLastObservedAt =
      hvProviderSohEvidence?.observedAt ??
      (hvStatusAny?.lastRecordedAt
        ? new Date(hvStatusAny.lastRecordedAt)
        : null) ??
      latestState?.lastSeenAt ??
      null;
    const hvFreshness = freshnessFromDate(hvLastObservedAt, 7 * 24 * 60 * 60 * 1000);

    const hvStatusLabel: BatteryStatus = !isEv
      ? 'unsupported'
      : hvHealthPercent == null
        ? 'estimate_unavailable'
        : hvFreshness.isFresh
          ? 'ready'
          : 'no_recent_data';

    const hvCondition: BatteryCondition = !isEv
      ? 'unknown'
      : hvHealthPercent == null
        ? 'unknown'
        : hvHealthPercent < 60
          ? 'attention'
          : hvHealthPercent < 75
            ? 'watch'
            : 'good';

    const lvWatchpoints: string[] = [];
    if (lvHealthPercent != null && lvHealthPercent < 60) {
      lvWatchpoints.push('LV health below 60%');
    }
    if (lvVoltage != null && lvVoltage < 12.0) {
      lvWatchpoints.push('LV voltage below 12.0V');
    }
    if (lvStatus === 'no_recent_data') {
      lvWatchpoints.push('No recent LV sample');
    }

    const hvWatchpoints: string[] = [];
    if (isEv && hvHealthPercent != null && hvHealthPercent < 70) {
      hvWatchpoints.push('HV health indicates notable degradation');
    }
    if (isEv && hvStatusLabel === 'no_recent_data') {
      hvWatchpoints.push('No recent HV health sample');
    }

    const watchpoints = [...lvWatchpoints, ...hvWatchpoints];
    const recommendations: string[] = [];
    if (lvCondition === 'attention') {
      recommendations.push('Schedule LV battery electrical check');
    }
    if (hvCondition === 'attention') {
      recommendations.push('Schedule traction battery diagnostics');
    }
    if (watchpoints.length === 0) {
      recommendations.push('Battery systems currently stable');
    }

    const history = [
      ...trend30
        .slice(-20)
        .reverse()
        .map((s) => ({
          id: s.recordedAt.toISOString(),
          type: 'measurement' as const,
          date: s.recordedAt.toISOString(),
          soh: s.sohPercent ?? null,
          voltage: s.voltageV ?? null,
          temperature: null,
        })),
      ...batteryEvents.map((e) => ({
        id: e.id,
        type: 'service' as const,
        date: e.eventDate.toISOString(),
        notes: e.notes,
        workshopName: e.workshopName,
        odometerKm: e.odometerKm,
      })),
    ]
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 20);

    const summary = {
      vehicleId,
      generatedAt: new Date().toISOString(),
      support: {
        lv: true,
        hv: isEv,
      },
      lv: {
        status: lvStatus,
        condition: lvCondition,
        healthPercent: lvHealthPercent,
        estimatedHealthPercent: lvEstimatedHealthPercent,
        method: lvIsCalibrating
          ? 'model_derived'
          : lvPublishedSoh != null
            ? 'telemetry_derived'
            : lvLegacySoh != null
              ? 'telemetry_derived'
              : 'estimate_unavailable',
        confidence: (v2?.maturityConfidence as string | undefined) ?? 'none',
        freshness: lvFreshness,
        evidenceType:
          lvIsCalibrating
            ? 'model_derived'
            : lvEvidenceRecent[0]?.sourceType
              ? mapEvidenceSource(lvEvidenceRecent[0].sourceType)
              : 'telemetry_derived',
        publicationState: lvPubState,
        telemetry: {
          voltageV: lvVoltage,
          restingVoltage: parseNum(latestLvSnapshot?.restingVoltage),
          crankingVoltage: parseNum(latestLvSnapshot?.crankingVoltage),
          chargingVoltage: parseNum(latestLvSnapshot?.chargingVoltage),
          temperatureC: parseNum(latestLvSnapshot?.temperatureC),
        },
        calibrationProgress: {
          ...lvCalibrationProgress,
          lastMeasurementAgeMs: lvFreshness.ageMs,
        },
      },
      hv: {
        status: hvStatusLabel,
        condition: hvCondition,
        healthPercent: hvHealthPercent,
        method: hvMethod,
        confidence: (hvStatusAny?.maturityConfidence as string | undefined) ?? 'none',
        freshness: hvFreshness,
        evidenceType: hvSourceType,
        publicationState:
          (hvStatusAny?.publicationState as SohPublicationState | undefined) ??
          SohPublicationState.INITIAL_CALIBRATION,
        telemetry: {
          socPercent:
            parseNum(latestState?.evSoc) ??
            parseNum(hvStatusAny?.currentSocPercent),
          rangeKm:
            parseNum(latestState?.rangeKm) ??
            parseNum(hvStatusAny?.estimatedRangeKm),
          chargingPowerKw:
            parseNum(latestState?.tractionBatteryChargingPowerKw) ??
            parseNum(hvStatusAny?.telemetry?.chargingPowerKw) ??
            parseNum(hvStatusAny?.chargingPowerKw),
          isCharging:
            latestState?.tractionBatteryIsCharging ??
            (hvStatusAny?.telemetry?.isCharging ??
              hvStatusAny?.isCharging ??
              null),
          chargingCableConnected:
            latestState?.tractionBatteryChargingCableConnected ?? null,
          temperatureC:
            parseNum(latestState?.tractionBatteryTemperatureC) ??
            parseNum(hvStatusAny?.telemetry?.temperatureC) ??
            parseNum(hvStatusAny?.temperatureC),
          currentVoltageV:
            parseNum(latestState?.tractionBatteryCurrentVoltage) ?? null,
          grossCapacityKwh:
            parseNum(latestState?.tractionBatteryGrossCapacityKwh) ??
            parseNum(hvStatusAny?.nominalCapacityKwh),
          currentEnergyKwh:
            parseNum(latestState?.tractionBatteryCurrentEnergyKwh) ?? null,
          addedEnergyKwh:
            parseNum(latestState?.tractionBatteryAddedEnergyKwh) ?? null,
          providerSohPercent: providerSoh,
        },
        snapshotCount: parseNum(hvStatusAny?.snapshotCount) ?? 0,
        interpretation: hvStatusAny?.sohInterpretation ?? null,
      },
      currentTelemetry: {
        observedAt: latestState?.lastSeenAt?.toISOString() ?? null,
        socPercent: parseNum(latestState?.evSoc),
        rangeKm: parseNum(latestState?.rangeKm),
        chargingState:
          latestState?.tractionBatteryIsCharging == null
            ? null
            : latestState.tractionBatteryIsCharging
              ? 'charging'
              : 'not_charging',
        chargingPowerKw:
          parseNum(latestState?.tractionBatteryChargingPowerKw) ??
          parseNum(latestState?.tractionBatteryPowerKw),
        lvVoltageV: parseNum(latestState?.lvBatteryVoltage),
        genericEnergyPercent: parseNum(latestState?.evSoc),
      },
      watchpoints,
      recommendations,

      // Compatibility layer for existing read models (temporary).
      currentState: {
        sohPercent: lvHealthPercent,
        publishedSohPct: lvPublishedSoh,
        estimatedSohPct: lvEstimatedHealthPercent,
        publicationState: lvPubState,
        maturityConfidence: (v2?.maturityConfidence as string | undefined) ?? 'none',
        voltageV: lvVoltage,
        temperatureC: parseNum(latestLvSnapshot?.temperatureC),
        lastChecked: lvFreshness.observedAt,
        restingVoltage: parseNum(latestLvSnapshot?.restingVoltage),
        crankingVoltage: parseNum(latestLvSnapshot?.crankingVoltage),
        chargingVoltage: parseNum(latestLvSnapshot?.chargingVoltage),
        calibrationProgress: {
          ...lvCalibrationProgress,
          lastMeasurementAgeMs: lvFreshness.ageMs,
        },
      },
      condition:
        lvCondition === 'calibrating'
          ? 'calibrating'
          : lvCondition === 'unknown'
            ? 'watch'
            : lvCondition,
      trendDirection,
      specs: specs
        ? {
            batteryType: specs.batteryType,
            batteryAmpere: specs.batteryAmpere,
            batteryVolt: specs.batteryVolt,
            sourceType: specs.sourceType,
          }
        : null,
      trend7: trend7.map((d) => ({
        date: d.recordedAt.toISOString(),
        soh: d.sohPercent ?? null,
        voltage: d.voltageV ?? null,
      })),
      trend30: trend30.map((d) => ({
        date: d.recordedAt.toISOString(),
        soh: d.sohPercent ?? null,
        voltage: d.voltageV ?? null,
      })),
      history,
    };

    return summary;
  }

  async getDetail(vehicleId: string) {
    const summary = await this.getSummary(vehicleId);
    if (!summary) return null;

    const [lvEvidence, hvEvidence, hvStatus] = await Promise.all([
      this.batteryEvidenceService.listRecent(vehicleId, {
        scope: BatteryEvidenceScope.LV,
        take: 100,
      }),
      this.batteryEvidenceService.listRecent(vehicleId, {
        scope: BatteryEvidenceScope.HV,
        take: 120,
      }),
      this.hvBatteryHealthService.getHvBatteryStatus(vehicleId),
    ]);

    return {
      ...summary,
      detail: {
        lv: {
          evidence: lvEvidence.map((e) => ({
            id: e.id,
            observedAt: e.observedAt.toISOString(),
            sourceType: mapEvidenceSource(e.sourceType),
            valueType: e.valueType,
            value: e.numericValue,
            unit: e.unit,
            provider: e.provider,
            confidence: e.confidence,
            quality: e.quality,
            documentExtractionId: e.documentExtractionId,
            serviceEventId: e.serviceEventId,
          })),
        },
        hv: {
          evidence: hvEvidence.map((e) => ({
            id: e.id,
            observedAt: e.observedAt.toISOString(),
            sourceType: mapEvidenceSource(e.sourceType),
            valueType: e.valueType,
            value: e.numericValue,
            unit: e.unit,
            provider: e.provider,
            confidence: e.confidence,
            quality: e.quality,
            documentExtractionId: e.documentExtractionId,
            serviceEventId: e.serviceEventId,
          })),
          chargingSessions: (hvStatus as any)?.chargingSessions ?? [],
          recentTrend: (hvStatus as any)?.recentTrend ?? [],
        },
      },
    };
  }

  private computeTrendDirection(
    trend30: Array<{ sohPercent: number | null; voltageV: number | null }>,
  ): 'stable' | 'declining' | 'improving' | 'unknown' {
    if (!Array.isArray(trend30) || trend30.length < 3) return 'unknown';
    const first = trend30.slice(0, Math.ceil(trend30.length / 3));
    const last = trend30.slice(-Math.ceil(trend30.length / 3));
    const avgFirst =
      first.reduce((s, d) => s + (d.sohPercent ?? d.voltageV ?? 0), 0) /
      first.length;
    const avgLast =
      last.reduce((s, d) => s + (d.sohPercent ?? d.voltageV ?? 0), 0) /
      last.length;
    const delta = avgLast - avgFirst;
    if (Math.abs(delta) < 2) return 'stable';
    if (delta > 0) return 'improving';
    return 'declining';
  }
}
