import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BatteryProviderObservabilityGapStatus,
  type BatteryGeneralizedEvidenceObservation,
  type BatteryRestSession,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { selectCanonicalRestSessionFeatureShadowRow } from '../rest-session-features/rest-session-feature-canonical-row.policy';
import type { RestSessionFeatureInputRetentionPointV1 } from '../rest-session-features/rest-session-feature-input-snapshot.types';
import {
  LongitudinalProfileRevisionInspectionService,
  type LongitudinalProfileRevisionInspector,
} from '../rest-session-features/longitudinal/longitudinal-profile-revision-inspection.service';
import {
  LV_MEASURED_INTELLIGENCE_CONTRACT_VERSION,
  LV_MEASURED_INTELLIGENCE_DEFAULT_OBSERVATION_LIMIT,
  LV_MEASURED_INTELLIGENCE_DEFAULT_SESSION_LIMIT,
  LV_MEASURED_INTELLIGENCE_MAX_FEATURE_ROWS_PER_VEHICLE,
  LV_MEASURED_INTELLIGENCE_MAX_HISTORICAL_RANGE_DAYS,
  LV_MEASURED_INTELLIGENCE_MAX_OBSERVATION_LIMIT,
  LV_MEASURED_INTELLIGENCE_MAX_SESSION_LIMIT,
} from './lv-measured-intelligence.constants';
import { assessLvMeasuredC3SlopeQualityV1 } from './lv-measured-intelligence-slope-quality.policy';
import {
  actualRestAgeMsToHours,
  mapEvidenceClassToOperationalContext,
  nominalRestIntervalIndexToLadderLabel,
} from './lv-measured-intelligence-context.policy';
import { dedupeObservationsBySourceMeasurementId } from './lv-measured-intelligence-dedup.policy';
import type {
  LvMeasuredIntelligenceReadInput,
  LvMeasuredIntelligenceV1,
  LvMeasuredRestSessionEpisodeV1,
  LvMeasuredSessionDerivedFeaturesV1,
  LvMeasuredVoltagePointV1,
} from './lv-measured-intelligence.types';

const GE_SELECT = {
  id: true,
  sourceMeasurementId: true,
  voltage: true,
  voltageObservedAt: true,
  providerObservationAt: true,
  providerTimestampSource: true,
  evidenceClass: true,
  restSessionId: true,
  actualRestAgeMs: true,
  nominalRestIntervalIndex: true,
  isLvCharging: true,
  engineRunning: true,
  createdAt: true,
} as const;

type GeRow = Pick<
  BatteryGeneralizedEvidenceObservation,
  keyof typeof GE_SELECT
>;

@Injectable()
export class LvMeasuredIntelligenceReadService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LongitudinalProfileRevisionInspectionService)
    private readonly d4Inspection: LongitudinalProfileRevisionInspector,
  ) {}

  async assertVehicleInOrganization(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  async readVehicleIntelligence(
    input: LvMeasuredIntelligenceReadInput,
  ): Promise<LvMeasuredIntelligenceV1> {
    await this.assertVehicleInOrganization(input.organizationId, input.vehicleId);

    const sessionLimit = Math.min(
      Math.max(input.sessionLimit ?? LV_MEASURED_INTELLIGENCE_DEFAULT_SESSION_LIMIT, 1),
      LV_MEASURED_INTELLIGENCE_MAX_SESSION_LIMIT,
    );
    const observationLimit = Math.min(
      Math.max(input.observationLimit ?? LV_MEASURED_INTELLIGENCE_DEFAULT_OBSERVATION_LIMIT, 1),
      LV_MEASURED_INTELLIGENCE_MAX_OBSERVATION_LIMIT,
    );

    const dateRangeMode =
      input.measuredFrom != null && input.measuredTo != null
        ? { from: input.measuredFrom, to: input.measuredTo }
        : null;
    if (dateRangeMode) {
      const maxSpanMs = LV_MEASURED_INTELLIGENCE_MAX_HISTORICAL_RANGE_DAYS * 24 * 60 * 60 * 1000;
      if (dateRangeMode.from.getTime() > dateRangeMode.to.getTime()) {
        throw new BadRequestException('measuredFrom must be <= measuredTo');
      }
      if (dateRangeMode.to.getTime() - dateRangeMode.from.getTime() > maxSpanMs) {
        throw new BadRequestException('measured date range exceeds maximum span');
      }
    }

    const historicalWhere = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      voltage: { not: null },
      ...(dateRangeMode
        ? {
            voltageObservedAt: {
              gte: dateRangeMode.from,
              lte: dateRangeMode.to,
            },
          }
        : {}),
    };

    const [sessions, rawObservations, globalLatestRow, featureRowCount, openGapCount, latestD3] =
      await Promise.all([
      this.prisma.batteryRestSession.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        },
        orderBy: { openedAt: 'desc' },
        take: sessionLimit,
      }),
      this.prisma.batteryGeneralizedEvidenceObservation.findMany({
        where: historicalWhere,
        orderBy: { voltageObservedAt: dateRangeMode ? 'asc' : 'desc' },
        take: observationLimit,
        select: GE_SELECT,
      }),
      this.prisma.batteryGeneralizedEvidenceObservation.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          voltage: { not: null },
        },
        orderBy: { voltageObservedAt: 'desc' },
        select: GE_SELECT,
      }),
      this.prisma.batteryRestSessionFeature.count({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        },
      }),
      this.prisma.batteryProviderObservabilityGap.count({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: BatteryProviderObservabilityGapStatus.OPEN,
        },
      }),
      this.prisma.batteryLongitudinalProfileRevision.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      }),
    ]);

    const sessionIds = sessions.map((s) => s.id);
    const sessionObservations =
      sessionIds.length === 0
        ? []
        : await this.prisma.batteryGeneralizedEvidenceObservation.findMany({
            where: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              restSessionId: { in: sessionIds },
              voltage: { not: null },
            },
            orderBy: { voltageObservedAt: 'asc' },
            take: LV_MEASURED_INTELLIGENCE_MAX_OBSERVATION_LIMIT,
            select: GE_SELECT,
          });

    const featureRows =
      sessionIds.length === 0
        ? []
        : await this.prisma.batteryRestSessionFeature.findMany({
            where: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              restSessionId: { in: sessionIds },
            },
            take: LV_MEASURED_INTELLIGENCE_MAX_FEATURE_ROWS_PER_VEHICLE,
            orderBy: { computedAt: 'desc' },
          });

    const dedupedRows = dedupeObservationsBySourceMeasurementId(rawObservations);
    const orderedHistoricalRows = dateRangeMode
      ? [...dedupedRows].sort((a, b) => {
          const aAt = a.voltageObservedAt?.getTime() ?? a.createdAt.getTime();
          const bAt = b.voltageObservedAt?.getTime() ?? b.createdAt.getTime();
          return aAt - bAt;
        })
      : dedupedRows;
    const dedupedHistorical = orderedHistoricalRows.map((row) => this.mapGeRowToMeasuredPoint(row));

    const latestMeasured = globalLatestRow ? this.mapGeRowToMeasuredPoint(globalLatestRow) : null;
    const historicalWindowLatestMeasured =
      dateRangeMode && dedupedHistorical.length > 0
        ? dedupedHistorical[dedupedHistorical.length - 1]
        : null;
    const historicalObservationsTruncated = rawObservations.length >= observationLimit;
    const inputCoverageIncomplete =
      historicalObservationsTruncated || openGapCount > 0;

    const obsBySession = new Map<string, GeRow[]>();
    for (const row of sessionObservations) {
      if (!row.restSessionId) continue;
      const list = obsBySession.get(row.restSessionId) ?? [];
      list.push(row);
      obsBySession.set(row.restSessionId, list);
    }

    const featuresBySession = new Map<string, BatteryRestSessionFeature[]>();
    for (const row of featureRows) {
      const list = featuresBySession.get(row.restSessionId) ?? [];
      list.push(row);
      featuresBySession.set(row.restSessionId, list);
    }

    const restSessionEpisodes: LvMeasuredRestSessionEpisodeV1[] = sessions.map((session) =>
      this.buildSessionEpisode(session, obsBySession, featuresBySession),
    );

    const longitudinalD4 = await this.buildD4Summary(latestD3);

    return {
      readModelContractVersion: LV_MEASURED_INTELLIGENCE_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scientificBoundary: {
        batteryHealthAssessment: 'NOT_ASSESSED',
        customerPublication: 'OFF',
        e3Runtime: 'INACTIVE',
        f6Calibration: 'OFF',
        noSohPercent: true,
        noGoodBadClassification: true,
      },
      latestMeasured,
      historicalMeasured: dedupedHistorical,
      restSessionEpisodes,
      longitudinalD4,
      provenance: {
        openProviderObservabilityGapCount: openGapCount,
        deduplicationPolicy: 'ONE_ROW_PER_SOURCE_MEASUREMENT_ID',
        historicalQueryMode: dateRangeMode ? 'DATE_RANGE_ASC' : 'RECENT_DESC_LIMIT',
        historicalMeasuredFrom: dateRangeMode?.from.toISOString() ?? null,
        historicalMeasuredTo: dateRangeMode?.to.toISOString() ?? null,
        historicalObservationsTruncated,
        featureRowsTruncated: featureRowCount > LV_MEASURED_INTELLIGENCE_MAX_FEATURE_ROWS_PER_VEHICLE,
        latestMeasuredSemantic: 'VEHICLE_GLOBAL_LATEST',
        historicalWindowLatestMeasured,
        inputCoverageIncomplete,
      },
    };
  }

  private buildSessionEpisode(
    session: BatteryRestSession,
    obsBySession: Map<string, GeRow[]>,
    featuresBySession: Map<string, BatteryRestSessionFeature[]>,
  ): LvMeasuredRestSessionEpisodeV1 {
    const rawSessionObs = obsBySession.get(session.id) ?? [];
    const measuredPoints = dedupeObservationsBySourceMeasurementId(rawSessionObs)
      .sort(
        (a, b) =>
          (a.voltageObservedAt?.getTime() ?? a.createdAt.getTime()) -
          (b.voltageObservedAt?.getTime() ?? b.createdAt.getTime()),
      )
      .map((row) => this.mapGeRowToMeasuredPoint(row));

    const sessionFeatures = featuresBySession.get(session.id) ?? [];
    const canonical = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      rows: sessionFeatures,
    });

    let derivedFeatures: LvMeasuredSessionDerivedFeaturesV1 | null = null;
    let contextLimitedReason: string | null = null;

    if (canonical) {
      const retentionPoints = this.parseRetentionPointsFromInputSummary(canonical.inputSummary);
      const slopeQuality = assessLvMeasuredC3SlopeQualityV1({
        robustRestSlopeMvPerHour: canonical.robustRestSlopeMvPerHour,
        numberOfValidRestPoints: canonical.numberOfValidRestPoints,
        observationSpanMs: canonical.observationSpanMs,
        sessionEndReason: session.endReason,
        retentionPoints,
      });
      derivedFeatures = {
        epistemicBand: 'DERIVED',
        canonicalFeatureRowId: canonical.id,
        semanticRevision: canonical.semanticRevision,
        computationPhase: canonical.computationPhase,
        sessionTrust: canonical.sessionTrust,
        minimumRestVoltageMv: canonical.minimumRestVoltageMv,
        maximumRestVoltageMv: canonical.maximumRestVoltageMv,
        medianRestVoltageMv: canonical.medianRestVoltageMv,
        robustRestSlopeMvPerHour: canonical.robustRestSlopeMvPerHour,
        slopeInterpretability: slopeQuality.interpretability,
        slopeLimitationCodes: slopeQuality.limitationCodes,
        numberOfValidRestPoints: canonical.numberOfValidRestPoints,
        missingRungCount: canonical.missingRungCount,
        observationSpanMs: canonical.observationSpanMs,
        retentionPointCount: retentionPoints.length,
      };
    } else if (sessionFeatures.length > 0) {
      contextLimitedReason = 'CANONICAL_C3_ROW_NOT_RESOLVABLE';
    } else if (measuredPoints.length === 0) {
      contextLimitedReason = 'NO_MEASURED_REST_POINTS_IN_SESSION';
    }

    return {
      restSessionId: session.id,
      sessionStatus: session.sessionStatus,
      anchorType: session.anchorType,
      anchorAt: session.anchorAt.toISOString(),
      openedAt: session.openedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      endReason: session.endReason,
      restObservationCount: session.restObservationCount,
      validRestObservationCount: session.validRestObservationCount,
      measuredPoints,
      derivedFeatures,
      contextLimitedReason,
    };
  }

  private parseRetentionPointsFromInputSummary(
    inputSummary: unknown,
  ): RestSessionFeatureInputRetentionPointV1[] {
    if (!inputSummary || typeof inputSummary !== 'object') return [];
    const summary = inputSummary as { retentionPoints?: RestSessionFeatureInputRetentionPointV1[] };
    return Array.isArray(summary.retentionPoints) ? summary.retentionPoints : [];
  }

  private mapGeRowToMeasuredPoint(row: GeRow): LvMeasuredVoltagePointV1 {
    const voltageV = row.voltage ?? 0;
    return {
      epistemicBand: 'MEASURED',
      observationId: row.id,
      sourceMeasurementId: row.sourceMeasurementId,
      voltageV,
      voltageObservedAt: row.voltageObservedAt?.toISOString() ?? row.createdAt.toISOString(),
      providerObservationAt: row.providerObservationAt?.toISOString() ?? null,
      providerTimestampSource: row.providerTimestampSource,
      operationalContext: mapEvidenceClassToOperationalContext(
        row.evidenceClass,
        row.isLvCharging,
      ),
      evidenceClass: row.evidenceClass,
      restSessionId: row.restSessionId,
      actualRestAgeHours: actualRestAgeMsToHours(row.actualRestAgeMs),
      nominalLadderLabel: nominalRestIntervalIndexToLadderLabel(row.nominalRestIntervalIndex),
      isLvCharging: row.isLvCharging,
      engineRunning: row.engineRunning,
    };
  }

  private async buildD4Summary(
    latestD3: { id: string; createdAt: Date } | null,
  ): Promise<LvMeasuredIntelligenceV1['longitudinalD4']> {
    if (!latestD3) {
      return {
        epistemicBand: 'CONTEXT_LIMITED',
        latestRevisionId: null,
        latestRevisionCreatedAt: null,
        revisionCountBounded: 0,
        sourceEvidenceAckCountOnLatest: null,
        note: 'NO_D3_LONGITUDINAL_REVISION_MATERIALIZED',
      };
    }

    const inspect = await this.d4Inspection.inspectRevision({ revisionId: latestD3.id });
    if (inspect.status !== 'OK') {
      return {
        epistemicBand: 'CONTEXT_LIMITED',
        latestRevisionId: latestD3.id,
        latestRevisionCreatedAt: latestD3.createdAt.toISOString(),
        revisionCountBounded: 1,
        sourceEvidenceAckCountOnLatest: null,
        note: 'D4_INSPECTION_NOT_FOUND',
      };
    }

    return {
      epistemicBand: 'DERIVED',
      latestRevisionId: latestD3.id,
      latestRevisionCreatedAt: latestD3.createdAt.toISOString(),
      revisionCountBounded: 1,
      sourceEvidenceAckCountOnLatest: inspect.view.ackCount,
      note: 'LATEST_REVISION_D4_ACK_SUMMARY_ONLY',
    };
  }
}
