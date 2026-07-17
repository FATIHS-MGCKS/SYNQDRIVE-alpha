import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryMeasurement,
} from '@prisma/client';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { BatteryAssessmentRepository } from './battery-assessment.repository';
import { BatteryMeasurementRepository } from './battery-measurement.repository';
import {
  computeLvEstimatedHealthAssessment,
  type LvEstimatedHealthAssessment,
} from './lv-assessment/lv-estimated-health-assessment.policy';
import type { LvAssessmentEvidenceCandidate } from './lv-assessment/lv-evidence-selection.policy';
import { recordBatteryAssessment } from './observability/battery-v2-prometheus.metrics';

export interface RecomputeLvEstimatedHealthAssessmentInput {
  organizationId: string;
  vehicleId: string;
  shadowMode?: boolean;
  ambientTemperatureC?: number | null;
  ambientTemperatureSource?: 'EXTERIOR_AIR' | 'TRIP_CONTEXT' | null;
  now?: Date;
}

export interface RecomputeLvEstimatedHealthAssessmentResult {
  ok: boolean;
  unsupportedProfile: boolean;
  assessments: LvEstimatedHealthAssessment[];
  persistedAssessmentIds: string[];
  reasons: Array<{ code: string; labelDe: string }>;
}

@Injectable()
export class BatteryAssessmentService {
  private readonly logger = new Logger(BatteryAssessmentService.name);

  constructor(
    private readonly policyProfileService: BatteryPolicyProfileService,
    private readonly measurementRepository: BatteryMeasurementRepository,
    private readonly assessmentRepository: BatteryAssessmentRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  private mapMeasurementToCandidate(
    row: BatteryMeasurement,
  ): LvAssessmentEvidenceCandidate {
    const context =
      row.context && typeof row.context === 'object'
        ? (row.context as Record<string, unknown>)
        : null;
    const provenance =
      row.provenance && typeof row.provenance === 'object'
        ? (row.provenance as Record<string, unknown>)
        : null;

    return {
      measurementId: row.id,
      type: row.type,
      quality: row.quality,
      observedAt: row.observedAt,
      sessionId: row.sessionId,
      sessionType: null,
      numericValue: row.numericValue,
      context,
      provenance: provenance
        ? {
            providerTimestamp:
              (provenance.providerTimestamp as string | Date | null | undefined) ??
              row.providerTimestamp,
            receivedAt:
              (provenance.receivedAt as string | Date | null | undefined) ??
              row.receivedAt,
            sourceType: provenance.sourceType as string | undefined,
            measurementKind: provenance.measurementKind as string | undefined,
            tripId: provenance.tripId as string | undefined,
            restWindowId: provenance.restWindowId as string | undefined,
            documentExtractionId: provenance.documentExtractionId as
              | string
              | undefined,
            serviceEventId: provenance.serviceEventId as string | undefined,
          }
        : {
            providerTimestamp: row.providerTimestamp,
            receivedAt: row.receivedAt,
          },
      cycleKey: null,
    };
  }

  async recomputeLvEstimatedHealth(
    input: RecomputeLvEstimatedHealthAssessmentInput,
  ): Promise<RecomputeLvEstimatedHealthAssessmentResult> {
    const policy = await this.policyProfileService.resolveForVehicle(
      input.vehicleId,
    );
    const measurements = await this.measurementRepository.listForOrganization({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      limit: 100,
    });
    const lvCandidates = measurements
      .filter((row) => row.scope === BatteryEvidenceScope.LV)
      .map((row) => this.mapMeasurementToCandidate(row));

    const shadowMode =
      input.shadowMode === true && isBatteryV2RestShadowEnabled();

    const computed = computeLvEstimatedHealthAssessment({
      vehicleId: input.vehicleId,
      policy,
      candidates: lvCandidates,
      assessmentMode: shadowMode ? 'SHADOW' : 'CANONICAL',
      now: input.now,
      ambientTemperatureC: input.ambientTemperatureC,
      ambientTemperatureSource: input.ambientTemperatureSource,
    });

    if (!computed.ok) {
      if (this.metrics) {
        recordBatteryAssessment(this.metrics, {
          scope: 'lv',
          mode: shadowMode ? 'shadow' : 'canonical',
          outcome: computed.unsupportedProfile ? 'unsupported' : 'skipped',
        });
      }
      return {
        ok: false,
        unsupportedProfile: computed.unsupportedProfile,
        assessments: [],
        persistedAssessmentIds: [],
        reasons: computed.reasons,
      };
    }

    const persistedAssessmentIds: string[] = [];
    for (const assessment of computed.assessments) {
      const persisted = await this.assessmentRepository.persistLvEstimatedHealth({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        assessment,
      });
      persistedAssessmentIds.push(persisted.id);
      if (this.metrics) {
        recordBatteryAssessment(this.metrics, {
          scope: 'lv',
          mode: shadowMode ? 'shadow' : 'canonical',
          outcome: 'persisted',
        });
      }
    }

    this.logger.log(
      `LV estimated-health assessments persisted vehicle=${input.vehicleId} count=${persistedAssessmentIds.length}`,
    );

    return {
      ok: true,
      unsupportedProfile: false,
      assessments: computed.assessments,
      persistedAssessmentIds,
      reasons: [],
    };
  }
}
