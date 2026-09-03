import { Injectable, Logger, Optional } from '@nestjs/common';
import { isBatteryV2PublicationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { BatteryPublicationRepository } from './battery-publication.repository';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-assessment/lv-publication-contract.policy';
import {
  evaluateLvPublicationPolicy,
  isLvPublicationPreviousStale,
  type LvPublicationDecision,
  type LvPublicationEvidenceSummary,
  type LvPublicationPreviousState,
} from './lv-assessment/lv-publication.policy';
import {
  recordBatteryPublication,
  recordBatteryV2PublicationAgeHours,
  recordBatteryV2PublicationCoverage,
} from './observability/battery-v2-prometheus.metrics';
import {
  bucketPublicationAgeHours,
  computePublicationEvidenceAgeHours,
  formatBatteryV2PipelineLog,
} from './observability/battery-v2-pipeline-observability.util';

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
    const publicationVersion =
      input.publicationVersion ?? LV_PUBLICATION_CONTRACT_VERSION;
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

    const existingIdentity =
      await this.publicationRepository.findPublicationByAssessmentIdentity({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        assessmentId: input.assessmentId,
        publicationVersion,
      });

    const retainedRow =
      await this.publicationRepository.findLatestRetainedLvPublication({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
    const retained =
      this.publicationRepository.toPublicationPreviousState(retainedRow);

    await this.maintainPreviousPublicationLifecycle({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      currentAssessmentId: input.assessmentId,
      previous: retained,
      policy,
      now,
    });

    const previousRow =
      await this.publicationRepository.findLatestActiveLvPublication({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
    const previous =
      this.publicationRepository.toPublicationPreviousState(previousRow);

    const stabilizationPrevious =
      previous &&
      previous.assessmentId !== input.assessmentId
        ? previous
        : previous?.assessmentId === input.assessmentId
          ? previous
          : null;

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

    const existingPublicationId = existingIdentity?.id ?? null;
    const isSameAssessmentRetry = existingIdentity != null;

    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: isBatteryV2PublicationEnabled(),
      policy,
      assessment,
      evidence,
      previous: stabilizationPrevious,
      isSameAssessmentRetry,
      now,
    });

    if (isSameAssessmentRetry && existingIdentity) {
      const repairedSupersessionId = await this.repairPendingSupersessionOnRetry({
        organizationId: input.organizationId,
        existingPublication: existingIdentity,
        now,
      });

      const existingState =
        this.publicationRepository.toPublicationPreviousState(existingIdentity);
      if (
        existingState &&
        existingState.maturity === 'STABLE' &&
        isLvPublicationPreviousStale(existingState, now)
      ) {
        const staleDecision = evaluateLvPublicationPolicy({
          publicationEnabled: isBatteryV2PublicationEnabled(),
          policy,
          assessment: null,
          evidence,
          previous: existingState,
          materializeStaleLifecycle: true,
          now,
        });
        if (
          staleDecision.maturity === 'STALE' &&
          staleDecision.shouldPersistPublication
        ) {
          await this.publicationRepository.materializePublicationLifecycleState({
            organizationId: input.organizationId,
            publicationId: existingIdentity.id,
            decision: staleDecision,
            assessmentId: input.assessmentId,
          });
          this.logger.debug(
            formatBatteryV2PipelineLog({
              component: 'publication',
              event: 'same_assessment_lifecycle_stale_materialized',
              status: 'completed',
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              correlationId: input.assessmentId,
            }),
          );
        }
      }

      this.logger.debug(
        formatBatteryV2PipelineLog({
          component: 'publication',
          event: 'same_assessment_retry_converged',
          status: 'completed',
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          correlationId: input.assessmentId,
        }),
      );
      return {
        ok: true,
        decision,
        persistedPublicationId: existingIdentity.id,
        supersededPublicationId: repairedSupersessionId,
      };
    }

    if (!decision.shouldPersistPublication || !assessment || !assessmentRow) {
      if (this.metrics) {
        recordBatteryPublication(this.metrics, {
          maturity: decision.maturity,
          outcome: 'skipped',
        });
        recordBatteryV2PublicationCoverage(this.metrics, {
          scope: 'lv',
          state: 'skipped',
        });
      }
      this.logger.debug(
        formatBatteryV2PipelineLog({
          component: 'publication',
          event: 'publication_skipped',
          status: 'skipped',
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          publicationMaturity: decision.maturity,
        }),
      );
      return {
        ok: true,
        decision,
        persistedPublicationId: null,
        supersededPublicationId: decision.supersedePublicationId,
      };
    }

    if (
      decision.supersedePublicationId &&
      existingPublicationId &&
      decision.supersedePublicationId === existingPublicationId
    ) {
      this.logger.warn(
        formatBatteryV2PipelineLog({
          component: 'publication',
          event: 'self_supersession_prevented',
          status: 'failed',
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          errorCode: 'SELF_SUPERSESSION',
        }),
      );
      return {
        ok: false,
        decision: {
          ...decision,
          shouldPersistPublication: false,
          supersedePublicationId: null,
        },
        persistedPublicationId: null,
        supersededPublicationId: null,
      };
    }

    const persisted = await this.publicationRepository.persistLvPublication({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      assessmentId: input.assessmentId,
      assessment,
      decision,
      publicationVersion,
    });

    if (
      decision.supersedePublicationId &&
      decision.supersedePublicationId !== persisted.id
    ) {
      await this.publicationRepository.markPublicationSuperseded({
        organizationId: input.organizationId,
        publicationId: decision.supersedePublicationId,
        supersededByPublicationId: persisted.id,
        supersededAt: now,
      });
    }

    const publicationAgeHours = computePublicationEvidenceAgeHours(
      evidence.firstAssessmentEvidenceObservedAt,
      now,
    );

    this.logger.log(
      formatBatteryV2PipelineLog({
        component: 'publication',
        event: 'publication_persisted',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        publicationMaturity: decision.maturity,
        publicationAgeBucket: bucketPublicationAgeHours(publicationAgeHours),
      }),
    );

    if (this.metrics) {
      recordBatteryPublication(this.metrics, {
        maturity: decision.maturity,
        outcome: decision.supersedePublicationId ? 'superseded' : 'persisted',
      });
      recordBatteryV2PublicationCoverage(this.metrics, {
        scope: 'lv',
        state: 'published',
      });
      if (publicationAgeHours != null) {
        recordBatteryV2PublicationAgeHours(this.metrics, {
          maturity: decision.maturity,
          ageHours: publicationAgeHours,
        });
      }
    }

    return {
      ok: true,
      decision,
      persistedPublicationId: persisted.id,
      supersededPublicationId: decision.supersedePublicationId,
    };
  }

  private async maintainPreviousPublicationLifecycle(input: {
    organizationId: string;
    vehicleId: string;
    currentAssessmentId: string;
    previous: LvPublicationPreviousState | null;
    policy: Awaited<ReturnType<BatteryPolicyProfileService['resolveForVehicle']>>;
    now: Date;
  }): Promise<void> {
    if (!input.previous?.assessmentId) return;
    if (input.previous.assessmentId === input.currentAssessmentId) return;
    if (input.previous.maturity === 'STALE') return;

    const staleDecision = evaluateLvPublicationPolicy({
      publicationEnabled: isBatteryV2PublicationEnabled(),
      policy: input.policy,
      assessment: null,
      evidence: {
        compatibleCycleCount: 0,
        validEvidenceCount: 0,
        rejectedEvidenceCount: 0,
        contaminationRejectedCount: 0,
        latestAssessmentEvidenceObservedAt: null,
        firstAssessmentEvidenceObservedAt: null,
      },
      previous: input.previous,
      materializeStaleLifecycle: true,
      now: input.now,
    });

    if (staleDecision.maturity !== 'STALE' || !staleDecision.shouldPersistPublication) {
      return;
    }

    await this.publicationRepository.materializePublicationLifecycleState({
      organizationId: input.organizationId,
      publicationId: input.previous.publicationId,
      decision: staleDecision,
      assessmentId: input.previous.assessmentId,
    });

    this.logger.debug(
      formatBatteryV2PipelineLog({
        component: 'publication',
        event: 'previous_publication_stale_materialized',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        correlationId: input.previous.assessmentId,
      }),
    );
  }

  private async repairPendingSupersessionOnRetry(input: {
    organizationId: string;
    existingPublication: { id: string; reason: string | null };
    now: Date;
  }): Promise<string | null> {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = input.existingPublication.reason
        ? (JSON.parse(input.existingPublication.reason) as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }

    const supersedePublicationId = payload?.supersedePublicationId;
    if (typeof supersedePublicationId !== 'string' || !supersedePublicationId) {
      return null;
    }

    const prior = await this.publicationRepository.findPublicationById({
      organizationId: input.organizationId,
      publicationId: supersedePublicationId,
    });
    if (!prior) return null;

    const priorState = this.publicationRepository.toPublicationPreviousState(prior);
    if (!priorState || priorState.maturity === 'SUPERSEDED') {
      return null;
    }

    await this.publicationRepository.markPublicationSuperseded({
      organizationId: input.organizationId,
      publicationId: supersedePublicationId,
      supersededByPublicationId: input.existingPublication.id,
      supersededAt: input.now,
    });

    return supersedePublicationId;
  }
}
