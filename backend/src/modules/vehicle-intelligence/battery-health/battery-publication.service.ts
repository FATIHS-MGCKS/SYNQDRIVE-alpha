import { Injectable, Logger, Optional } from '@nestjs/common';
import { isBatteryV2PublicationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { BatteryPublicationRepository } from './battery-publication.repository';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import {
  evaluateLvPublicationPolicy,
  type LvPublicationDecision,
  type LvPublicationEvidenceSummary,
} from './lv-assessment/lv-publication.policy';
import { recordBatteryPublication } from './observability/battery-v2-prometheus.metrics';

export interface UpdateLvPublicationInput {
  organizationId: string;
  vehicleId: string;
  assessmentId: string;
  publicationVersion?: number;
  now?: Date;
}

export interface UpdateLvPublicationResult {
  ok: boolean;
  decision: LvPublicationDecision;
  persistedPublicationId: string | null;
  supersededPublicationId: string | null;
}

@Injectable()
export class BatteryPublicationService {
  private readonly logger = new Logger(BatteryPublicationService.name);

  constructor(
    private readonly policyProfileService: BatteryPolicyProfileService,
    private readonly publicationRepository: BatteryPublicationRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  buildEvidenceSummaryFromAssessment(
    assessment: LvEstimatedHealthAssessment,
    now: Date = new Date(),
  ): LvPublicationEvidenceSummary {
    const summary = assessment.inputSummary ?? {};
    const rejectedIds = Array.isArray(summary.rejectedMeasurementIds)
      ? (summary.rejectedMeasurementIds as string[])
      : [];
    const selectedIds = Array.isArray(summary.selectedMeasurementIds)
      ? (summary.selectedMeasurementIds as string[])
      : [];

    const rejectedReasons = Array.isArray(summary.rejectedEvidence)
      ? (summary.rejectedEvidence as Array<{ reasonCode?: string }>)
      : [];

    const contaminationRejectedCount =
      rejectedReasons.filter((row) =>
        String(row.reasonCode ?? '').includes('CONTAMINATED'),
      ).length ||
      rejectedIds.filter((id) => id.includes('contaminated')).length;

    const cycleKeys = new Set<string>();
    if (Array.isArray(summary.evidenceCycles)) {
      for (const key of summary.evidenceCycles as string[]) {
        if (key) cycleKeys.add(key);
      }
    }
    const compatibleCycleCount = Math.max(
      cycleKeys.size,
      assessment.measurementCoverage.restMeasurementCount > 0
        ? Math.min(
            assessment.measurementCoverage.selectedCount,
            assessment.measurementCoverage.restMeasurementCount,
          )
        : assessment.measurementCoverage.selectedCount,
    );

    const validFromMs = new Date(assessment.validFrom).getTime();
    const latestMs = Number.isFinite(validFromMs) ? validFromMs : now.getTime();
    const firstMs =
      typeof summary.firstEvidenceObservedAt === 'string'
        ? new Date(summary.firstEvidenceObservedAt).getTime()
        : latestMs;

    return {
      compatibleCycleCount,
      validEvidenceCount: Math.max(
        selectedIds.length,
        assessment.measurementCoverage.selectedCount,
      ),
      rejectedEvidenceCount: Math.max(
        rejectedIds.length,
        assessment.measurementCoverage.rejectedCount,
      ),
      contaminationRejectedCount,
      latestAssessmentEvidenceObservedAt: new Date(latestMs).toISOString(),
      firstAssessmentEvidenceObservedAt: new Date(
        Number.isFinite(firstMs) ? firstMs : latestMs,
      ).toISOString(),
    };
  }

  async updateLvPublication(
    input: UpdateLvPublicationInput,
  ): Promise<UpdateLvPublicationResult> {
    const now = input.now ?? new Date();
    const policy = await this.policyProfileService.resolveForVehicle(
      input.vehicleId,
    );
    const assessmentRow = await this.publicationRepository.findAssessmentById({
      organizationId: input.organizationId,
      assessmentId: input.assessmentId,
    });

    const assessment = assessmentRow
      ? this.publicationRepository.assessmentToEstimatedHealthModel(assessmentRow)
      : null;

    const previousRow =
      await this.publicationRepository.findLatestActiveLvPublication({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
    const previous =
      this.publicationRepository.toPublicationPreviousState(previousRow);

    const evidence = assessment
      ? this.buildEvidenceSummaryFromAssessment(assessment, now)
      : {
          compatibleCycleCount: 0,
          validEvidenceCount: 0,
          rejectedEvidenceCount: 0,
          contaminationRejectedCount: 0,
          latestAssessmentEvidenceObservedAt: null,
          firstAssessmentEvidenceObservedAt: null,
        };

    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: isBatteryV2PublicationEnabled(),
      policy,
      assessment,
      evidence,
      previous,
      now,
    });

    if (!decision.shouldPersistPublication || !assessment || !assessmentRow) {
      if (this.metrics) {
        recordBatteryPublication(this.metrics, {
          maturity: decision.maturity,
          outcome: 'skipped',
        });
      }
      return {
        ok: true,
        decision,
        persistedPublicationId: null,
        supersededPublicationId: decision.supersedePublicationId,
      };
    }

    const persisted = await this.publicationRepository.persistLvPublication({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      assessmentId: input.assessmentId,
      assessment,
      decision,
      publicationVersion: input.publicationVersion,
    });

    if (decision.supersedePublicationId) {
      await this.publicationRepository.markPublicationSuperseded({
        organizationId: input.organizationId,
        publicationId: decision.supersedePublicationId,
        supersededByPublicationId: persisted.id,
        supersededAt: now,
      });
    }

    this.logger.log(
      `LV publication ${decision.maturity} vehicle=${input.vehicleId} assessment=${input.assessmentId} published=${decision.publishedEstimatedHealth}`,
    );

    if (this.metrics) {
      recordBatteryPublication(this.metrics, {
        maturity: decision.maturity,
        outcome: decision.supersedePublicationId ? 'superseded' : 'persisted',
      });
    }

    return {
      ok: true,
      decision,
      persistedPublicationId: persisted.id,
      supersededPublicationId: decision.supersedePublicationId,
    };
  }
}
