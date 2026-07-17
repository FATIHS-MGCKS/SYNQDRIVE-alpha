import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { ArchiveDocumentActionExecutor } from './executors/archive-document-action.executor';
import { LinkEntityDocumentActionExecutor } from './executors/link-entity-document-action.executor';
import {
  assertExecutableActionPlan,
  buildDocumentActionPlan,
} from './document-action-plan.builder';
import {
  buildActionIdempotencyKey,
  type BuildDocumentActionPlanInput,
  type DocumentActionPlan,
} from './document-action-plan.types';
import {
  readDocumentActionPlanState,
  storeDocumentActionPlan,
  storeDocumentActionPlanExecution,
} from './document-action-plan.store';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_PLAN_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
  type DocumentActionExecutionRecord,
  type DocumentActionPlanExecution,
} from './document-action.types';
import {
  DocumentActionBusinessError,
  DocumentActionPlanError,
  DocumentActionTechnicalError,
  DOCUMENT_ACTION_ERROR_CODES,
  isDocumentActionError,
} from './document-action.errors';
import type { ApplyResult } from './document-extraction-apply.service';
import { isArchiveDocumentType } from './document-archive-extraction.rules';

export type ExecuteDocumentActionPlanInput = {
  extractionId: string;
  organizationId: string | null;
  vehicleId: string;
  documentType: string;
  confirmedData: Record<string, unknown>;
  sourceFileUrl: string | null;
  confirmedById?: string | null;
  plausibilityChecks?: BuildDocumentActionPlanInput['plausibilityChecks'];
  planContext?: Record<string, unknown>;
  plausibility?: unknown;
};

@Injectable()
export class DocumentActionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(DocumentActionOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DocumentActionExecutorRegistry,
    private readonly archiveExecutor: ArchiveDocumentActionExecutor,
    private readonly linkExecutor: LinkEntityDocumentActionExecutor,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.archiveExecutor);
    this.registry.register(this.linkExecutor);
  }

  supportsExecutorPath(documentType: string): boolean {
    return isArchiveDocumentType(documentType);
  }

  async prepareConfirmedPlan(input: ExecuteDocumentActionPlanInput): Promise<DocumentActionPlan> {
    const plan = buildDocumentActionPlan({
      extractionId: input.extractionId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      documentType: input.documentType,
      confirmedData: input.confirmedData,
      plausibilityChecks: input.plausibilityChecks,
      confirmedById: input.confirmedById,
      planContext: input.planContext,
    });

    assertExecutableActionPlan(plan);

    const plausibilityWithPlan = storeDocumentActionPlan(input.plausibility, plan);
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: plausibilityWithPlan as Prisma.InputJsonValue,
      },
    });

    return plan;
  }

  async executeConfirmedPlan(input: ExecuteDocumentActionPlanInput): Promise<ApplyResult> {
    const existingState = readDocumentActionPlanState(input.plausibility);
    let plan = existingState.actionPlan;

    if (!plan) {
      plan = await this.prepareConfirmedPlan(input);
    } else {
      this.validateStoredPlan(plan, input);
      assertExecutableActionPlan(plan);
    }

    if (
      existingState.actionPlanExecution?.status === 'COMPLETED' &&
      existingState.actionPlanExecution.fingerprint === plan.fingerprint
    ) {
      return this.toApplyResult(plan, existingState.actionPlanExecution);
    }

    const execution = await this.executePlanActions(input, plan, existingState.actionPlanExecution);
    const plausibilityWithExecution = storeDocumentActionPlanExecution(
      storeDocumentActionPlan(input.plausibility, {
        ...plan,
        status:
          execution.status === 'COMPLETED'
            ? DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED
            : DOCUMENT_ACTION_PLAN_STATUSES.FAILED,
      }),
      execution,
    );

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: plausibilityWithExecution as Prisma.InputJsonValue,
      },
    });

    if (execution.status === 'FAILED') {
      const failedRequired = execution.actions.find(
        (row) =>
          row.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED &&
          row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      );
      throw new DocumentActionTechnicalError(
        DOCUMENT_ACTION_ERROR_CODES.REQUIRED_ACTION_FAILED,
        failedRequired?.errorMessage ?? 'Document action plan execution failed',
        { execution },
      );
    }

    return this.toApplyResult(plan, execution);
  }

  private validateStoredPlan(plan: DocumentActionPlan, input: ExecuteDocumentActionPlanInput): void {
    if (plan.planVersion !== 1) {
      throw new DocumentActionPlanError(
        DOCUMENT_ACTION_ERROR_CODES.PLAN_VERSION_MISMATCH,
        `Unsupported action plan version ${plan.planVersion}`,
        { expected: 1, actual: plan.planVersion },
      );
    }

    const fingerprint = buildDocumentActionPlan({
      extractionId: input.extractionId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      documentType: input.documentType,
      confirmedData: input.confirmedData,
      plausibilityChecks: input.plausibilityChecks,
      confirmedById: input.confirmedById,
      planContext: input.planContext,
    }).fingerprint;

    if (plan.fingerprint !== fingerprint) {
      throw new DocumentActionPlanError(
        DOCUMENT_ACTION_ERROR_CODES.PLAN_FINGERPRINT_MISMATCH,
        'Confirmed data no longer matches the stored action plan fingerprint',
        { planId: plan.planId, storedFingerprint: plan.fingerprint, currentFingerprint: fingerprint },
      );
    }
  }

  private async executePlanActions(
    input: ExecuteDocumentActionPlanInput,
    plan: DocumentActionPlan,
    priorExecution: DocumentActionPlanExecution | null | undefined,
  ): Promise<DocumentActionPlanExecution> {
    const startedAt = new Date().toISOString();
    const priorByIndex = new Map(
      (priorExecution?.actions ?? []).map((row) => [row.actionIndex, row]),
    );
    const records: DocumentActionExecutionRecord[] = [];
    let failed = false;

    const orderedActions = [...plan.actions].sort((a, b) => {
      const requirementRank = (value: string) =>
        value === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED
          ? 0
          : value === DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL
            ? 1
            : 2;
      const rankDiff = requirementRank(a.requirement) - requirementRank(b.requirement);
      return rankDiff !== 0 ? rankDiff : a.sequence - b.sequence;
    });

    for (const action of orderedActions) {
      const actionIndex = action.sequence - 1;
      const prior = priorByIndex.get(actionIndex);
      const idempotencyKey = buildActionIdempotencyKey({
        extractionId: input.extractionId,
        planVersion: plan.planVersion,
        fingerprint: plan.fingerprint,
        sequence: action.sequence,
        semanticAction: action.semanticAction,
      });

      if (
        prior?.idempotencyKey === idempotencyKey &&
        prior.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED
      ) {
        records.push(prior);
        continue;
      }

      if (prior?.idempotencyKey === idempotencyKey && prior.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED) {
        records.push(prior);
        continue;
      }

      if (action.requirement === DOCUMENT_ACTION_REQUIREMENTS.INFORMATIONAL) {
        records.push({
          actionIndex,
          semanticAction: action.semanticAction,
          requirement: action.requirement,
          idempotencyKey,
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED,
          output: { informational: true },
          completedAt: new Date().toISOString(),
        });
        continue;
      }

      if (!this.registry.has(action.semanticAction)) {
        if (action.requirement === DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL) {
          records.push({
            actionIndex,
            semanticAction: action.semanticAction,
            requirement: action.requirement,
            idempotencyKey,
            status: DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED,
            output: { reason: 'EXECUTOR_NOT_REGISTERED' },
            completedAt: new Date().toISOString(),
          });
          continue;
        }

        const record: DocumentActionExecutionRecord = {
          actionIndex,
          semanticAction: action.semanticAction,
          requirement: action.requirement,
          idempotencyKey,
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
          errorCode: DOCUMENT_ACTION_ERROR_CODES.EXECUTOR_NOT_FOUND,
          errorMessage: `No executor registered for ${action.semanticAction}`,
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        records.push(record);
        failed = true;
        break;
      }

      const attemptedAt = new Date().toISOString();
      try {
        const executor = this.registry.get(action.semanticAction);
        const result = await executor.execute({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          extractionId: input.extractionId,
          documentType: input.documentType,
          confirmedData: input.confirmedData,
          sourceFileUrl: input.sourceFileUrl,
          plan,
          action,
          actionIndex,
          idempotencyKey,
          priorResult: prior,
        });

        const record: DocumentActionExecutionRecord = {
          actionIndex,
          semanticAction: action.semanticAction,
          requirement: action.requirement,
          idempotencyKey,
          status: result.status,
          resultEntityType: result.resultEntityType ?? null,
          resultEntityId: result.resultEntityId ?? null,
          output: result.output,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          attemptedAt,
          completedAt: new Date().toISOString(),
        };
        records.push(record);

        if (
          result.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED &&
          action.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED
        ) {
          failed = true;
          break;
        }
      } catch (error) {
        const record: DocumentActionExecutionRecord = {
          actionIndex,
          semanticAction: action.semanticAction,
          requirement: action.requirement,
          idempotencyKey,
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
          errorCode: isDocumentActionError(error)
            ? error.code
            : DOCUMENT_ACTION_ERROR_CODES.TECHNICAL_FAILURE,
          errorMessage: error instanceof Error ? error.message : String(error),
          attemptedAt,
          completedAt: new Date().toISOString(),
        };
        records.push(record);

        if (action.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED) {
          failed = true;
          break;
        }

        if (error instanceof DocumentActionBusinessError) {
          this.logger.warn(
            `Optional action ${action.semanticAction} failed for extraction ${input.extractionId}: ${error.message}`,
          );
        }
      }
    }

    return {
      planId: plan.planId,
      planVersion: plan.planVersion,
      fingerprint: plan.fingerprint,
      status: failed ? 'FAILED' : 'COMPLETED',
      actions: records,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  private toApplyResult(plan: DocumentActionPlan, execution: DocumentActionPlanExecution): ApplyResult {
    const archiveAction = execution.actions.find(
      (row) => row.semanticAction === 'ARCHIVE_DOCUMENT' && row.status === 'SUCCEEDED',
    );
    const linkAction = execution.actions.find(
      (row) => row.semanticAction === 'SUGGEST_ENTITY_LINK' && row.status === 'SUCCEEDED',
    );

    return {
      detail: {
        actionPlanId: plan.planId,
        planVersion: plan.planVersion,
        fingerprint: plan.fingerprint,
        planOutcome: plan.planOutcome,
        archived: archiveAction?.output?.archived === true,
        archiveSubtype: archiveAction?.output?.archiveSubtype ?? plan.metadata?.archiveSubtype,
        entityLinkSuggestions:
          linkAction?.output?.suggestions ?? plan.metadata?.entityLinkSuggestions ?? [],
        acceptedEntityLinks: linkAction?.output?.links ?? [],
        deadlineSuggestions: plan.metadata?.deadlineSuggestions ?? [],
        referenceNumber: archiveAction?.output?.referenceNumber ?? null,
        extractionId: plan.extractionId,
        execution,
      },
    };
  }
}
