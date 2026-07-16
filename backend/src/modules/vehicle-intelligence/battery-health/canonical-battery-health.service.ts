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
import {
  aggregateLvStatus,
  classifyHvSoh,
  classifyLvEstimatedHealth,
  classifyRestingVoltage,
  selectBestBatterySpec,
  specUsedForRestingThresholds,
  statusToBars,
  statusToLegacyCondition,
  type BatteryHealthStatus,
  type LvAggregateStatus,
} from './battery-status';
import {
  ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
  ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
  LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
  mapLvEvidenceValueType,
} from './battery-lv-semantics';
import {
  effectiveHvMeasuredSohForDecisions,
  presentLegacyHvCapacity,
} from './hv-capacity-policy';
import {
  effectiveLvEstimatedHealthStatusForDecisions,
  evaluateLegacyPublicationSafety,
} from './battery-legacy-publication-safety';
import {
  effectiveCrankObservationCountForMaturity,
  presentLegacyCrankFeatures,
} from './battery-crank-policy';
import { LvStartProxyDiagnosticService } from './lv-start-proxy/lv-start-proxy-diagnostic.service';
import {
  buildBatteryDataQualitySlices,
  presentBatteryDataQuality,
  resolveCrankDataQuality,
  resolveHvLegacyCapacityDataQuality,
  resolveHvSohDataQuality,
  resolveLvEstimatedHealthDataQuality,
  resolveRestingVoltageDataQuality,
  type BatteryDataQualityStatus,
} from './battery-data-quality';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildBatteryDomainFreshnessBundle,
  buildFetchFreshness,
  buildObservationFreshness,
  buildUnavailableObservationFreshness,
  observationFreshnessIsDecisionFresh,
  toLegacyFreshnessInfo,
  type LegacyFreshnessInfo,
} from './battery-freshness.policy';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { resolveBatteryPolicy } from '../battery-policy-profile/battery-policy-profile.resolver';
import { BatteryPolicyProfile } from '../battery-policy-profile/battery-policy-profile.types';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from './battery-v2-domain';
import type { CanonicalLvBatteryResponse } from './lv-canonical/lv-canonical-battery.types';
import { LV_CANONICAL_RESOLVER_VERSION } from './lv-canonical/lv-canonical-battery.types';
import { HvMethodProfileService } from './hv-method-profile/hv-method-profile.service';
import { LvCanonicalBatteryResolverService } from './lv-canonical/lv-canonical-battery-resolver.service';
import { BatteryAssessmentRepository } from './battery-assessment.repository';
import {
  buildCanonicalBatteryDto,
  collectStaleReasons,
  collectUnsupportedReasons,
  mapChargeSessionInputRow,
  mapCrossSessionAssessmentRow,
  mapLiveStatusFromLegacy,
  mapReferenceCapacityRow,
  mapSohGateAssessmentRow,
  type CanonicalBatteryDto,
} from './canonical-battery';
import {
  buildCanonicalBatterySignalFreshness,
  collectCapabilitySignalErrors,
} from './canonical-battery/canonical-battery-signal-freshness.builder';
import {
  classifyBatteryModuleError,
  type BatterySignalError,
} from './battery-signal-freshness.contract';

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

/** Source of a HV SOH value — never a model/age fallback anymore. */
export type HvSohSource = 'PROVIDER' | 'CAPACITY_ESTIMATE' | 'DOCUMENT' | 'MANUAL';

/** @deprecated Use structured `fetchFreshness` / `observationFreshness` from battery-freshness.policy. */
export type FreshnessInfo = LegacyFreshnessInfo;

function mapEvidenceSource(source: BatteryEvidenceSourceType | null | undefined): string | null {
  if (!source) return null;
  return source.toLowerCase();
}

function parseNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function createUnavailableLvCanonicalFallback(
  vehicleId: string,
  now: Date,
): CanonicalLvBatteryResponse {
  const unavailableFreshness = buildBatteryDomainFreshnessBundle({
    fetch: buildFetchFreshness({ fetchedAt: null, now }),
    observation: buildUnavailableObservationFreshness(),
  });
  return {
    resolverVersion: LV_CANONICAL_RESOLVER_VERSION,
    vehicleId,
    resolvedAt: now.toISOString(),
    profile: {
      profile: BatteryPolicyProfile.ICE_LEAD_ACID,
      driveProfile: BatteryDriveProfile.UNKNOWN,
      lvAssessmentAllowed: false,
      supported: false,
    },
    chemistry: {
      chemistry: BatteryChemistry.UNKNOWN,
      chemicalSocEstimationAllowed: false,
    },
    primaryTruth: {
      source: 'UNAVAILABLE',
      estimatedHealthScore: null,
      semanticType: 'ESTIMATED_HEALTH_NOT_SOH',
      labelDe: 'Geschätzter 12V-Batteriezustand',
      decisionCapable: false,
    },
    liveVoltage: null,
    latestQualifiedRestMeasurement: null,
    latestStartProxy: null,
    assessment: null,
    publication: null,
    freshness: unavailableFreshness,
    quality: {
      aggregate: { status: 'UNAVAILABLE', labelKey: 'battery.data_quality.unavailable', decisionCapable: false, observedAt: null },
      primaryTruth: { status: 'UNAVAILABLE', labelKey: 'battery.data_quality.unavailable', decisionCapable: false, observedAt: null },
    },
    legacyDiagnostic: null,
    unsupported: true,
    unavailable: true,
  };
}

@Injectable()
export class CanonicalBatteryHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryHealthService: BatteryHealthService,
    private readonly batteryV2Service: BatteryV2Service,
    private readonly hvBatteryHealthService: HvBatteryHealthService,
    private readonly batteryEvidenceService: BatteryEvidenceService,
    private readonly startProxyDiagnostic: LvStartProxyDiagnosticService,
    private readonly lvCanonicalResolver: LvCanonicalBatteryResolverService,
    private readonly policyProfileService: BatteryPolicyProfileService,
    private readonly hvMethodProfileService: HvMethodProfileService,
    private readonly batteryAssessments: BatteryAssessmentRepository,
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
      hvReportedSohEvidence,
    ] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, organizationId: true, fuelType: true, hvBatteryCapacityKwh: true },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastSeenAt: true,
          providerFetchedAt: true,
          sourceTimestamp: true,
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
      this.prisma.vehicleBatterySpec.findMany({
        where: { vehicleId },
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
      // Workshop / document / manual HV SOH — a real, human-verified data
      // basis that ranks above modeled telemetry estimates.
      this.batteryEvidenceService.getLatestAmongSources(vehicleId, {
        scope: BatteryEvidenceScope.HV,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        sourceTypes: [
          BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
          BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
          BatteryEvidenceSourceType.MANUAL_REPORT,
        ],
      }),
    ]);

    if (!vehicle) return null;

    const decisionNow = new Date();
    const moduleErrors: BatterySignalError[] = [];

    const settled = await Promise.allSettled([
      this.lvCanonicalResolver.resolveForVehicle({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        now: decisionNow,
      }),
      this.policyProfileService.resolveForVehicle(vehicleId),
      this.hvMethodProfileService.resolveForVehicle({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        now: decisionNow,
      }),
      this.batteryAssessments.findLatestHvCapacityShadow({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
      }),
      this.batteryAssessments.findLatestHvSohGateAssessment({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
      }),
      this.prisma.vehicleBatteryReferenceCapacity.findFirst({
        where: {
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          isActive: true,
        },
        orderBy: { effectiveFrom: 'desc' },
        select: {
          id: true,
          capacityKwh: true,
          capacityType: true,
          source: true,
          verificationStatus: true,
          verifiedAt: true,
        },
      }),
      this.prisma.hvChargeSession.findMany({
        where: {
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
        },
        orderBy: [{ isOngoing: 'desc' }, { endAt: 'desc' }],
        take: 8,
        select: {
          id: true,
          source: true,
          startAt: true,
          endAt: true,
          isOngoing: true,
          metadata: true,
        },
      }),
    ]);

    const moduleNames = [
      'lvCanonical',
      'batteryPolicy',
      'hvMethodProfile',
      'hvCapacityShadow',
      'hvSohGate',
      'referenceCapacity',
      'hvChargeSessions',
    ] as const;

    const unwrap = <T>(result: PromiseSettledResult<T>, module: (typeof moduleNames)[number]): T | null => {
      if (result.status === 'fulfilled') return result.value;
      moduleErrors.push(classifyBatteryModuleError(module, result.reason));
      return null;
    };

    const lvCanonicalResult = unwrap(settled[0]!, 'lvCanonical');
    const policyResult = unwrap(settled[1]!, 'batteryPolicy');
    const hvMethodProfileResult = unwrap(settled[2]!, 'hvMethodProfile');
    const crossSessionRow = unwrap(settled[3]!, 'hvCapacityShadow');
    const sohGateRow = unwrap(settled[4]!, 'hvSohGate');
    const referenceCapacityRow = unwrap(settled[5]!, 'referenceCapacity');
    const chargeSessionRows = unwrap(settled[6]!, 'hvChargeSessions');

    const isEvVehicle =
      vehicle.fuelType === 'ELECTRIC' || vehicle.fuelType === 'PLUGIN_HYBRID';
    const lvCanonical =
      lvCanonicalResult ??
      createUnavailableLvCanonicalFallback(vehicle.id, decisionNow);
    const policy =
      policyResult ??
      resolveBatteryPolicy({
        driveProfile: isEvVehicle ? BatteryDriveProfile.BEV : BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.UNKNOWN,
        lvSignalPresent: parseNum(latestState?.lvBatteryVoltage) != null,
      });
    const hvMethodProfile =
      hvMethodProfileResult ?? {
        resolverVersion: '1.0.0',
        vehicleId: vehicle.id,
        resolvedAt: decisionNow.toISOString(),
        socAvailable: false,
        currentEnergyAvailable: false,
        addedEnergyAvailable: false,
        rechargeSegmentsAvailable: false,
        isChargingAvailable: false,
        chargingCableConnectedAvailable: false,
        providerSohAvailable: false,
        grossCapacityAvailable: false,
        packTemperatureAvailable: false,
        chargingPowerAvailable: false,
        currentPowerAvailable: false,
        supportedCapacityMethods: [],
        unsupportedReasons: [],
        lastCheckedAt: null,
        dataQuality: {
          status: 'UNAVAILABLE',
          labelKey: 'battery.data_quality.unavailable',
          decisionCapable: false,
          observedAt: null,
        },
      };
    const safeChargeSessionRows = chargeSessionRows ?? [];

    const selectedBatterySpec = selectBestBatterySpec(specs);

    const isEv =
      vehicle.fuelType === 'ELECTRIC' || vehicle.fuelType === 'PLUGIN_HYBRID';
    const lvPubState: SohPublicationState =
      (v2?.publicationState as SohPublicationState | undefined) ??
      SohPublicationState.INITIAL_CALIBRATION;
    const lvIsCalibrating = lvPubState === SohPublicationState.INITIAL_CALIBRATION;
    const lvIsStabilizing = lvPubState === SohPublicationState.STABILIZING;

    // LV voltage truth: prefer the fresher carrier between the legacy resting
    // snapshot (written only during qualified rest windows) and the live
    // VehicleLatestState (written on every DIMO snapshot).
    //
    // The previous implementation always picked the legacy snapshot first,
    // which caused a stale 12 V resting value to mask a fresh live 14 V
    // reading while the engine was running or the 12 V battery was being
    // charged by the alternator / DC-DC converter.
    const snapshotVoltage = parseNum(latestLvSnapshot?.voltageV);
    const stateVoltage = parseNum(latestState?.lvBatteryVoltage);
    const snapshotAt: Date | null = latestLvSnapshot?.recordedAt ?? null;
    const stateAt: Date | null = latestState?.lastSeenAt ?? null;

    let lvVoltage: number | null;
    let lvVoltageAt: Date | null;
    let lvVoltageSource: 'resting_snapshot' | 'live_telemetry' | null;

    if (snapshotVoltage != null && stateVoltage != null) {
      const snapshotNewer =
        snapshotAt && stateAt
          ? snapshotAt.getTime() >= stateAt.getTime()
          : snapshotAt != null;
      if (snapshotNewer) {
        lvVoltage = snapshotVoltage;
        lvVoltageAt = snapshotAt;
        lvVoltageSource = 'resting_snapshot';
      } else {
        lvVoltage = stateVoltage;
        lvVoltageAt = stateAt;
        lvVoltageSource = 'live_telemetry';
      }
    } else if (snapshotVoltage != null) {
      lvVoltage = snapshotVoltage;
      lvVoltageAt = snapshotAt;
      lvVoltageSource = 'resting_snapshot';
    } else if (stateVoltage != null) {
      lvVoltage = stateVoltage;
      lvVoltageAt = stateAt;
      lvVoltageSource = 'live_telemetry';
    } else {
      lvVoltage = null;
      lvVoltageAt = null;
      lvVoltageSource = null;
    }

    // LV "Estimated Battery Health" — a behaviour-derived score from the V2
    // publication pipeline (rest voltage, crank drop, recovery, stability).
    // It is NOT a workshop SOH; the UI must render it as a 3-bar indicator,
    // never as a prominent "SOH %". The legacy voltage→SOH lookup table has
    // been removed, so there is no second LV truth anymore.
    const lvPublishedSoh = parseNum(v2?.publishedSohPct);
    const lvHealthPercent = lvIsCalibrating ? null : lvPublishedSoh;
    const lvEstimatedHealthPercent = lvIsCalibrating
      ? parseNum(v2?.stabilizedSohPct) ??
        parseNum(v2?.rawSohPct) ??
        parseNum(v2?.estimatedSohPct)
      : null;

    // Estimated-health status: only classify once a published score exists
    // (i.e. not during INITIAL_CALIBRATION) — otherwise it stays UNKNOWN.
    const lvEstimatedHealthStatusRaw: BatteryHealthStatus = lvIsCalibrating
      ? 'UNKNOWN'
      : classifyLvEstimatedHealth(lvPublishedSoh);
    const legacyPublicationSafety = evaluateLegacyPublicationSafety({
      publicationState: lvPubState,
      publishedSohPct: lvPublishedSoh,
      maturityConfidence: (v2?.maturityConfidence as string | undefined) ?? null,
      vOff60m: parseNum(v2?.vOff60m),
      vOff6h: parseNum(v2?.vOff6h),
      rest60mCapturedAt: (v2?.rest60mCapturedAt as Date | null | undefined) ?? null,
      rest6hCapturedAt: (v2?.rest6hCapturedAt as Date | null | undefined) ?? null,
      crankDrop: parseNum(v2?.crankDrop),
      crankObservationCount: v2?.crankObservationCount ?? 0,
      crankAt: (v2?.crankAt as Date | null | undefined) ?? null,
      scoredAt: (v2?.scoredAt as Date | null | undefined) ?? null,
      lastPublishedAt: (v2?.lastPublishedAt as Date | null | undefined) ?? null,
      batteryTypeRaw: selectedBatterySpec?.batteryType ?? null,
      lvEvidenceRecent: lvEvidenceRecent.map((e) => ({
        valueType: e.valueType,
        sourceType: e.sourceType,
      })),
    });
    const lvEstimatedHealthStatus: BatteryHealthStatus =
      effectiveLvEstimatedHealthStatusForDecisions(
        lvEstimatedHealthStatusRaw,
        legacyPublicationSafety,
      );
    const lvEstimatedHealthScorePct = lvIsCalibrating
      ? lvEstimatedHealthPercent
      : lvPublishedSoh;

    // Resting voltage: only a genuine resting reading is evaluated. The V2
    // rest capture and document-confirmed snapshots persist `restingVoltage`;
    // an engine-off live snapshot is also acceptable. A live charging voltage
    // (engine running) is never treated as a resting reading.
    const snapshotRestingVoltage = parseNum(latestLvSnapshot?.restingVoltage);
    const engineOffVoltage =
      latestLvSnapshot?.engineRunning === false ? snapshotVoltage : null;
    const lvRestingVoltageValue = snapshotRestingVoltage ?? engineOffVoltage;
    const lvRestingClassification = classifyRestingVoltage(
      lvRestingVoltageValue,
      selectedBatterySpec?.batteryType ?? null,
      { specProvided: specUsedForRestingThresholds(selectedBatterySpec) },
    );
    const lvRestingMeasurementContext =
      lvRestingVoltageValue != null ? 'RESTING' : 'UNKNOWN';

    // Final LV status — worst of the two available signals (Critical wins,
    // Warning over Watch, Watch over Good; Unknown only when nothing usable).
    const lvHealthStatus: LvAggregateStatus = aggregateLvStatus(
      lvEstimatedHealthStatus,
      lvRestingClassification.status,
    );

    const pollFetchedAt =
      latestState?.providerFetchedAt ?? latestState?.lastSeenAt ?? null;
    const telemetryFetchFreshness = buildFetchFreshness({
      fetchedAt: pollFetchedAt,
      now: decisionNow,
    });

    // Freshness is anchored on the carrier that produced the displayed voltage,
    // not on the older of the two.  This keeps the "no_recent_data" label
    // honest when live telemetry is flowing but legacy snapshots are stale.
    const lvLastChecked =
      lvVoltageAt ??
      stateAt ??
      snapshotAt ??
      null;
    const lvObservationFreshness = buildObservationFreshness({
      observedAt: lvLastChecked,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      now: decisionNow,
      hasValueCarrier: lvVoltage != null,
    });
    const lvFreshness = toLegacyFreshnessInfo(lvObservationFreshness);
    const lvFetchFreshness = telemetryFetchFreshness;
    const lvRestMeasurementFreshness = buildObservationFreshness({
      observedAt:
        (v2?.rest6hCapturedAt as Date | null | undefined) ??
        (v2?.rest60mCapturedAt as Date | null | undefined) ??
        null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation,
      now: decisionNow,
      hasValueCarrier:
        parseNum(v2?.vOff6h) != null || parseNum(v2?.vOff60m) != null,
    });
    const lvStartProxyFreshness = buildObservationFreshness({
      observedAt: (v2?.crankAt as Date | null | undefined) ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.startProxyObservation,
      now: decisionNow,
      hasValueCarrier: parseNum(v2?.crankDrop) != null,
    });
    const lvAssessmentFreshness = buildObservationFreshness({
      observedAt: (v2?.scoredAt as Date | null | undefined) ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation,
      now: decisionNow,
      hasValueCarrier: lvPublishedSoh != null,
    });
    const lvPublicationFreshness = buildObservationFreshness({
      observedAt: (v2?.lastPublishedAt as Date | null | undefined) ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.publicationObservation,
      now: decisionNow,
      hasValueCarrier: lvPublishedSoh != null,
    });
    const lvFreshnessBundle = buildBatteryDomainFreshnessBundle({
      fetch: lvFetchFreshness,
      observation: lvObservationFreshness,
      restMeasurementFreshness: lvRestMeasurementFreshness,
      startProxyFreshness: lvStartProxyFreshness,
      assessmentFreshness: lvAssessmentFreshness,
      publicationFreshness: lvPublicationFreshness,
    });

    // Legacy three-state condition (good/watch/attention) for backward-compat
    // consumers. It is derived from the aggregated LV status so there is a
    // single source of truth — UIs that understand the new GOOD/WATCH/WARNING/
    // CRITICAL scale should read `lv.healthStatus` / `lv.estimatedHealth` /
    // `lv.restingVoltage` instead.
    const lvCondition: BatteryCondition = lvIsCalibrating
      ? 'calibrating'
      : statusToLegacyCondition(lvHealthStatus);

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
      crankObservationCount: effectiveCrankObservationCountForMaturity(
        v2?.crankObservationCount ?? 0,
      ),
    });
    const legacyCrank = presentLegacyCrankFeatures({
      crankDrop: parseNum(v2?.crankDrop),
      crankObservationCount: v2?.crankObservationCount ?? 0,
      vPreCrank: parseNum(v2?.vPreCrank),
      vMinCrank: parseNum(v2?.vMinCrank),
      vRecovery5s: parseNum(v2?.vRecovery5s),
      vRecovery30s: parseNum(v2?.vRecovery30s),
      crankAt: (v2?.crankAt as Date | null | undefined) ?? null,
      crankTripId: (v2?.crankTripId as string | null | undefined) ?? null,
    });

    const trendDirection = this.computeTrendDirection(trend30);
    const hvStatusAny = hvStatus as any;

    // HV SOH resolution — only from a real data basis, no age/km fallback:
    //   1) fresh provider-reported SOH
    //   2) workshop / document / manual report
    //   3) capacity/energy-based measurement from the HV service
    //   else → unavailable (UNKNOWN), never a fabricated percentage.
    const providerSohFromLatestState = parseNum(
      latestState?.tractionBatterySohPercent,
    );
    const providerSohFromEvidence = parseNum(hvProviderSohEvidence?.numericValue);
    const providerSoh = providerSohFromEvidence ?? providerSohFromLatestState;
    const providerSohObservedAt =
      hvProviderSohEvidence?.observedAt ?? null;
    const providerSohObservationFreshness = buildObservationFreshness({
      observedAt: providerSohObservedAt,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
      now: decisionNow,
      hasValueCarrier: providerSoh != null,
    });
    const providerSohFreshness = toLegacyFreshnessInfo(
      providerSohObservationFreshness,
    );
    const providerSohUsable =
      providerSoh != null &&
      observationFreshnessIsDecisionFresh(providerSohObservationFreshness);

    const reportedSoh = parseNum(hvReportedSohEvidence?.numericValue);
    const reportedSohObservationFreshness = buildObservationFreshness({
      observedAt: hvReportedSohEvidence?.observedAt ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.reportedSohObservation,
      now: decisionNow,
      hasValueCarrier: reportedSoh != null,
    });
    const reportedSohFreshness = toLegacyFreshnessInfo(
      reportedSohObservationFreshness,
    );
    const reportedSohUsable =
      reportedSoh != null &&
      observationFreshnessIsDecisionFresh(reportedSohObservationFreshness);
    const reportedSohSource: HvSohSource =
      hvReportedSohEvidence?.sourceType ===
      BatteryEvidenceSourceType.DOCUMENT_CONFIRMED
        ? 'DOCUMENT'
        : 'MANUAL';

    // Capacity/energy measurement from the HV service — only when legacy pairwise
    // assessment is explicitly enabled (Prompt 8/78).
    const hvMeasuredMethod = hvStatusAny?.sohMethod as string | undefined;
    const hvMeasuredSoh = effectiveHvMeasuredSohForDecisions(
      hvMeasuredMethod,
      parseNum(hvStatusAny?.publishedSohPercent) ?? parseNum(hvStatusAny?.rawSohPercent),
    );
    const hvLegacyCapacity = presentLegacyHvCapacity({
      estimatedCapacityKwh: parseNum(hvStatusAny?.estimatedCurrentCapacityKwh),
      sohPercent: parseNum(hvStatusAny?.rawSohPercent),
      publicationMethod: hvStatusAny?.publicationMethod as string | undefined,
      publishedSohPct: parseNum(hvStatusAny?.publishedSohPercent),
    });

    let hvHealthPercent: number | null = null;
    let hvSohSource: HvSohSource | null = null;
    let hvSourceType: string | null = null;
    let hvMethod: string | null = null;

    if (providerSohUsable) {
      hvHealthPercent = providerSoh;
      hvSohSource = 'PROVIDER';
      hvSourceType = 'provider_reported';
      hvMethod = 'provider_reported_soh';
    } else if (reportedSohUsable) {
      hvHealthPercent = reportedSoh;
      hvSohSource = reportedSohSource;
      hvSourceType =
        mapEvidenceSource(hvReportedSohEvidence?.sourceType ?? null) ?? 'document_confirmed';
      hvMethod = 'reported_soh';
    } else if (hvMeasuredSoh != null) {
      hvHealthPercent = hvMeasuredSoh;
      hvSohSource = 'CAPACITY_ESTIMATE';
      hvSourceType = 'telemetry_derived';
      hvMethod = hvMeasuredMethod ?? 'capacity_measurement';
    }

    const hvMeasuredObservedAt = hvStatusAny?.lastRecordedAt
      ? new Date(hvStatusAny.lastRecordedAt)
      : null;
    const hvLastObservedAt = providerSohUsable
      ? providerSohObservedAt
      : reportedSohUsable
        ? hvReportedSohEvidence?.observedAt ?? null
        : hvMeasuredObservedAt;
    const hvObservationFreshness = buildObservationFreshness({
      observedAt: hvLastObservedAt,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      now: decisionNow,
      hasValueCarrier: hvHealthPercent != null || isEv,
    });
    const hvFreshness = toLegacyFreshnessInfo(hvObservationFreshness);
    const hvFetchFreshness = telemetryFetchFreshness;
    const hvPublicationFreshness = buildObservationFreshness({
      observedAt:
        (hvStatusAny?.lastPublishedAt as Date | string | null | undefined) ??
        null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.publicationObservation,
      now: decisionNow,
      hasValueCarrier: parseNum(hvStatusAny?.publishedSohPercent) != null,
    });
    const latestHvChargeSession = safeChargeSessionRows[0] ?? null;
    const hvSessionObservationFreshness = buildObservationFreshness({
      observedAt:
        latestHvChargeSession?.endAt ??
        latestHvChargeSession?.startAt ??
        null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvSessionObservation,
      now: decisionNow,
      hasValueCarrier: latestHvChargeSession != null,
    });
    const hvFreshnessBundle = buildBatteryDomainFreshnessBundle({
      fetch: hvFetchFreshness,
      observation: hvObservationFreshness,
      providerSohFreshness: providerSohObservationFreshness,
      publicationFreshness: hvPublicationFreshness,
      hvSessionFreshness: hvSessionObservationFreshness,
    });
    const currentTelemetryObservationFreshness = buildObservationFreshness({
      observedAt: latestState?.sourceTimestamp ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      now: decisionNow,
      hasValueCarrier:
        parseNum(latestState?.evSoc) != null ||
        parseNum(latestState?.lvBatteryVoltage) != null,
    });
    const currentTelemetryFreshnessBundle = buildBatteryDomainFreshnessBundle({
      fetch: telemetryFetchFreshness,
      observation: currentTelemetryObservationFreshness,
    });

    const hvStatusLabel: BatteryStatus = !isEv
      ? 'unsupported'
      : hvHealthPercent == null
        ? 'estimate_unavailable'
        : hvFreshness.isFresh
          ? 'ready'
          : 'no_recent_data';

    // HV SOH status bands (distinct from LV): ≥80 GOOD · 70–79 WATCH ·
    // 60–69 WARNING · <60 CRITICAL · no data → UNKNOWN.
    const hvHealthStatus: BatteryHealthStatus = !isEv
      ? 'UNKNOWN'
      : classifyHvSoh(hvHealthPercent);
    const hvCondition: BatteryCondition = !isEv
      ? 'unknown'
      : statusToLegacyCondition(hvHealthStatus);

    const lvWatchpoints: string[] = [];
    if (!legacyPublicationSafety.decisionCapable && lvEstimatedHealthStatusRaw !== 'UNKNOWN') {
      lvWatchpoints.push(legacyPublicationSafety.diagnosticLabelDe);
    }
    if (lvEstimatedHealthStatus === 'CRITICAL') {
      lvWatchpoints.push('Geschätzte 12V-Batteriegesundheit kritisch — Austausch prüfen');
    } else if (lvEstimatedHealthStatus === 'WARNING') {
      lvWatchpoints.push('Geschätzte 12V-Batteriegesundheit niedrig — Startschwierigkeiten möglich');
    }
    if (lvRestingClassification.status === 'CRITICAL') {
      lvWatchpoints.push(
        `Ruhespannung ${lvRestingVoltageValue?.toFixed(2)}V kritisch — Batterie entladen, Starthilfe/Austausch empfohlen`,
      );
    } else if (lvRestingClassification.status === 'WARNING') {
      lvWatchpoints.push(
        `Ruhespannung ${lvRestingVoltageValue?.toFixed(2)}V niedrig — Startschwierigkeiten möglich`,
      );
    }
    if (lvStatus === 'no_recent_data') {
      lvWatchpoints.push('No recent LV sample');
    }

    const hvWatchpoints: string[] = [];
    if (isEv && (hvHealthStatus === 'WARNING' || hvHealthStatus === 'CRITICAL')) {
      hvWatchpoints.push('HV health indicates notable degradation');
    }
    if (isEv && hvStatusLabel === 'no_recent_data') {
      hvWatchpoints.push('No recent HV health sample');
    }

    const watchpoints = [...lvWatchpoints, ...hvWatchpoints];
    const recommendations: string[] = [];
    if (lvHealthStatus === 'CRITICAL') {
      recommendations.push(
        '12V-Batterie kritisch — Starthilfe oder Austausch empfohlen',
      );
    } else if (lvHealthStatus === 'WARNING') {
      recommendations.push(
        '12V-Batterie beobachten — Startschwierigkeiten möglich, Ladezustand und Lichtmaschine prüfen',
      );
    }
    if (hvHealthStatus === 'WARNING' || hvHealthStatus === 'CRITICAL') {
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
          sohSemantic: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
          estimatedLvHealthScore: s.sohPercent ?? null,
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

    const lvEstimatedHealthDataQuality = resolveLvEstimatedHealthDataQuality({
      runtimeStatus: lvStatus,
      hasScore: lvEstimatedHealthScorePct != null,
      freshness: lvFreshness,
      legacyPublicationSafety,
      isCalibrating: lvIsCalibrating,
      isStabilizing: lvIsStabilizing,
    });
    const lvRestingVoltageDataQuality = resolveRestingVoltageDataQuality({
      valueV: lvRestingVoltageValue,
      restingStatus: lvRestingClassification.status,
      freshness: lvFreshness,
      runtimeStatus: lvStatus,
      isCalibrating: lvIsCalibrating,
    });
    const lvCrankDataQuality = resolveCrankDataQuality(legacyCrank);
    const hvSohDataQuality = resolveHvSohDataQuality({
      isEv,
      sohSource: hvSohSource,
      hasSoh: hvHealthPercent != null,
      freshness: hvFreshness,
      runtimeStatus: hvStatusLabel,
      legacyCapacity: hvLegacyCapacity,
    });
    const hvLegacyCapacityDataQuality =
      resolveHvLegacyCapacityDataQuality(hvLegacyCapacity);
    const dataQualitySlices = buildBatteryDataQualitySlices({
      lvEstimatedHealth: lvEstimatedHealthDataQuality,
      lvRestingVoltage: lvRestingVoltageDataQuality,
      lvCrank: lvCrankDataQuality,
      hvSoh: hvSohDataQuality,
      hvLegacyCapacity: hvLegacyCapacityDataQuality,
      isEv,
    });
    const presentQuality = (
      status: BatteryDataQualityStatus,
      observedAt?: string | Date | null,
    ) => presentBatteryDataQuality(status, observedAt);

    const lvStartProxyDiagnostic =
      await this.startProxyDiagnostic.getForVehicle(vehicleId, decisionNow);

    const canonicalChargeSessions = safeChargeSessionRows.map(mapChargeSessionInputRow);
    const crossSessionAssessment = mapCrossSessionAssessmentRow(crossSessionRow);
    const sohGateAssessment = mapSohGateAssessmentRow(sohGateRow);
    const referenceCapacity = mapReferenceCapacityRow(referenceCapacityRow);

    const lvLiveValues = {
      voltageV: lvVoltage,
      voltageSource: lvVoltageSource,
      temperatureC: parseNum(latestLvSnapshot?.temperatureC),
      restingVoltageV: lvRestingVoltageValue,
      crankingVoltageV: parseNum(latestLvSnapshot?.crankingVoltage),
      chargingVoltageV: parseNum(latestLvSnapshot?.chargingVoltage),
      engineRunning: latestLvSnapshot?.engineRunning ?? null,
    };
    const hvLiveValues = {
      socPercent:
        parseNum(latestState?.evSoc) ??
        parseNum(hvStatusAny?.currentSocPercent),
      rangeKm:
        parseNum(latestState?.rangeKm) ??
        parseNum(hvStatusAny?.estimatedRangeKm),
      currentEnergyKwh: parseNum(latestState?.tractionBatteryCurrentEnergyKwh),
      grossCapacityKwh:
        parseNum(latestState?.tractionBatteryGrossCapacityKwh) ??
        parseNum(hvStatusAny?.nominalCapacityKwh),
      addedEnergyKwh: parseNum(latestState?.tractionBatteryAddedEnergyKwh),
      chargingPowerKw:
        parseNum(latestState?.tractionBatteryChargingPowerKw) ??
        parseNum(hvStatusAny?.telemetry?.chargingPowerKw) ??
        parseNum(hvStatusAny?.chargingPowerKw),
      currentVoltageV: parseNum(latestState?.tractionBatteryCurrentVoltage),
      temperatureC:
        parseNum(latestState?.tractionBatteryTemperatureC) ??
        parseNum(hvStatusAny?.telemetry?.temperatureC) ??
        parseNum(hvStatusAny?.temperatureC),
      isCharging:
        latestState?.tractionBatteryIsCharging ??
        (hvStatusAny?.telemetry?.isCharging ??
          hvStatusAny?.isCharging ??
          null),
      chargingCableConnected:
        latestState?.tractionBatteryChargingCableConnected ?? null,
      providerSohPercent: providerSoh,
    };

    const signalFreshness = buildCanonicalBatterySignalFreshness({
      now: decisionNow,
      receivedAt: pollFetchedAt,
      lvValues: lvLiveValues,
      hvValues: hvLiveValues,
      lvVoltageObservedAt: lvVoltageAt,
      lvSnapshotObservedAt: snapshotAt,
      hvAggregateObservedAt: latestState?.sourceTimestamp ?? null,
      providerSohObservedAt: providerSohObservedAt,
      restMeasurementObservedAt:
        (v2?.rest6hCapturedAt as Date | null | undefined) ??
        (v2?.rest60mCapturedAt as Date | null | undefined) ??
        null,
      startProxyObservedAt: (v2?.crankAt as Date | null | undefined) ?? null,
      assessmentObservedAt: (v2?.scoredAt as Date | null | undefined) ?? null,
      publicationObservedAt:
        (v2?.lastPublishedAt as Date | null | undefined) ?? null,
      hvSessionObservedAt:
        latestHvChargeSession?.endAt ??
        latestHvChargeSession?.startAt ??
        null,
      lvObservationFreshness,
      lvRestMeasurementFreshness,
      lvStartProxyFreshness,
      lvAssessmentFreshness,
      lvPublicationFreshness,
      providerSohObservationFreshness,
      hvSessionObservationFreshness,
      isEv,
    });

    const signalErrors = [
      ...moduleErrors,
      ...collectCapabilitySignalErrors({
        lvUnsupported: lvCanonical.unsupported,
        lvAssessmentAllowed: policy.lvAssessmentAllowed,
        hvUnsupportedReasons: hvMethodProfile.unsupportedReasons,
        isEv,
      }),
    ];

    const canonical: CanonicalBatteryDto = buildCanonicalBatteryDto({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      resolvedAt: decisionNow,
      isEv,
      policy,
      hvMethodProfile,
      lvCanonical,
      lvStatus: mapLiveStatusFromLegacy(lvStatus),
      hvStatus: mapLiveStatusFromLegacy(hvStatusLabel),
      lvLive: {
        ...lvLiveValues,
        observedAt: lvVoltageAt?.toISOString() ?? null,
        receivedAt:
          pollFetchedAt?.toISOString() ??
          latestState?.lastSeenAt?.toISOString() ??
          null,
      },
      hvLive: {
        ...hvLiveValues,
        observedAt: hvLastObservedAt?.toISOString() ?? null,
        receivedAt:
          pollFetchedAt?.toISOString() ??
          latestState?.lastSeenAt?.toISOString() ??
          null,
      },
      hvProviderSoh: {
        percent: hvHealthPercent,
        source: hvSohSource,
        observedAt: hvLastObservedAt?.toISOString() ?? null,
        decisionFresh:
          hvHealthPercent != null && observationFreshnessIsDecisionFresh(hvObservationFreshness),
        evidenceType: hvSourceType,
      },
      referenceCapacity,
      crossSessionAssessment,
      sohGateAssessment,
      chargeSessions: canonicalChargeSessions,
      dataQuality: {
        aggregate: presentQuality(dataQualitySlices.aggregate, lvFreshness.observedAt),
        slices: {
          lvEstimatedHealth: presentQuality(
            dataQualitySlices.lvEstimatedHealth,
            lvFreshness.observedAt,
          ),
          lvRestingVoltage: presentQuality(
            dataQualitySlices.lvRestingVoltage,
            lvFreshness.observedAt,
          ),
          lvCrank: presentQuality(
            dataQualitySlices.lvCrank,
            (v2?.crankAt as Date | null | undefined)?.toISOString?.() ??
              (typeof v2?.crankAt === 'string' ? v2.crankAt : null),
          ),
          hvSoh: presentQuality(hvSohDataQuality, hvFreshness.observedAt),
          hvLegacyCapacity: presentQuality(
            hvLegacyCapacityDataQuality,
            hvFreshness.observedAt,
          ),
        },
        fetchFreshness: telemetryFetchFreshness,
        observationFreshness: currentTelemetryObservationFreshness,
        lvFreshnessBundle,
        hvFreshnessBundle,
        staleReasons: collectStaleReasons({
          lvFreshness,
          hvFreshness,
          lvStatus,
          hvStatus: hvStatusLabel,
          isEv,
        }),
        unsupportedReasons: collectUnsupportedReasons({
          lvCanonical,
          policy,
          hvMethodProfile,
          isEv,
        }),
        errors: signalErrors,
        namedFreshnessSlices: signalFreshness.namedSlices,
      },
      signalFreshness,
      legacy: {
        collapsed: true,
        lvDiagnostic: lvCanonical.legacyDiagnostic,
        hvLegacyCapacity: hvLegacyCapacity as unknown as Record<string, unknown>,
        crankDiagnostic: legacyCrank as unknown as Record<string, unknown>,
        startProxyDiagnostic: lvStartProxyDiagnostic as unknown as Record<string, unknown>,
        v2Features: {
          publishedSohPct: lvPublishedSoh,
          stabilizedSohPct: parseNum(v2?.stabilizedSohPct),
          rawSohPct: parseNum(v2?.rawSohPct),
          publicationState: lvPubState,
          scoredAt:
            (v2?.scoredAt as Date | null | undefined)?.toISOString?.() ??
            (typeof v2?.scoredAt === 'string' ? v2.scoredAt : null),
        },
      },
    });

    const summary = {
      vehicleId,
      generatedAt: new Date().toISOString(),
      dataQuality: {
        ...presentQuality(dataQualitySlices.aggregate, lvFreshness.observedAt),
        slices: {
          lvEstimatedHealth: presentQuality(
            dataQualitySlices.lvEstimatedHealth,
            lvFreshness.observedAt,
          ),
          lvRestingVoltage: presentQuality(
            dataQualitySlices.lvRestingVoltage,
            lvFreshness.observedAt,
          ),
          lvCrank: presentQuality(
            dataQualitySlices.lvCrank,
            (v2?.crankAt as Date | null | undefined)?.toISOString?.() ??
              (typeof v2?.crankAt === 'string' ? v2.crankAt : null),
          ),
          hvSoh: presentQuality(hvSohDataQuality, hvFreshness.observedAt),
          hvLegacyCapacity: presentQuality(
            hvLegacyCapacityDataQuality,
            hvFreshness.observedAt,
          ),
        },
      },
      support: {
        lv: true,
        hv: isEv,
      },
      lv: {
        // Runtime/lifecycle label (ready/calibrating/…) — unchanged contract.
        status: lvStatus,
        // Aggregated health status on the GOOD/WATCH/WARNING/CRITICAL scale.
        healthStatus: lvHealthStatus,
        condition: lvCondition,
        healthPercent: lvHealthPercent,
        estimatedHealthPercent: lvEstimatedHealthPercent,
        // Behaviour-derived "Estimated Battery Health" — render as 3 bars.
        estimatedHealth: {
          status: lvEstimatedHealthStatus,
          diagnosticStatus: lvEstimatedHealthStatusRaw,
          scorePct: lvEstimatedHealthScorePct,
          displayMode: 'BARS' as const,
          bars: statusToBars(
            legacyPublicationSafety.decisionCapable
              ? lvEstimatedHealthStatus
              : lvEstimatedHealthStatusRaw,
          ),
          semanticType: ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
          label: ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
          confidence: (v2?.maturityConfidence as string | undefined) ?? 'none',
          calibrationStatus: lvPubState,
          decisionCapable: legacyPublicationSafety.decisionCapable,
          legacyPublicationSafety,
          dataQualityStatus: lvEstimatedHealthDataQuality,
          dataQuality: presentQuality(
            lvEstimatedHealthDataQuality,
            lvFreshness.observedAt,
          ),
        },
        legacyPublicationSafety,
        estimatedLvHealthScore: {
          value: lvEstimatedHealthScorePct,
          semanticType: ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
          label: ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
        },
        healthPercentSemantic:
          lvHealthPercent != null ? LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC : null,
        estimatedHealthPercentSemantic:
          lvEstimatedHealthPercent != null
            ? LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC
            : null,
        // Resting voltage state from battery-spec-aware thresholds.
        restingVoltage: {
          valueV: lvRestingVoltageValue,
          status: lvRestingClassification.status,
          thresholdSource: lvRestingClassification.thresholdSource,
          batteryType: lvRestingClassification.batteryType,
          measurementContext: lvRestingMeasurementContext,
          dataQualityStatus: lvRestingVoltageDataQuality,
          dataQuality: presentQuality(
            lvRestingVoltageDataQuality,
            lvFreshness.observedAt,
          ),
        },
        method: lvIsCalibrating
          ? 'model_derived'
          : lvPublishedSoh != null
            ? 'telemetry_derived'
            : 'estimate_unavailable',
        confidence: (v2?.maturityConfidence as string | undefined) ?? 'none',
        freshness: lvFreshness,
        fetchFreshness: lvFetchFreshness,
        observationFreshness: lvObservationFreshness,
        freshnessBundle: lvFreshnessBundle,
        evidenceType:
          lvIsCalibrating
            ? 'model_derived'
            : lvEvidenceRecent[0]?.sourceType
              ? mapEvidenceSource(lvEvidenceRecent[0].sourceType)
              : 'telemetry_derived',
        publicationState: lvPubState,
        telemetry: {
          voltageV: lvVoltage,
          // Provenance of the displayed voltage so the UI can label it as
          // "at rest" (OCV-relevant) vs "live" (may be charging / loaded).
          voltageSource: lvVoltageSource,
          voltageObservedAt: lvVoltageAt?.toISOString() ?? null,
          restingVoltage: parseNum(latestLvSnapshot?.restingVoltage),
          crankingVoltage: parseNum(latestLvSnapshot?.crankingVoltage),
          chargingVoltage: parseNum(latestLvSnapshot?.chargingVoltage),
          temperatureC: parseNum(latestLvSnapshot?.temperatureC),
          engineRunning: latestLvSnapshot?.engineRunning ?? null,
          crank: {
            ...legacyCrank,
            dataQualityStatus: lvCrankDataQuality,
            dataQuality: presentQuality(
              lvCrankDataQuality,
              (v2?.crankAt as Date | null | undefined)?.toISOString?.() ??
                (typeof v2?.crankAt === 'string' ? v2.crankAt : null),
            ),
          },
          startProxy: lvStartProxyDiagnostic,
        },
        calibrationProgress: {
          ...lvCalibrationProgress,
          lastMeasurementAgeMs: lvFreshness.ageMs,
        },
      },
      hv: {
        status: hvStatusLabel,
        healthStatus: hvHealthStatus,
        condition: hvCondition,
        healthPercent: hvHealthPercent,
        // Real SOH only: provider, capacity, document, or manual.
        sohPct: hvHealthPercent,
        sohSource: hvSohSource,
        noFallbackSoh: true as const,
        method: hvMethod,
        confidence: (hvStatusAny?.maturityConfidence as string | undefined) ?? 'none',
        freshness: hvFreshness,
        fetchFreshness: hvFetchFreshness,
        observationFreshness: hvObservationFreshness,
        freshnessBundle: hvFreshnessBundle,
        evidenceType: hvSourceType,
        publicationState:
          (hvStatusAny?.publicationState as SohPublicationState | undefined) ??
          SohPublicationState.INITIAL_CALIBRATION,
        dataQualityStatus: hvSohDataQuality,
        dataQuality: presentQuality(hvSohDataQuality, hvFreshness.observedAt),
        legacyCapacity: {
          ...hvLegacyCapacity,
          dataQualityStatus: hvLegacyCapacityDataQuality,
          dataQuality: presentQuality(
            hvLegacyCapacityDataQuality,
            hvFreshness.observedAt,
          ),
        },
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
        fetchFreshness: telemetryFetchFreshness,
        observationFreshness: currentTelemetryObservationFreshness,
        freshnessBundle: currentTelemetryFreshnessBundle,
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
        sohPercentSemantic:
          lvHealthPercent != null ? LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC : null,
        publishedSohPct: lvPublishedSoh,
        publishedSohPctSemantic:
          lvPublishedSoh != null ? LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC : null,
        estimatedSohPct: lvEstimatedHealthPercent,
        estimatedSohPctSemantic:
          lvEstimatedHealthPercent != null
            ? LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC
            : null,
        estimatedLvHealthScore: lvEstimatedHealthScorePct,
        estimatedLvHealthScoreSemantic: ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
        estimatedLvHealthScoreLabel: ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
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
      // Surface the real condition. Previously 'unknown' was silently rewritten
      // to 'watch' which violates the "show missing-data, don't fabricate it"
      // contract used throughout the health stack. UIs must handle 'unknown'
      // explicitly (no coloring, no score penalty) so callers don't see a
      // yellow "watch" box for a vehicle we simply have no samples for.
      condition: lvCondition,
      trendDirection,
      specs: selectedBatterySpec
        ? {
            batteryType: selectedBatterySpec.batteryType,
            batteryAmpere: selectedBatterySpec.batteryAmpere,
            batteryVolt: selectedBatterySpec.batteryVolt,
            sourceType: selectedBatterySpec.sourceType,
          }
        : null,
      trend7: trend7.map((d) => ({
        date: d.recordedAt.toISOString(),
        soh: d.sohPercent ?? null,
        sohSemantic: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
        estimatedLvHealthScore: d.sohPercent ?? null,
        voltage: d.voltageV ?? null,
      })),
      trend30: trend30.map((d) => ({
        date: d.recordedAt.toISOString(),
        soh: d.sohPercent ?? null,
        sohSemantic: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
        estimatedLvHealthScore: d.sohPercent ?? null,
        voltage: d.voltageV ?? null,
      })),
      history,
      canonical,
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
          evidence: lvEvidence.map((e) => {
            const mapped = mapLvEvidenceValueType(e.valueType, 'LV');
            return {
              id: e.id,
              observedAt: e.observedAt.toISOString(),
              sourceType: mapEvidenceSource(e.sourceType),
              valueType: mapped.valueType,
              semanticValueType: mapped.semanticValueType,
              displayLabel: mapped.displayLabel,
              value: e.numericValue,
              unit: e.unit,
              provider: e.provider,
              confidence: e.confidence,
              quality: e.quality,
              documentExtractionId: e.documentExtractionId,
              serviceEventId: e.serviceEventId,
            };
          }),
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

    // Never mix scales: SOH (0–100 %) and Voltage (~11–14 V) have different
    // magnitudes and thresholds.  Prefer SOH when we have enough samples,
    // otherwise fall back to voltage alone.  A single series with its own
    // threshold — no cross-scale averaging.
    const sohPoints = trend30
      .map((d) => d.sohPercent)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const voltagePoints = trend30
      .map((d) => d.voltageV)
      .filter((v): v is number => v != null && Number.isFinite(v));

    const usingSoh = sohPoints.length >= 3;
    const points = usingSoh ? sohPoints : voltagePoints;
    if (points.length < 3) return 'unknown';

    const thirdSize = Math.max(1, Math.ceil(points.length / 3));
    const first = points.slice(0, thirdSize);
    const last = points.slice(-thirdSize);
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgLast = last.reduce((s, v) => s + v, 0) / last.length;
    const delta = avgLast - avgFirst;

    // 2 % step is meaningful for SOH; 0.1 V step is meaningful for voltage.
    const threshold = usingSoh ? 2 : 0.1;
    if (Math.abs(delta) < threshold) return 'stable';
    return delta > 0 ? 'improving' : 'declining';
  }
}
