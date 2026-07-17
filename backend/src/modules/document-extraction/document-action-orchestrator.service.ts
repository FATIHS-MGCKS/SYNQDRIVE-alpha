import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { ArchiveDocumentActionExecutor } from './executors/archive-document-action.executor';
import { LinkEntityDocumentActionExecutor } from './executors/link-entity-document-action.executor';
import { CreateFineDocumentActionExecutor } from './executors/create-fine-document-action.executor';
import {
  CreateCreditNoteDocumentActionExecutor,
  CreateInvoiceDocumentActionExecutor,
} from './executors/create-invoice-document-action.executor';
import {
  CreateComplianceServiceEventDocumentActionExecutor,
  CreateServiceEventDocumentActionExecutor,
} from './executors/create-service-document-action.executor';
import {
  RefreshVehicleServiceHistoryDocumentActionExecutor,
  UpdateVehicleComplianceDocumentActionExecutor,
} from './executors/update-vehicle-from-extraction-document-action.executor';
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
  storeDocumentActionPlanApplyLifecycle,
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
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES,
  isSuccessfulApplyLifecycle,
  listRetryableFailedActionIndices,
  mapApplyLifecycleToExtractionStatus,
  resolveApplyLifecycleOutcome,
  transitionApplyLifecycle,
  type DocumentActionPlanApplyLifecycle,
} from './document-action-plan.state-machine';
import {
  isOptionalActionDisabled,
  readActionPlanPreferences,
} from './document-action-plan-preferences.util';
import {
  DOCUMENT_ACTION_ERROR_CODES,
  DocumentActionBusinessError,
  DocumentActionPlanError,
  DocumentActionTechnicalError,
  isDocumentActionError,
} from './document-action.errors';
import type { ApplyResult } from './document-extraction-apply.service';
import { isArchiveDocumentType } from './document-archive-extraction.rules';
import { isFineDocumentType, readFineReportNumber } from './document-fine-extraction.rules';
import {
  isInvoiceDocumentType,
  readInvoiceNumber,
  readSupplier,
} from './document-invoice-extraction.rules';
import { isInspectionDocumentType } from './document-inspection-extraction.rules';
import { isServiceDocumentType } from './document-service-extraction.rules';
import {
  buildDamageCreatePayload,
  findDuplicateDamageCandidate,
  isDamageDocumentType,
  readDamageAreas,
} from './document-damage-extraction.rules';
import { resolveConfirmedValuesForActionPlan } from './document-field-provenance.util';
import { isTechnicalDocumentType } from './document-action-planner.technical-rules';
import { DocumentFollowUpSuggestionService } from './document-follow-up-suggestion.service';
import {
  CreateDamageDraftDocumentActionExecutor,
  CreateDamageRecordDocumentActionExecutor,
  LinkExistingDamageDocumentActionExecutor,
} from './executors/create-damage-document-action.executor';
import {
  ApplyBatteryMeasurementDocumentActionExecutor,
  ApplyBrakeMeasurementDocumentActionExecutor,
  ApplyTireMeasurementDocumentActionExecutor,
} from './executors/apply-technical-document-action.executor';

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

export type ExecuteDocumentActionPlanResult = ApplyResult & {
  applyLifecycle?: DocumentActionPlanApplyLifecycle;
};

@Injectable()
export class DocumentActionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(DocumentActionOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DocumentActionExecutorRegistry,
    private readonly archiveExecutor: ArchiveDocumentActionExecutor,
    private readonly linkExecutor: LinkEntityDocumentActionExecutor,
    private readonly createFineExecutor: CreateFineDocumentActionExecutor,
    private readonly createInvoiceExecutor: CreateInvoiceDocumentActionExecutor,
    private readonly createCreditNoteExecutor: CreateCreditNoteDocumentActionExecutor,
    private readonly createServiceEventExecutor: CreateServiceEventDocumentActionExecutor,
    private readonly createComplianceServiceEventExecutor: CreateComplianceServiceEventDocumentActionExecutor,
    private readonly updateVehicleComplianceExecutor: UpdateVehicleComplianceDocumentActionExecutor,
    private readonly refreshVehicleServiceHistoryExecutor: RefreshVehicleServiceHistoryDocumentActionExecutor,
    private readonly createDamageDraftExecutor: CreateDamageDraftDocumentActionExecutor,
    private readonly createDamageRecordExecutor: CreateDamageRecordDocumentActionExecutor,
    private readonly linkExistingDamageExecutor: LinkExistingDamageDocumentActionExecutor,
    private readonly applyTireMeasurementExecutor: ApplyTireMeasurementDocumentActionExecutor,
    private readonly applyBrakeMeasurementExecutor: ApplyBrakeMeasurementDocumentActionExecutor,
    private readonly applyBatteryMeasurementExecutor: ApplyBatteryMeasurementDocumentActionExecutor,
    private readonly followUpSuggestionService: DocumentFollowUpSuggestionService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.archiveExecutor);
    this.registry.register(this.linkExecutor);
    this.registry.register(this.createFineExecutor);
    this.registry.register(this.createInvoiceExecutor);
    this.registry.register(this.createCreditNoteExecutor);
    this.registry.register(this.createServiceEventExecutor);
    this.registry.register(this.createComplianceServiceEventExecutor);
    this.registry.register(this.updateVehicleComplianceExecutor);
    this.registry.register(this.refreshVehicleServiceHistoryExecutor);
    this.registry.register(this.createDamageDraftExecutor);
    this.registry.register(this.createDamageRecordExecutor);
    this.registry.register(this.linkExistingDamageExecutor);
    this.registry.register(this.applyTireMeasurementExecutor);
    this.registry.register(this.applyBrakeMeasurementExecutor);
    this.registry.register(this.applyBatteryMeasurementExecutor);
  }

  supportsExecutorPath(documentType: string): boolean {
    return (
      isArchiveDocumentType(documentType) ||
      isFineDocumentType(documentType) ||
      isInvoiceDocumentType(documentType) ||
      isServiceDocumentType(documentType) ||
      isInspectionDocumentType(documentType) ||
      isDamageDocumentType(documentType) ||
      isTechnicalDocumentType(documentType)
    );
  }

  async buildPreviewPlan(input: ExecuteDocumentActionPlanInput): Promise<DocumentActionPlan> {
    const planContext = await this.buildPlanContext(input);
    return buildDocumentActionPlan({
      extractionId: input.extractionId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      documentType: input.documentType,
      confirmedData: input.confirmedData,
      plausibilityChecks: input.plausibilityChecks,
      confirmedById: input.confirmedById,
      planContext,
    });
  }

  async prepareConfirmedPlan(input: ExecuteDocumentActionPlanInput): Promise<DocumentActionPlan> {
    const planContext = await this.buildPlanContext(input);
    const plan = buildDocumentActionPlan({
      extractionId: input.extractionId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      documentType: input.documentType,
      confirmedData: input.confirmedData,
      plausibilityChecks: input.plausibilityChecks,
      confirmedById: input.confirmedById,
      planContext,
    });

    assertExecutableActionPlan(plan);

    const lifecycle = transitionApplyLifecycle(
      readDocumentActionPlanState(input.plausibility).actionPlanApplyLifecycle,
      DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW,
    );
    const plausibilityWithPlan = storeDocumentActionPlanApplyLifecycle(
      storeDocumentActionPlan(input.plausibility, plan),
      lifecycle,
    );
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: plausibilityWithPlan as Prisma.InputJsonValue,
      },
    });

    const record = await this.prisma.vehicleDocumentExtraction.findUniqueOrThrow({
      where: { id: input.extractionId },
    });
    await this.followUpSuggestionService.syncForActionPlan({
      record,
      plan,
      confirmedData: resolveConfirmedValuesForActionPlan(input.confirmedData),
    });

    return plan;
  }

  async executeConfirmedPlan(input: ExecuteDocumentActionPlanInput): Promise<ExecuteDocumentActionPlanResult> {
    const existingState = readDocumentActionPlanState(input.plausibility);
    let plan = existingState.actionPlan;
    let lifecycle = existingState.actionPlanApplyLifecycle;

    if (!plan) {
      plan = await this.prepareConfirmedPlan(input);
      lifecycle = transitionApplyLifecycle(
        null,
        DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW,
      );
    } else {
      await this.validateStoredPlan(plan, input);
      assertExecutableActionPlan(plan, lifecycle);
    }

    if (
      lifecycle &&
      isSuccessfulApplyLifecycle(lifecycle.status) &&
      existingState.actionPlanExecution?.status === 'COMPLETED' &&
      existingState.actionPlanExecution.fingerprint === plan.fingerprint
    ) {
      return {
        ...this.toApplyResult(plan, existingState.actionPlanExecution),
        applyLifecycle: lifecycle,
      };
    }

    if (
      lifecycle?.status === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_FOR_ACTION_PREVIEW
    ) {
      lifecycle = transitionApplyLifecycle(
        lifecycle,
        DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_TO_APPLY,
      );
    }

    lifecycle = transitionApplyLifecycle(
      lifecycle,
      DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
    );

    const applyingPlausibility = storeDocumentActionPlanApplyLifecycle(
      storeDocumentActionPlan(input.plausibility, {
        ...plan,
        status: DOCUMENT_ACTION_PLAN_STATUSES.EXECUTING,
      }),
      lifecycle,
    );
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: applyingPlausibility as Prisma.InputJsonValue,
      },
    });

    const execution = await this.executePlanActions(
      input,
      plan,
      existingState.actionPlanExecution,
    );
    const outcome = resolveApplyLifecycleOutcome(execution);
    lifecycle = transitionApplyLifecycle(lifecycle, outcome.lifecycleStatus, {
      applyOutcome: outcome.applyOutcome,
      failedActionIndices: outcome.failedActionIndices,
      warningActionIndices: outcome.warningActionIndices,
    });

    const planStatus =
      outcome.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED
        ? DOCUMENT_ACTION_PLAN_STATUSES.FAILED
        : outcome.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED ||
            outcome.lifecycleStatus ===
              DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED_WITH_WARNINGS
          ? DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED
          : DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED;

    const plausibilityWithExecution = storeDocumentActionPlanApplyLifecycle(
      storeDocumentActionPlanExecution(
        storeDocumentActionPlan(input.plausibility, {
          ...plan,
          status: planStatus,
        }),
        execution,
      ),
      lifecycle,
    );

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: plausibilityWithExecution as Prisma.InputJsonValue,
      },
    });

    if (outcome.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED) {
      const failedRequired = execution.actions.find(
        (row) =>
          row.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED &&
          row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      );
      throw new DocumentActionTechnicalError(
        DOCUMENT_ACTION_ERROR_CODES.REQUIRED_ACTION_FAILED,
        failedRequired?.errorMessage ?? 'Document action plan execution failed',
        { execution, applyLifecycle: lifecycle },
      );
    }

    return {
      ...this.toApplyResult(plan, execution),
      applyLifecycle: lifecycle,
    };
  }

  async retryFailedApplyActions(
    input: ExecuteDocumentActionPlanInput,
  ): Promise<ExecuteDocumentActionPlanResult> {
    const existingState = readDocumentActionPlanState(input.plausibility);
    const plan = existingState.actionPlan;
    const priorExecution = existingState.actionPlanExecution;
    let lifecycle = existingState.actionPlanApplyLifecycle;

    if (!plan || !priorExecution) {
      throw new DocumentActionPlanError(
        DOCUMENT_ACTION_ERROR_CODES.PLAN_NOT_CONFIRMED,
        'No stored action plan execution available for retry',
      );
    }

    const retryable = listRetryableFailedActionIndices(priorExecution.actions);
    if (retryable.length === 0) {
      throw new DocumentActionBusinessError(
        DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        'No failed actions are eligible for retry',
      );
    }

    await this.validateStoredPlan(plan, input);
    assertExecutableActionPlan(plan, lifecycle);

    lifecycle = transitionApplyLifecycle(
      lifecycle,
      DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING,
    );

    const applyingPlausibility = storeDocumentActionPlanApplyLifecycle(
      storeDocumentActionPlan(input.plausibility, {
        ...plan,
        status: DOCUMENT_ACTION_PLAN_STATUSES.EXECUTING,
      }),
      lifecycle,
    );
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: applyingPlausibility as Prisma.InputJsonValue,
      },
    });

    const execution = await this.executePlanActions(input, plan, priorExecution);
    const outcome = resolveApplyLifecycleOutcome(execution);
    lifecycle = transitionApplyLifecycle(lifecycle, outcome.lifecycleStatus, {
      applyOutcome: outcome.applyOutcome,
      failedActionIndices: outcome.failedActionIndices,
      warningActionIndices: outcome.warningActionIndices,
    });

    const planStatus =
      outcome.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED
        ? DOCUMENT_ACTION_PLAN_STATUSES.FAILED
        : DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED;

    const plausibilityWithExecution = storeDocumentActionPlanApplyLifecycle(
      storeDocumentActionPlanExecution(
        storeDocumentActionPlan(input.plausibility, {
          ...plan,
          status: planStatus,
        }),
        execution,
      ),
      lifecycle,
    );

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.extractionId },
      data: {
        plausibility: plausibilityWithExecution as Prisma.InputJsonValue,
      },
    });

    if (outcome.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED) {
      const failedRequired = execution.actions.find(
        (row) =>
          row.requirement === DOCUMENT_ACTION_REQUIREMENTS.REQUIRED &&
          row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      );
      throw new DocumentActionTechnicalError(
        DOCUMENT_ACTION_ERROR_CODES.REQUIRED_ACTION_FAILED,
        failedRequired?.errorMessage ?? 'Document action plan retry failed',
        { execution, applyLifecycle: lifecycle },
      );
    }

    return {
      ...this.toApplyResult(plan, execution),
      applyLifecycle: lifecycle,
    };
  }

  private async validateStoredPlan(
    plan: DocumentActionPlan,
    input: ExecuteDocumentActionPlanInput,
  ): Promise<void> {
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
      planContext: await this.buildPlanContext(input),
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

      const preferences = readActionPlanPreferences(input.confirmedData);
      if (isOptionalActionDisabled(action.semanticAction, action.requirement, preferences)) {
        records.push({
          actionIndex,
          semanticAction: action.semanticAction,
          requirement: action.requirement,
          idempotencyKey,
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED,
          output: { disabledByUser: true },
          completedAt: new Date().toISOString(),
        });
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
      status: this.resolveExecutionStatus(records, failed),
      actions: records,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  private resolveExecutionStatus(
    records: DocumentActionExecutionRecord[],
    requiredFailed: boolean,
  ): DocumentActionPlanExecution['status'] {
    if (requiredFailed) {
      return 'FAILED';
    }
    const optionalFailed = records.some(
      (row) =>
        row.requirement === DOCUMENT_ACTION_REQUIREMENTS.OPTIONAL &&
        row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
    );
    return optionalFailed ? 'PARTIALLY_COMPLETED' : 'COMPLETED';
  }

  private toApplyResult(plan: DocumentActionPlan, execution: DocumentActionPlanExecution): ApplyResult {
    const archiveAction = execution.actions.find(
      (row) => row.semanticAction === 'ARCHIVE_DOCUMENT' && row.status === 'SUCCEEDED',
    );
    const linkAction = execution.actions.find(
      (row) => row.semanticAction === 'SUGGEST_ENTITY_LINK' && row.status === 'SUCCEEDED',
    );
    const fineAction = execution.actions.find(
      (row) => row.semanticAction === 'CREATE_FINE_DRAFT' && row.status === 'SUCCEEDED',
    );
    const invoiceAction = execution.actions.find(
      (row) =>
        (row.semanticAction === 'CREATE_INVOICE_DRAFT' ||
          row.semanticAction === 'CREATE_CREDIT_NOTE_DRAFT') &&
        row.status === 'SUCCEEDED',
    );
    const serviceEventAction = execution.actions.find(
      (row) =>
        (row.semanticAction === 'CREATE_SERVICE_EVENT' ||
          row.semanticAction === 'CREATE_COMPLIANCE_SERVICE_EVENT') &&
        row.status === 'SUCCEEDED',
    );
    const serviceEventId =
      (serviceEventAction?.resultEntityId as string | undefined) ??
      (serviceEventAction?.output?.serviceEventId as string | undefined) ??
      null;
    const damageRecordAction = execution.actions.find(
      (row) => row.semanticAction === 'CREATE_DAMAGE_RECORD' && row.status === 'SUCCEEDED',
    );
    const damageDraftAction = execution.actions.find(
      (row) => row.semanticAction === 'CREATE_DAMAGE_DRAFT' && row.status === 'SUCCEEDED',
    );
    const linkDamageAction = execution.actions.find(
      (row) => row.semanticAction === 'LINK_EXISTING_DAMAGE' && row.status === 'SUCCEEDED',
    );
    const damageId =
      (damageRecordAction?.resultEntityId as string | undefined) ??
      (damageRecordAction?.output?.damageId as string | undefined) ??
      (linkDamageAction?.resultEntityId as string | undefined) ??
      (linkDamageAction?.output?.damageId as string | undefined) ??
      (damageDraftAction?.resultEntityId as string | undefined) ??
      (damageDraftAction?.output?.damageId as string | undefined) ??
      null;
    const tireAction = execution.actions.find(
      (row) => row.semanticAction === 'APPLY_TIRE_MEASUREMENT' && row.status === 'SUCCEEDED',
    );
    const brakeAction = execution.actions.find(
      (row) => row.semanticAction === 'APPLY_BRAKE_MEASUREMENT' && row.status === 'SUCCEEDED',
    );
    const batteryAction = execution.actions.find(
      (row) => row.semanticAction === 'APPLY_BATTERY_MEASUREMENT' && row.status === 'SUCCEEDED',
    );
    const tireMeasurementId =
      (tireAction?.resultEntityId as string | undefined) ??
      (tireAction?.output?.tireMeasurementId as string | undefined) ??
      null;
    const brakeServiceEventId =
      (brakeAction?.resultEntityId as string | undefined) ??
      (brakeAction?.output?.serviceEventId as string | undefined) ??
      null;
    const batteryServiceEventId =
      (batteryAction?.output?.serviceEventId as string | undefined) ?? null;

    return {
      serviceEventId: serviceEventId ?? brakeServiceEventId ?? batteryServiceEventId ?? null,
      detail: {
        actionPlanId: plan.planId,
        planVersion: plan.planVersion,
        fingerprint: plan.fingerprint,
        planOutcome: plan.planOutcome,
        archived: archiveAction?.output?.archived === true,
        archiveSubtype: archiveAction?.output?.archiveSubtype ?? plan.metadata?.archiveSubtype,
        fineId: fineAction?.resultEntityId ?? fineAction?.output?.fineId ?? null,
        fineStatus: fineAction?.output?.status ?? null,
        invoiceId: invoiceAction?.resultEntityId ?? invoiceAction?.output?.invoiceId ?? null,
        invoiceStatus: invoiceAction?.output?.status ?? null,
        invoiceDraft: invoiceAction?.output?.draft ?? null,
        isCreditNote: invoiceAction?.output?.isCreditNote ?? null,
        serviceEventId,
        serviceEventType: serviceEventAction?.output?.eventType ?? null,
        damageId,
        damageStatus:
          damageRecordAction?.output?.status ??
          damageDraftAction?.output?.status ??
          linkDamageAction?.output?.status ??
          null,
        damageDraft: damageDraftAction?.output?.draft ?? null,
        tireMeasurementId,
        tireMeasurementReused: tireAction?.output?.reused ?? null,
        brakeServiceEventId,
        brakeEvidenceIds: brakeAction?.output?.brakeEvidenceIds ?? null,
        batteryEvidenceIds: batteryAction?.output?.batteryEvidenceIds ?? null,
        batterySnapshotId: batteryAction?.output?.snapshotId ?? null,
        vehicleComplianceApplied:
          execution.actions.find(
            (row) =>
              row.semanticAction === 'UPDATE_VEHICLE_COMPLIANCE_DATES' &&
              row.status === 'SUCCEEDED',
          )?.output?.applied ?? null,
        vehicleServiceHistoryRefreshed:
          execution.actions.find(
            (row) =>
              row.semanticAction === 'REFRESH_VEHICLE_SERVICE_HISTORY' &&
              row.status === 'SUCCEEDED',
          )?.output?.applied ?? null,
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

  private async buildPlanContext(
    input: ExecuteDocumentActionPlanInput,
  ): Promise<Record<string, unknown>> {
    const base = input.planContext ?? {};
    if (!input.organizationId) {
      return base;
    }

    if (isDamageDocumentType(input.documentType)) {
      const existingDamages = await this.prisma.vehicleDamage.findMany({
        where: { vehicleId: input.vehicleId },
        select: {
          id: true,
          damageType: true,
          severity: true,
          description: true,
          locationLabel: true,
          createdAt: true,
        },
      });

      const candidateAreas = readDamageAreas(input.confirmedData);
      const payload = buildDamageCreatePayload(input.confirmedData);
      const duplicate =
        payload != null
          ? findDuplicateDamageCandidate(existingDamages, payload, candidateAreas)
          : null;

      return {
        ...base,
        existingDamages,
        duplicateDamageId: duplicate?.id ?? null,
      };
    }

    if (isFineDocumentType(input.documentType)) {
      const reportNumber = readFineReportNumber(input.confirmedData);
      if (!reportNumber) {
        return base;
      }

      const duplicateFine = await this.prisma.fine.findFirst({
        where: {
          organizationId: input.organizationId,
          fineNumber: reportNumber,
          documentExtractionId: { not: input.extractionId },
        },
        select: { id: true },
      });

      return {
        ...base,
        duplicateReferenceFineId: duplicateFine?.id ?? null,
      };
    }

    if (isInvoiceDocumentType(input.documentType)) {
      const invoiceNumber = readInvoiceNumber(input.confirmedData);
      const vendorName = readSupplier(input.confirmedData);
      if (!invoiceNumber) {
        return base;
      }

      let vendorId: string | null = null;
      if (vendorName) {
        const vendor = await this.prisma.vendor.findFirst({
          where: {
            organizationId: input.organizationId,
            name: { equals: vendorName, mode: 'insensitive' },
          },
          select: { id: true },
        });
        vendorId = vendor?.id ?? null;
      }

      if (!vendorId) {
        return base;
      }

      const duplicateInvoice = await this.prisma.orgInvoice.findFirst({
        where: {
          organizationId: input.organizationId,
          vendorId,
          invoiceNumberDisplay: invoiceNumber,
          documentExtractionId: { not: input.extractionId },
        },
        select: { id: true },
      });

      return {
        ...base,
        duplicateVendorInvoiceId: duplicateInvoice?.id ?? null,
      };
    }

    return base;
  }
}
