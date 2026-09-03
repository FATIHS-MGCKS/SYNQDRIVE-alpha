import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';
import {
  arbitrateLvPublicationTrack,
  type LvPublicationArbitrationCandidate,
} from './lv-publication-track-arbitration.policy';
import {
  buildCanonicalLvPublicationHandoffJobKey,
} from './lv-publication-handoff.policy';
import {
  LV_PUBLICATION_HANDOFF_OUTCOME,
  LV_PUBLICATION_HANDOFF_STATUS,
  readPublicationHandoffFromAssessmentSummary,
  type LvPublicationHandoffOutcome,
} from './lv-publication-handoff.metadata';
import {
  mergePublicationHandoffPatchIntoSummary,
  mutateBatteryAssessmentPublicationHandoff,
  reserveLvPublicationHandoffEnqueue,
} from './lv-publication-handoff.mutation';
import { formatBatteryV2PipelineLog } from '../observability/battery-v2-pipeline-observability.util';
import {
  isKnownPublicationTrack,
} from './lv-publication-authority-epoch.policy';
import type { LvAssessmentTrack } from './lv-estimated-health-assessment.policy';

export interface EnsureLvPublicationHandoffInput {
  organizationId: string;
  vehicleId: string;
  epochCandidates: LvPublicationArbitrationCandidate[];
  correlationPrefix?: string;
}

export interface EnsureLvPublicationHandoffResult {
  enqueued: boolean;
  skipped: boolean;
  reason?: string;
  jobId?: string | null;
  idempotencyKey?: string;
  selectedAssessmentId?: string | null;
  selectedAssessmentTrack?: LvAssessmentTrack | null;
  epochAssessmentIds?: string[];
}

@Injectable()
export class LvPublicationHandoffService {
  private readonly logger = new Logger(LvPublicationHandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
  ) {}

  async ensurePublicationHandoff(
    input: EnsureLvPublicationHandoffInput,
  ): Promise<EnsureLvPublicationHandoffResult> {
    const arbitration = arbitrateLvPublicationTrack(input.epochCandidates);

    if (!arbitration.selected) {
      this.logger.debug(
        formatBatteryV2PipelineLog({
          component: 'publication-handoff',
          event: 'publication_handoff_no_qualifying_track',
          status: 'skipped',
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        }),
      );
      return {
        enqueued: false,
        skipped: true,
        reason: 'no_qualifying_assessment',
        selectedAssessmentId: null,
        selectedAssessmentTrack: null,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    const selected = arbitration.selected;
    if (!isKnownPublicationTrack(selected.assessmentTrack)) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'unknown_selected_track',
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: null,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    const idempotencyKey = buildCanonicalLvPublicationHandoffJobKey({
      assessmentId: selected.assessmentId,
      publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
    });

    const assessmentRow = await this.prisma.batteryAssessment.findFirst({
      where: {
        id: selected.assessmentId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });
    if (!assessmentRow) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'selected_assessment_not_found',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    const existingHandoff = readPublicationHandoffFromAssessmentSummary(
      assessmentRow.inputSummary,
    );
    if (
      existingHandoff?.status === LV_PUBLICATION_HANDOFF_STATUS.EXECUTED &&
      existingHandoff.selectedAssessmentId === selected.assessmentId &&
      existingHandoff.idempotencyKey === idempotencyKey
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already_executed',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    if (
      existingHandoff?.status === LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED &&
      existingHandoff.selectedAssessmentId === selected.assessmentId &&
      existingHandoff.idempotencyKey === idempotencyKey &&
      existingHandoff.bullJobId
    ) {
      const live = await this.jobProducer.hasLiveJob(idempotencyKey);
      if (live) {
        return {
          enqueued: false,
          skipped: true,
          reason: 'already_enqueued_live',
          idempotencyKey,
          jobId: existingHandoff.bullJobId ?? null,
          selectedAssessmentId: selected.assessmentId,
          selectedAssessmentTrack: selected.assessmentTrack,
          epochAssessmentIds: arbitration.epochAssessmentIds,
        };
      }
    }

    if (
      await this.deadLetters.isDeadLetter('BATTERY_PUBLICATION_UPDATE', idempotencyKey)
    ) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'dead_letter',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    const now = new Date();
    const reservation = await reserveLvPublicationHandoffEnqueue(this.prisma, {
      assessmentId: selected.assessmentId,
      organizationId: input.organizationId,
      idempotencyKey,
      now,
      handoffPatch: {
        selectedAssessmentId: selected.assessmentId,
        assessmentTrack: selected.assessmentTrack,
        idempotencyKey,
        publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      },
    });

    if (reservation.action === 'skip_executed') {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already_executed',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    if (reservation.action === 'skip_in_progress') {
      const live = await this.jobProducer.hasLiveJob(idempotencyKey);
      if (live) {
        return {
          enqueued: false,
          skipped: true,
          reason: 'already_enqueued_live',
          idempotencyKey,
          jobId: reservation.handoff.bullJobId ?? null,
          selectedAssessmentId: selected.assessmentId,
          selectedAssessmentTrack: selected.assessmentTrack,
          epochAssessmentIds: arbitration.epochAssessmentIds,
        };
      }
      return {
        enqueued: false,
        skipped: true,
        reason: 'enqueue_in_progress',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    const correlationPrefix = input.correlationPrefix ?? 'lv-pub-handoff';
    const jobId = await this.jobProducer.enqueue('BATTERY_PUBLICATION_UPDATE', {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey,
      assessmentId: selected.assessmentId,
      publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
      sourceEntityId: selected.assessmentId,
      requestedAt: now.toISOString(),
      correlationId: `${correlationPrefix}:${input.vehicleId}:${selected.assessmentId}`,
    });

    const handoffPatch = {
      status: jobId
        ? LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED
        : LV_PUBLICATION_HANDOFF_STATUS.MISSING,
      selectedAssessmentId: selected.assessmentId,
      assessmentTrack: selected.assessmentTrack,
      idempotencyKey,
      publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
      epochAssessmentIds: arbitration.epochAssessmentIds,
      lastAttemptAt: now.toISOString(),
      ...(jobId
        ? { enqueuedAt: now.toISOString(), bullJobId: jobId }
        : {}),
    };

    await this.persistHandoffState({
      assessmentId: selected.assessmentId,
      organizationId: input.organizationId,
      handoffPatch,
    });

    if (!jobId) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'enqueue_suppressed',
        idempotencyKey,
        selectedAssessmentId: selected.assessmentId,
        selectedAssessmentTrack: selected.assessmentTrack,
        epochAssessmentIds: arbitration.epochAssessmentIds,
      };
    }

    this.logger.log(
      formatBatteryV2PipelineLog({
        component: 'publication-handoff',
        event: 'publication_handoff_enqueued',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        jobType: 'BATTERY_PUBLICATION_UPDATE',
        correlationId: `${correlationPrefix}:${selected.assessmentId}`,
      }),
    );

    return {
      enqueued: true,
      skipped: false,
      jobId,
      idempotencyKey,
      selectedAssessmentId: selected.assessmentId,
      selectedAssessmentTrack: selected.assessmentTrack,
      epochAssessmentIds: arbitration.epochAssessmentIds,
    };
  }

  async reconcilePublicationHandoff(
    input: EnsureLvPublicationHandoffInput,
  ): Promise<EnsureLvPublicationHandoffResult> {
    const attemptedAt = new Date();
    const result = await this.ensurePublicationHandoff(input);

    if (this.shouldRecordReconciliationInspection(result)) {
      const assessmentId = result.selectedAssessmentId;
      if (assessmentId && result.idempotencyKey) {
        await this.touchReconciliationFairness({
          organizationId: input.organizationId,
          assessmentId,
          idempotencyKey: result.idempotencyKey,
          attemptedAt,
        });
      }
    }

    return result;
  }

  async touchReconciliationFairness(input: {
    organizationId: string;
    assessmentId: string;
    idempotencyKey: string;
    attemptedAt?: Date;
  }): Promise<void> {
    const assessmentRow = await this.prisma.batteryAssessment.findFirst({
      where: {
        id: input.assessmentId,
        organizationId: input.organizationId,
      },
    });
    if (!assessmentRow) return;

    const existing = readPublicationHandoffFromAssessmentSummary(
      assessmentRow.inputSummary,
    );
    if (!existing) return;

    await this.persistHandoffState({
      assessmentId: input.assessmentId,
      organizationId: input.organizationId,
      handoffPatch: {
        ...existing,
        lastAttemptAt: (input.attemptedAt ?? new Date()).toISOString(),
      },
    });
  }

  async acknowledgeExecuted(input: {
    organizationId: string;
    vehicleId: string;
    assessmentId: string;
    outcome: LvPublicationHandoffOutcome;
  }): Promise<void> {
    const assessmentRow = await this.prisma.batteryAssessment.findFirst({
      where: {
        id: input.assessmentId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });
    if (!assessmentRow) return;

    const existing = readPublicationHandoffFromAssessmentSummary(
      assessmentRow.inputSummary,
    );
    if (!existing) return;

    const now = new Date().toISOString();
    await this.persistHandoffState({
      assessmentId: input.assessmentId,
      organizationId: input.organizationId,
      handoffPatch: {
        ...existing,
        status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
        outcome: input.outcome,
        executedAt: now,
        lastAttemptAt: now,
      },
    });

    this.logger.debug(
      formatBatteryV2PipelineLog({
        component: 'publication-handoff',
        event: 'publication_handoff_executed',
        status: 'completed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        correlationId: input.assessmentId,
      }),
    );
  }

  private shouldRecordReconciliationInspection(
    result: EnsureLvPublicationHandoffResult,
  ): boolean {
    if (result.enqueued) return false;
    if (result.reason === 'enqueue_suppressed') return false;
    if (result.reason === 'selected_assessment_not_found') return false;
    if (result.reason === 'no_qualifying_assessment') return false;
    if (result.reason === 'unknown_selected_track') return false;
    return true;
  }

  private async persistHandoffState(input: {
    assessmentId: string;
    organizationId: string;
    handoffPatch: Parameters<typeof mergePublicationHandoffPatchIntoSummary>[1];
  }): Promise<void> {
    await mutateBatteryAssessmentPublicationHandoff(this.prisma, {
      assessmentId: input.assessmentId,
      organizationId: input.organizationId,
      mutate: (summary) =>
        mergePublicationHandoffPatchIntoSummary(summary, input.handoffPatch),
    });
  }
}

export function mapPublicationUpdateOutcome(input: {
  ok: boolean;
  persistedPublicationId: string | null;
}): LvPublicationHandoffOutcome {
  if (input.persistedPublicationId) {
    return LV_PUBLICATION_HANDOFF_OUTCOME.PUBLICATION_EVALUATED;
  }
  return LV_PUBLICATION_HANDOFF_OUTCOME.POLICY_SKIPPED;
}
