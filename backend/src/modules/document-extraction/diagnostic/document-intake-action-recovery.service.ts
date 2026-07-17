import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma, DocumentExtractionType } from '@prisma/client';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentActionOrchestratorService } from '../document-action-orchestrator.service';
import {
  readDocumentActionPlanState,
  storeDocumentActionPlanApplyLifecycle,
  storeDocumentActionPlanExecution,
} from '../document-action-plan.store';
import {
  buildActionIdempotencyKey,
} from '../document-action-plan.types';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
  type DocumentActionExecutionRecord,
  type DocumentActionPlanExecution,
} from '../document-action.types';
import {
  mapApplyLifecycleToExtractionStatus,
  resolveApplyLifecycleOutcome,
  transitionApplyLifecycle,
  unwindStaleApplyingLifecycle,
} from '../document-action-plan.state-machine';
import { resolveEffectiveDocumentType } from '../document-extraction-lifecycle.util';
import { appendExtractionActionAudit } from '../document-content-cache.util';
import { logRecoveryAction } from '../document-extraction-recovery.util';
import {
  isDownstreamTrackedAction,
  probeDownstreamForAction,
} from './document-intake-downstream.util';
import {
  readActionRecoveryCount,
  readActionRecoveryDeadLetterAt,
  withActionRecoveryDeadLetter,
  withIncrementedActionRecoveryCount,
} from './document-intake-action-recovery.util';
import type { DocumentIntakeRecoveryResult } from './document-intake-reconciliation.types';

type RecoveryExtractionRow = {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  status: string;
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
  confirmedData: unknown;
  plausibility: unknown;
  sourceFileUrl?: string | null;
  objectKey?: string | null;
  appliedAt?: Date | null;
  updatedAt: Date;
};

@Injectable()
export class DocumentIntakeActionRecoveryService {
  private readonly logger = new Logger(DocumentIntakeActionRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: DocumentActionOrchestratorService,
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
  ) {}

  async recoverStuckApplyingCandidates(options?: {
    dryRun?: boolean;
    limit?: number;
    olderThan?: Date;
  }): Promise<DocumentIntakeRecoveryResult[]> {
    const olderThan =
      options?.olderThan ?? new Date(Date.now() - this.config.staleApplyingThresholdMs);
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PARTIALLY_APPLIED'] },
        appliedAt: null,
        updatedAt: { lt: olderThan },
        confirmedData: { not: Prisma.DbNull },
      },
      take: options?.limit ?? 10,
      orderBy: { updatedAt: 'asc' },
    });

    const results: DocumentIntakeRecoveryResult[] = [];
    for (const row of rows) {
      const lifecycle = readDocumentActionPlanState(row.plausibility).actionPlanApplyLifecycle;
      if (lifecycle?.status !== 'APPLYING') continue;
      results.push(await this.recoverExtraction(row as RecoveryExtractionRow, options?.dryRun ?? false));
    }
    return results;
  }

  async recoverExtraction(
    record: RecoveryExtractionRow,
    dryRun = false,
  ): Promise<DocumentIntakeRecoveryResult> {
    const extractionId = record.id;
    if (readActionRecoveryDeadLetterAt(record.plausibility)) {
      return {
        extractionId,
        action: 'SKIPPED_DEAD_LETTER',
        dryRun,
        success: false,
        message: 'Extraction is marked action-recovery dead letter',
      };
    }
    if (readActionRecoveryCount(record.plausibility) >= this.config.maxActionRecoveryAttempts) {
      if (!dryRun) {
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: extractionId },
          data: { plausibility: withActionRecoveryDeadLetter(record.plausibility) },
        });
      }
      return {
        extractionId,
        action: 'DEAD_LETTER',
        dryRun,
        success: false,
        message: 'Action recovery attempts exhausted',
        details: { attempts: readActionRecoveryCount(record.plausibility) },
      };
    }

    const state = readDocumentActionPlanState(record.plausibility);
    const lifecycle = state.actionPlanApplyLifecycle;
    if (lifecycle?.status === 'APPLYING') {
      const reconciled = await this.reconcileDownstreamExecution(record, dryRun);
      if (reconciled.finalized) {
        return {
          extractionId,
          action: 'FINALIZE_APPLIED',
          dryRun,
          success: true,
          message: 'Reconciled downstream success and finalized apply lifecycle',
          details: reconciled,
        };
      }

      if (!dryRun) {
        const unwound = unwindStaleApplyingLifecycle(lifecycle, 'stale_apply_recovery');
        const plausibility = storeDocumentActionPlanApplyLifecycle(record.plausibility, unwound);
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: extractionId },
          data: { plausibility: plausibility as Prisma.InputJsonValue },
        });
        record = { ...record, plausibility };
      }

      if (dryRun) {
        return {
          extractionId,
          action: 'UNWIND_STALE_APPLYING',
          dryRun,
          success: true,
          message: 'Would unwind stale APPLYING and retry missing actions',
          details: reconciled,
        };
      }
    }

    const applyDocumentType = resolveEffectiveDocumentType(record);
    if (!applyDocumentType || !record.confirmedData) {
      return {
        extractionId,
        action: 'NO_OP',
        dryRun,
        success: false,
        message: 'Missing document type or confirmed data',
      };
    }

    if (dryRun) {
      return {
        extractionId,
        action: 'RETRY_MISSING_ACTIONS',
        dryRun,
        success: true,
        message: 'Would retry missing document actions',
      };
    }

    try {
      const sourceFileUrl =
        record.sourceFileUrl ??
        (record.objectKey ? `storage://${record.objectKey}` : null);
      const confirmedData = record.confirmedData as Record<string, unknown>;
      const applyResult = await this.orchestrator.executeConfirmedPlan({
        extractionId,
        organizationId: record.organizationId,
        vehicleId: record.vehicleId,
        documentType: applyDocumentType,
        sourceFileUrl,
        confirmedData,
        plausibility: record.plausibility,
      });

      const extractionStatus = applyResult.applyLifecycle
        ? mapApplyLifecycleToExtractionStatus(applyResult.applyLifecycle.status)
        : 'APPLIED';

      const latest = await this.prisma.vehicleDocumentExtraction.findUnique({
        where: { id: extractionId },
        select: { plausibility: true },
      });

      await this.prisma.vehicleDocumentExtraction.updateMany({
        where: { id: extractionId, status: { in: ['CONFIRMED', 'PARTIALLY_APPLIED'] } },
        data: {
          status: extractionStatus,
          appliedAt: new Date(),
          processingStage: 'APPLY',
          processingCompletedAt: new Date(),
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
          plausibility: withIncrementedActionRecoveryCount(
            appendExtractionActionAudit(latest?.plausibility ?? record.plausibility, {
              action: 'action_recovery',
              at: new Date().toISOString(),
              userId: null,
              details: { applyLifecycleStatus: applyResult.applyLifecycle?.status ?? null },
            }),
          ),
          ...(applyResult.serviceEventId ? { serviceEventId: applyResult.serviceEventId } : {}),
        },
      });

      logRecoveryAction(this.logger, 'recovered document action apply', extractionId, {
        applyLifecycle: applyResult.applyLifecycle?.status,
      });

      return {
        extractionId,
        action: 'RETRY_MISSING_ACTIONS',
        dryRun,
        success: true,
        message: 'Retried missing document actions',
        details: { applyLifecycle: applyResult.applyLifecycle?.status ?? null },
      };
    } catch (error) {
      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          plausibility: withIncrementedActionRecoveryCount(record.plausibility) as Prisma.InputJsonValue,
          errorPhase: 'APPLY',
          errorCode: 'APPLY_FAILED',
          errorMessage: ((error as Error).message ?? 'Action recovery failed').slice(0, 500),
        },
      });
      return {
        extractionId,
        action: 'RETRY_MISSING_ACTIONS',
        dryRun,
        success: false,
        message: (error as Error).message ?? 'Action recovery failed',
      };
    }
  }

  private async reconcileDownstreamExecution(
    record: RecoveryExtractionRow,
    dryRun: boolean,
  ): Promise<{
    finalized: boolean;
    reconciledActionIndices: number[];
    execution?: DocumentActionPlanExecution;
  }> {
    const state = readDocumentActionPlanState(record.plausibility);
    const plan = state.actionPlan;
    if (!plan) {
      return { finalized: false, reconciledActionIndices: [] };
    }

    const priorExecution = state.actionPlanExecution;
    const recordsByIndex = new Map(
      (priorExecution?.actions ?? []).map((row) => [row.actionIndex, row]),
    );
    const reconciledActionIndices: number[] = [];

    for (const action of plan.actions) {
      if (!isDownstreamTrackedAction(action.semanticAction)) continue;
      const actionIndex = action.sequence - 1;
      const prior = recordsByIndex.get(actionIndex);
      if (prior?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) continue;

      const idempotencyKey =
        prior?.idempotencyKey ??
        buildActionIdempotencyKey({
          extractionId: record.id,
          planVersion: plan.planVersion,
          fingerprint: plan.fingerprint,
          sequence: action.sequence,
          semanticAction: action.semanticAction,
        });

      const probe = await probeDownstreamForAction(
        this.prisma,
        record,
        action.semanticAction,
        idempotencyKey,
      );
      if (!probe.found) continue;

      reconciledActionIndices.push(actionIndex);
      recordsByIndex.set(actionIndex, {
        actionIndex,
        semanticAction: action.semanticAction,
        requirement: action.requirement,
        idempotencyKey,
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: probe.entityType ?? null,
        resultEntityId: probe.entityId ?? null,
        output: {
          reconciledFromDownstream: true,
          documentActionIdempotencyKey: idempotencyKey,
        },
        completedAt: new Date().toISOString(),
      });
    }

    if (reconciledActionIndices.length === 0) {
      return { finalized: false, reconciledActionIndices };
    }

    const execution: DocumentActionPlanExecution = {
      planId: plan.planId,
      planVersion: plan.planVersion,
      fingerprint: plan.fingerprint,
      status: priorExecution?.status ?? 'PARTIALLY_COMPLETED',
      actions: [...recordsByIndex.values()].sort((a, b) => a.actionIndex - b.actionIndex),
      startedAt: priorExecution?.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const requiredActions = plan.actions.filter(
      (row) => row.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
    );
    const allRequiredSucceeded = requiredActions.every((row) => {
      const actionRecord = recordsByIndex.get(row.sequence - 1);
      return actionRecord?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED;
    });

    if (!allRequiredSucceeded) {
      if (!dryRun) {
        const plausibility = storeDocumentActionPlanExecution(record.plausibility, execution);
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: record.id },
          data: { plausibility: plausibility as Prisma.InputJsonValue },
        });
      }
      return { finalized: false, reconciledActionIndices, execution };
    }

    const outcome = resolveApplyLifecycleOutcome(execution);
    if (!dryRun) {
      const lifecycle = transitionApplyLifecycle(state.actionPlanApplyLifecycle, outcome.lifecycleStatus, {
        applyOutcome: outcome.applyOutcome,
        failedActionIndices: outcome.failedActionIndices,
        warningActionIndices: outcome.warningActionIndices,
      });
      const extractionStatus = mapApplyLifecycleToExtractionStatus(lifecycle.status);
      let plausibility = storeDocumentActionPlanExecution(record.plausibility, {
        ...execution,
        status: 'COMPLETED',
      });
      plausibility = storeDocumentActionPlanApplyLifecycle(plausibility, lifecycle);
      plausibility = appendExtractionActionAudit(plausibility, {
        action: 'action_recovery_reconcile',
        at: new Date().toISOString(),
        userId: null,
        details: { reconciledActionIndices },
      });

      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: record.id },
        data: {
          status: extractionStatus,
          appliedAt: new Date(),
          processingStage: 'APPLY',
          processingCompletedAt: new Date(),
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
          plausibility: withIncrementedActionRecoveryCount(plausibility) as Prisma.InputJsonValue,
        },
      });
    }

    return { finalized: true, reconciledActionIndices, execution };
  }
}
