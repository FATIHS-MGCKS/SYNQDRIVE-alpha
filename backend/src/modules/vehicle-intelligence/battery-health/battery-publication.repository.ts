import { Injectable } from '@nestjs/common';
import {
  BatteryAssessment,
  BatteryEvidenceScope,
  BatteryPublication,
  Prisma,
  SohPublicationState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPublicationJobIdempotencyKey } from './jobs/battery-v2-job-idempotency.policy';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import {
  buildLvPublicationReasonPayload,
  type LvPublicationDecision,
  type LvPublicationMaturity,
  type LvPublicationPreviousState,
} from './lv-assessment/lv-publication.policy';

export interface PersistLvPublicationInput {
  organizationId: string;
  vehicleId: string;
  assessmentId: string;
  assessment: LvEstimatedHealthAssessment;
  decision: LvPublicationDecision;
  publicationVersion?: number;
}

function mapMaturityToLegacyStatus(
  maturity: LvPublicationMaturity,
): SohPublicationState {
  switch (maturity) {
    case 'STABLE':
      return SohPublicationState.STABLE;
    case 'PROVISIONAL':
      return SohPublicationState.STABILIZING;
    case 'STALE':
    case 'SUPERSEDED':
      return SohPublicationState.STABLE;
    case 'CALIBRATING':
    case 'SHADOW':
    case 'UNAVAILABLE':
    default:
      return SohPublicationState.INITIAL_CALIBRATION;
  }
}

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

function toPreviousState(row: BatteryPublication): LvPublicationPreviousState | null {
  const payload = parseReasonPayload(row.reason);
  const maturity =
    (payload?.maturity as LvPublicationMaturity | undefined) ?? 'PROVISIONAL';
  if (maturity === 'SUPERSEDED') return null;

  return {
    publicationId: row.id,
    publishedEstimatedHealth:
      typeof payload?.publishedEstimatedHealth === 'number'
        ? payload.publishedEstimatedHealth
        : null,
    stabilizedEstimatedHealth:
      typeof payload?.stabilizedEstimatedHealth === 'number'
        ? payload.stabilizedEstimatedHealth
        : null,
    maturity,
    publishedAt: row.publishedAt.toISOString(),
    assessmentEvidenceObservedAt:
      typeof payload?.assessmentEvidenceObservedAt === 'string'
        ? payload.assessmentEvidenceObservedAt
        : null,
  };
}

@Injectable()
export class BatteryPublicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAssessmentById(input: {
    organizationId: string;
    assessmentId: string;
  }): Promise<BatteryAssessment | null> {
    return this.prisma.batteryAssessment.findFirst({
      where: {
        id: input.assessmentId,
        organizationId: input.organizationId,
      },
    });
  }

  async findLatestActiveLvPublication(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<BatteryPublication | null> {
    const rows = await this.prisma.batteryPublication.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        scope: BatteryEvidenceScope.LV,
      },
      orderBy: { publishedAt: 'desc' },
      take: 25,
    });

    const supersededIds = new Set<string>();
    for (const row of rows) {
      const payload = parseReasonPayload(row.reason);
      const supersedeId = payload?.supersedePublicationId;
      if (typeof supersedeId === 'string') {
        supersededIds.add(supersedeId);
      }
    }

    return (
      rows.find(
        (row) =>
          !supersededIds.has(row.id) &&
          parseReasonPayload(row.reason)?.maturity !== 'SUPERSEDED',
      ) ?? null
    );
  }

  toPublicationPreviousState(
    row: BatteryPublication | null,
  ): LvPublicationPreviousState | null {
    if (!row) return null;
    return toPreviousState(row);
  }

  assessmentToEstimatedHealthModel(
    row: BatteryAssessment,
  ): LvEstimatedHealthAssessment | null {
    const summary =
      row.inputSummary && typeof row.inputSummary === 'object'
        ? (row.inputSummary as Record<string, unknown>)
        : null;
    if (!summary) return null;

    const measurementCoverage =
      summary.measurementCoverage &&
      typeof summary.measurementCoverage === 'object'
        ? (summary.measurementCoverage as LvEstimatedHealthAssessment['measurementCoverage'])
        : {
            selectedCount: 0,
            rejectedCount: 0,
            restMeasurementCount: 0,
            startProxyCount: 0,
            workshopMeasurementCount: 0,
            shadowExperimentalCount: 0,
            weightedInputCount: 0,
            coverageRatio: 0,
          };

    return {
      assessmentType: 'LV_ESTIMATED_HEALTH',
      scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
      assessmentTrack:
        (summary.assessmentTrack as LvEstimatedHealthAssessment['assessmentTrack']) ??
        'TELEMETRY',
      assessmentMode:
        (summary.assessmentMode as LvEstimatedHealthAssessment['assessmentMode']) ??
        'CANONICAL',
      modelVersion: row.modelVersion,
      estimatedHealthScore: row.scoreValue,
      confidence:
        (row.confidence as LvEstimatedHealthAssessment['confidence']) ??
        'INSUFFICIENT',
      confidenceScore:
        typeof summary.confidenceScore === 'number'
          ? summary.confidenceScore
          : 0,
      evidenceStrength: row.evidenceStrength,
      dataQuality:
        (row.dataQuality as LvEstimatedHealthAssessment['dataQuality']) ??
        'UNAVAILABLE',
      measurementCoverage,
      validFrom: row.validFrom?.toISOString() ?? row.computedAt.toISOString(),
      validUntil: row.validUntil?.toISOString() ?? null,
      publicationEligible: summary.publicationEligible === true,
      reasons: Array.isArray(summary.reasons)
        ? (summary.reasons as LvEstimatedHealthAssessment['reasons'])
        : [],
      idempotencyKey: row.idempotencyKey,
      inputSummary: summary,
    };
  }

  async persistLvPublication(
    input: PersistLvPublicationInput,
  ): Promise<BatteryPublication> {
    const version = input.publicationVersion ?? 1;
    const idempotencyKey = buildPublicationJobIdempotencyKey({
      assessmentId: input.assessmentId,
      publicationVersion: version,
    });

    const reasonPayload = buildLvPublicationReasonPayload(input.decision, {
      assessmentIdempotencyKey: input.assessment.idempotencyKey,
      assessmentTrack: input.assessment.assessmentTrack,
      assessmentMode: input.assessment.assessmentMode,
      scoreSemantics: input.assessment.scoreSemantics,
    });

    const data: Prisma.BatteryPublicationUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: BatteryEvidenceScope.LV,
      assessmentId: input.assessmentId,
      status: mapMaturityToLegacyStatus(input.decision.maturity),
      publishedAt: new Date(),
      staleAt: input.decision.staleAt ? new Date(input.decision.staleAt) : null,
      reason: JSON.stringify(reasonPayload),
      version,
      idempotencyKey,
    };

    try {
      return await this.prisma.batteryPublication.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.batteryPublication.findFirstOrThrow({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            idempotencyKey,
          },
        });
      }
      throw error;
    }
  }

  async markPublicationSuperseded(input: {
    organizationId: string;
    publicationId: string;
    supersededByPublicationId: string;
    supersededAt?: Date;
  }): Promise<BatteryPublication> {
    const existing = await this.prisma.batteryPublication.findFirstOrThrow({
      where: {
        id: input.publicationId,
        organizationId: input.organizationId,
      },
    });

    const payload = parseReasonPayload(existing.reason) ?? {};
    const supersededPayload = {
      ...payload,
      maturity: 'SUPERSEDED',
      supersededByPublicationId: input.supersededByPublicationId,
      supersededAt: (input.supersededAt ?? new Date()).toISOString(),
    };

    return this.prisma.batteryPublication.update({
      where: { id: existing.id },
      data: {
        reason: JSON.stringify(supersededPayload),
      },
    });
  }
}
