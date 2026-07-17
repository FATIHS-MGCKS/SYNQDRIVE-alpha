import { Injectable } from '@nestjs/common';
import {
  BatteryAssessmentType,
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { isRestMeasurementType } from '../../battery-policy-profile/battery-policy-profile.measurement-sets';
import { BatteryEvidenceService } from '../battery-evidence.service';
import { BatteryPublicationRepository } from '../battery-publication.repository';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildBatteryDomainFreshnessBundle,
  buildFetchFreshness,
  buildObservationFreshness,
} from '../battery-freshness.policy';
import type { LvPublicationMaturity } from '../lv-assessment/lv-publication.policy';
import {
  resolveCanonicalLvBattery,
  type CanonicalLvBatteryResponse,
} from './lv-canonical-battery.resolver';
import type {
  LvCanonicalAssessment,
  LvCanonicalLegacyInput,
  LvCanonicalLiveVoltage,
  LvCanonicalPublication,
  LvCanonicalRestMeasurement,
  LvCanonicalStartProxy,
  LvCanonicalWorkshopEvidenceInput,
} from './lv-canonical-battery.types';

const WORKSHOP_EVIDENCE_SOURCES = new Set<BatteryEvidenceSourceType>([
  BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
  BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
  BatteryEvidenceSourceType.MANUAL_REPORT,
]);

const WORKSHOP_MEASUREMENT_TYPES = new Set<BatteryMeasurementType>([
  BatteryMeasurementType.WORKSHOP_OCV,
  BatteryMeasurementType.WORKSHOP_LOAD_TEST,
]);

const START_PROXY_TYPES = new Set<BatteryMeasurementType>([
  BatteryMeasurementType.PRE_START_VOLTAGE,
  BatteryMeasurementType.START_DIP_PROXY,
  BatteryMeasurementType.RECOVERY_5S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_30S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
]);

function parseReasonPayload(
  reason: string | null,
): Record<string, unknown> | null {
  if (!reason) return null;
  try {
    const parsed = JSON.parse(reason) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

@Injectable()
export class LvCanonicalBatteryResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyProfileService: BatteryPolicyProfileService,
    private readonly evidenceService: BatteryEvidenceService,
    private readonly assessmentRepository: BatteryAssessmentRepository,
    private readonly publicationRepository: BatteryPublicationRepository,
  ) {}

  async resolveForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    now?: Date;
  }): Promise<CanonicalLvBatteryResponse> {
    const now = input.now ?? new Date();
    const { organizationId, vehicleId } = input;

    const [
      policy,
      latestState,
      latestLvSnapshot,
      v2Features,
      lvEvidence,
      latestAssessmentRow,
      latestPublicationRow,
      restMeasurements,
      startProxyMeasurements,
      workshopMeasurements,
    ] = await Promise.all([
      this.policyProfileService.resolveForVehicle(vehicleId),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lvBatteryVoltage: true,
          lastSeenAt: true,
          providerFetchedAt: true,
        },
      }),
      this.prisma.batteryHealthSnapshot.findFirst({
        where: { vehicleId },
        orderBy: { recordedAt: 'desc' },
        select: {
          voltageV: true,
          restingVoltage: true,
          engineRunning: true,
          recordedAt: true,
        },
      }),
      this.prisma.batteryFeatures.findUnique({ where: { vehicleId } }),
      this.evidenceService.listRecent(vehicleId, {
        scope: BatteryEvidenceScope.LV,
        take: 10,
      }),
      this.assessmentRepository.findLatestLvEstimatedHealth({
        organizationId,
        vehicleId,
      }),
      this.publicationRepository.findLatestActiveLvPublication({
        organizationId,
        vehicleId,
      }),
      this.prisma.batteryMeasurement.findMany({
        where: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: {
            in: [
              BatteryMeasurementType.REST_60M,
              BatteryMeasurementType.REST_6H,
              BatteryMeasurementType.REST_AFTER_SHUTDOWN,
            ],
          },
          quality: BatteryMeasurementQuality.VALID,
        },
        orderBy: { observedAt: 'desc' },
        take: 1,
      }),
      this.prisma.batteryMeasurement.findMany({
        where: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: { in: [...START_PROXY_TYPES] },
        },
        orderBy: { observedAt: 'desc' },
        take: 8,
      }),
      this.prisma.batteryMeasurement.findMany({
        where: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: { in: [...WORKSHOP_MEASUREMENT_TYPES] },
          quality: BatteryMeasurementQuality.VALID,
        },
        orderBy: { observedAt: 'desc' },
        take: 1,
      }),
    ]);

    const workshopEvidence = this.resolveWorkshopEvidence(
      lvEvidence,
      workshopMeasurements[0] ?? null,
    );
    const assessment = this.mapAssessment(latestAssessmentRow);
    const publication = this.mapPublication(latestPublicationRow);
    const liveVoltage = this.resolveLiveVoltage(latestState, latestLvSnapshot);
    const latestQualifiedRestMeasurement = this.mapRestMeasurement(
      restMeasurements[0] ?? null,
    );
    const latestStartProxy = this.mapStartProxy(startProxyMeasurements);
    const legacy = this.mapLegacy(v2Features);
    const freshness = this.buildFreshnessBundle({
      latestState,
      v2Features,
      publication,
      assessment,
      liveVoltage,
      now,
    });

    return resolveCanonicalLvBattery({
      vehicleId,
      policy,
      workshopEvidence,
      publication,
      assessment,
      liveVoltage,
      latestQualifiedRestMeasurement,
      latestStartProxy,
      legacy,
      freshness,
      now,
    });
  }

  private resolveWorkshopEvidence(
    evidenceRows: Awaited<ReturnType<BatteryEvidenceService['listRecent']>>,
    workshopMeasurement: {
      id: string;
      numericValue: number | null;
      observedAt: Date;
    } | null,
  ): LvCanonicalWorkshopEvidenceInput | null {
    const workshopEvidence = evidenceRows.find((row) =>
      WORKSHOP_EVIDENCE_SOURCES.has(row.sourceType),
    );
    if (workshopEvidence?.numericValue != null) {
      return {
        sourceType: workshopEvidence.sourceType as LvCanonicalWorkshopEvidenceInput['sourceType'],
        estimatedHealthScore: workshopEvidence.numericValue,
        observedAt: workshopEvidence.observedAt.toISOString(),
        evidenceId: workshopEvidence.id,
      };
    }
    if (workshopMeasurement?.numericValue != null) {
      return {
        sourceType: 'WORKSHOP_MEASUREMENT',
        estimatedHealthScore: workshopMeasurement.numericValue,
        observedAt: workshopMeasurement.observedAt.toISOString(),
        measurementId: workshopMeasurement.id,
      };
    }
    return null;
  }

  private mapAssessment(
    row: Awaited<
      ReturnType<BatteryAssessmentRepository['findLatestLvEstimatedHealth']>
    >,
  ): LvCanonicalAssessment | null {
    if (!row) return null;
    const model = this.assessmentRepository.assessmentToEstimatedHealthModel(row);
    if (!model) return null;
    const summary =
      row.inputSummary && typeof row.inputSummary === 'object'
        ? (row.inputSummary as Record<string, unknown>)
        : {};
    return {
      assessmentId: row.id,
      assessmentMode: model.assessmentMode,
      assessmentTrack:
        (summary.assessmentTrack as LvCanonicalAssessment['assessmentTrack']) ??
        'TELEMETRY',
      estimatedHealthScore: model.estimatedHealthScore,
      confidence: model.confidence,
      publicationEligible: model.publicationEligible,
      computedAt: row.computedAt.toISOString(),
    };
  }

  private mapPublication(
    row: Awaited<
      ReturnType<BatteryPublicationRepository['findLatestActiveLvPublication']>
    >,
  ): LvCanonicalPublication | null {
    if (!row) return null;
    const payload = parseReasonPayload(row.reason);
    const maturity =
      (payload?.maturity as LvPublicationMaturity | undefined) ?? 'CALIBRATING';
    const publishedEstimatedHealth = parseNum(payload?.publishedEstimatedHealth);
    const userFacingPublished =
      maturity === 'STABLE' ||
      maturity === 'PROVISIONAL' ||
      publishedEstimatedHealth != null;
    return {
      publicationId: row.id,
      maturity,
      publishedEstimatedHealth,
      userFacingPublished:
        userFacingPublished && publishedEstimatedHealth != null,
      publishedAt: row.publishedAt.toISOString(),
      assessmentEvidenceObservedAt:
        typeof payload?.assessmentEvidenceObservedAt === 'string'
          ? payload.assessmentEvidenceObservedAt
          : null,
    };
  }

  private resolveLiveVoltage(
    latestState: {
      lvBatteryVoltage: number | null;
      lastSeenAt: Date | null;
    } | null,
    snapshot: {
      voltageV: number | null;
      engineRunning: boolean | null;
      recordedAt: Date;
    } | null,
  ): LvCanonicalLiveVoltage | null {
    const stateVoltage = parseNum(latestState?.lvBatteryVoltage);
    const snapshotVoltage = parseNum(snapshot?.voltageV);
    const stateAt = latestState?.lastSeenAt ?? null;
    const snapshotAt = snapshot?.recordedAt ?? null;

    if (stateVoltage != null && snapshotVoltage != null && stateAt && snapshotAt) {
      const stateNewer = stateAt.getTime() >= snapshotAt.getTime();
      const voltageV = stateNewer ? stateVoltage : snapshotVoltage;
      const observedAt = (stateNewer ? stateAt : snapshotAt).toISOString();
      return {
        voltageV,
        observedAt,
        source: stateNewer ? 'live_telemetry' : 'resting_snapshot',
        engineRunning: stateNewer ? null : snapshot?.engineRunning ?? null,
        safeForDecision: false,
      };
    }

    if (stateVoltage != null && stateAt) {
      return {
        voltageV: stateVoltage,
        observedAt: stateAt.toISOString(),
        source: 'live_telemetry',
        engineRunning: null,
        safeForDecision: false,
      };
    }

    if (snapshotVoltage != null && snapshotAt) {
      return {
        voltageV: snapshotVoltage,
        observedAt: snapshotAt.toISOString(),
        source: 'resting_snapshot',
        engineRunning: snapshot?.engineRunning ?? null,
        safeForDecision: false,
      };
    }

    return null;
  }

  private mapRestMeasurement(
    row: {
      id: string;
      type: BatteryMeasurementType;
      quality: BatteryMeasurementQuality;
      numericValue: number | null;
      observedAt: Date;
      context: unknown;
    } | null,
  ): LvCanonicalRestMeasurement | null {
    if (!row || !isRestMeasurementType(row.type)) return null;
    const context =
      row.context && typeof row.context === 'object'
        ? (row.context as Record<string, unknown>)
        : null;
    return {
      measurementId: row.id,
      measurementType: row.type,
      quality: row.quality,
      voltageV: row.numericValue,
      observedAt: row.observedAt.toISOString(),
      cycleKey:
        typeof context?.restWindowId === 'string'
          ? context.restWindowId
          : typeof context?.cycleKey === 'string'
            ? context.cycleKey
            : null,
    };
  }

  private mapStartProxy(
    rows: Array<{
      id: string;
      type: BatteryMeasurementType;
      quality: BatteryMeasurementQuality;
      numericValue: number | null;
      observedAt: Date;
      sessionId: string | null;
      context: unknown;
    }>,
  ): LvCanonicalStartProxy | null {
    if (rows.length === 0) return null;
    const latest = rows[0];
    const context =
      latest.context && typeof latest.context === 'object'
        ? (latest.context as Record<string, unknown>)
        : null;
    return {
      sessionId: latest.sessionId,
      tripId: typeof context?.tripId === 'string' ? context.tripId : null,
      observedAt: latest.observedAt.toISOString(),
      diagnosticOnly: true,
      measurements: rows.map((row) => ({
        measurementType: row.type,
        quality: row.quality,
        numericValue: row.numericValue,
        observedAt: row.observedAt.toISOString(),
      })),
    };
  }

  private mapLegacy(
    features: {
      publishedSohPct: number | null;
      stabilizedSohPct: number | null;
      rawSohPct: number | null;
      publicationState: string;
      scoredAt: Date | null;
    } | null,
  ): LvCanonicalLegacyInput | null {
    if (!features) return null;
    return {
      publishedSohPct: features.publishedSohPct,
      stabilizedSohPct: features.stabilizedSohPct,
      rawSohPct: features.rawSohPct,
      publicationState: features.publicationState,
      scoredAt: features.scoredAt?.toISOString() ?? null,
    };
  }

  private buildFreshnessBundle(input: {
    latestState: { providerFetchedAt: Date | null; lastSeenAt: Date | null } | null;
    v2Features: {
      rest60mCapturedAt: Date | null;
      rest6hCapturedAt: Date | null;
      crankAt: Date | null;
      scoredAt: Date | null;
      lastPublishedAt: Date | null;
    } | null;
    publication: LvCanonicalPublication | null;
    assessment: LvCanonicalAssessment | null;
    liveVoltage: LvCanonicalLiveVoltage | null;
    now: Date;
  }) {
    const fetch = buildFetchFreshness({
      fetchedAt:
        input.latestState?.providerFetchedAt ??
        input.latestState?.lastSeenAt ??
        null,
      now: input.now,
    });
    const observation = buildObservationFreshness({
      observedAt: input.liveVoltage?.observedAt ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      now: input.now,
      hasValueCarrier: input.liveVoltage != null,
    });
    const restMeasurementFreshness = buildObservationFreshness({
      observedAt:
        input.v2Features?.rest6hCapturedAt ??
        input.v2Features?.rest60mCapturedAt ??
        null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation,
      now: input.now,
      hasValueCarrier:
        input.v2Features?.rest6hCapturedAt != null ||
        input.v2Features?.rest60mCapturedAt != null,
    });
    const startProxyFreshness = buildObservationFreshness({
      observedAt: input.v2Features?.crankAt ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.startProxyObservation,
      now: input.now,
      hasValueCarrier: input.v2Features?.crankAt != null,
    });
    const assessmentFreshness = buildObservationFreshness({
      observedAt: input.assessment?.computedAt ?? null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation,
      now: input.now,
      hasValueCarrier: input.assessment?.estimatedHealthScore != null,
    });
    const publicationFreshness = buildObservationFreshness({
      observedAt:
        input.publication?.assessmentEvidenceObservedAt ??
        input.publication?.publishedAt ??
        null,
      maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.publicationObservation,
      now: input.now,
      hasValueCarrier: input.publication?.publishedEstimatedHealth != null,
    });

    return buildBatteryDomainFreshnessBundle({
      fetch,
      observation,
      restMeasurementFreshness,
      startProxyFreshness,
      assessmentFreshness,
      publicationFreshness,
    });
  }
}
