import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DataAuthorizationRevocationWorkflowStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { DataAuthorizationAuditOutboxRepository } from '../privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { buildAuditIdempotencyKey } from '../privacy-domain/audit-log/data-authorization-audit.constants';
import { DataAuthorizationAuditEventKind } from '@prisma/client';
import {
  REVOCATION_ORCHESTRATOR,
  REVOCATION_RETENTION_DECISION,
  REVOCATION_STEP_KEY,
  REVOCATION_STEP_PENDING_STATUS,
  REVOCATION_STEP_TARGET_STATUS,
  TERMINAL_REVOCATION_STATUSES,
  buildRevocationIdempotencyKey,
  computeRevocationBackoffMs,
  type RevocationStepKey,
} from './revocation-orchestrator.constants';
import { RevocationOrchestratorRepository } from './revocation-orchestrator.repository';
import { RevocationOrchestratorSteps } from './revocation-orchestrator.steps';
import { DataAuthMetricsService } from '../observability/data-auth-metrics.service';
import type {
  RevocationProcessResult,
  RevocationRequestResult,
  RevocationResumeInput,
  RevocationStepContext,
  RevocationWorkflowRequest,
} from './revocation-orchestrator.types';

const STEP_ORDER: RevocationStepKey[] = [
  REVOCATION_STEP_KEY.DENY_SWITCH,
  REVOCATION_STEP_KEY.STOP_INGESTION,
  REVOCATION_STEP_KEY.REVOKE_PROVIDER,
  REVOCATION_STEP_KEY.CANCEL_QUEUES,
  REVOCATION_STEP_KEY.NOTIFY_PARTNER,
  REVOCATION_STEP_KEY.RETENTION_DECISION,
  REVOCATION_STEP_KEY.SCHEDULE_DELETION,
  REVOCATION_STEP_KEY.VERIFY,
];

@Injectable()
export class RevocationOrchestratorService {
  private readonly logger = new Logger(RevocationOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RevocationOrchestratorRepository,
    private readonly steps: RevocationOrchestratorSteps,
    private readonly auditOutbox: DataAuthorizationAuditOutboxRepository,
    @Optional() private readonly dataAuthMetrics?: DataAuthMetricsService,
  ) {}

  /**
   * Entry point: create workflow (idempotent), run synchronous deny-switch, schedule async steps.
   */
  async requestRevocation(input: RevocationWorkflowRequest): Promise<RevocationRequestResult> {
    const idempotencyKey =
      input.idempotencyKey ??
      buildRevocationIdempotencyKey({
        organizationId: input.organizationId,
        triggerType: input.triggerType,
        entityId: input.entityId,
        mutationVersion: input.mutationVersion,
      });

    const existing = await this.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        workflowId: existing.id,
        status: existing.status,
        idempotentReplay: true,
        denySwitchActivated: existing.denySwitchActivatedAt != null,
      };
    }

    const correlationId = input.correlationId || randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const row = await this.repo.createInTransaction(tx, {
        ...input,
        correlationId,
        idempotencyKey,
      });

      await this.auditOutbox.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: buildAuditIdempotencyKey({
          eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
          organizationId: input.organizationId,
          correlationId: `${correlationId}:revocation-requested`,
        }),
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        correlationId,
        payload: {
          entityType: 'REVOCATION_WORKFLOW',
          entityId: row.id,
          eventType: 'REVOCATION_REQUESTED',
          newStatus: 'REVOCATION_REQUESTED',
          triggerType: input.triggerType,
          actorUserId: input.actorUserId ?? null,
        },
      });

      return row;
    });

    const denyResult = await this.executeStep(workflow.id, REVOCATION_STEP_KEY.DENY_SWITCH, true);
    if (denyResult.outcome === 'failed') {
      throw new Error(denyResult.errorMessage ?? 'deny_switch_failed');
    }

    const latest = await this.repo.findById(workflow.id);
    return {
      workflowId: workflow.id,
      status: latest?.status ?? DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      idempotentReplay: false,
      denySwitchActivated: true,
    };
  }

  async getWorkflow(orgId: string, workflowId: string) {
    const workflow = await this.repo.findById(workflowId, orgId);
    if (!workflow) throw new NotFoundException('Revocation workflow not found');
    const stepEvents = await this.repo.listStepEvents(workflowId, orgId);
    return { workflow, stepEvents };
  }

  async resumeWorkflow(input: RevocationResumeInput): Promise<RevocationProcessResult> {
    const workflow = await this.repo.findById(input.workflowId, input.organizationId);
    if (!workflow) throw new NotFoundException('Revocation workflow not found');

    if (TERMINAL_REVOCATION_STATUSES.has(workflow.status)) {
      if (workflow.status !== DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED) {
        return {
          workflowId: workflow.id,
          outcome: 'skipped',
          status: workflow.status,
        };
      }
    }

    const resumePatch: Prisma.DataAuthorizationRevocationWorkflowUpdateInput = {
      nextRetryAt: new Date(),
      failedAt: null,
      deadLetteredAt: null,
      failureReason: null,
      ...(input.resetAttempts ? { attempts: 0 } : {}),
      ...(input.retentionDecision ? { retentionDecision: input.retentionDecision } : {}),
    };

    if (workflow.status === DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED) {
      const completed = Array.isArray(workflow.completedSteps)
        ? (workflow.completedSteps as string[])
        : [];
      const lastStep = completed[completed.length - 1];
      const resumeStatus = lastStep
        ? REVOCATION_STEP_TARGET_STATUS[lastStep as keyof typeof REVOCATION_STEP_TARGET_STATUS]
        : DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE;
      resumePatch.status = resumeStatus;
    }

    await this.prisma.dataAuthorizationRevocationWorkflow.update({
      where: { id: workflow.id },
      data: resumePatch,
    });

    await this.auditOutbox.enqueue({
      organizationId: input.organizationId,
      idempotencyKey: buildAuditIdempotencyKey({
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        organizationId: input.organizationId,
        correlationId: `${workflow.correlationId}:manual-resume:${Date.now()}`,
      }),
      eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
      correlationId: workflow.correlationId,
      payload: {
        entityType: 'REVOCATION_WORKFLOW',
        entityId: workflow.id,
        eventType: 'MANUAL_RESUME',
        newStatus: workflow.status,
        actorUserId: input.actorUserId,
      },
    });

    return this.processWorkflow(workflow.id);
  }

  async processDue(limit = REVOCATION_ORCHESTRATOR.pollBatchSize): Promise<void> {
    const staleBefore = new Date(Date.now() - REVOCATION_ORCHESTRATOR.staleProcessingMs);
    await this.repo.recoverStaleProcessing(staleBefore);
    const rows = await this.repo.findDueBatch(limit);
    for (const row of rows) {
      await this.processWorkflow(row.id);
    }
  }

  async processWorkflow(workflowId: string): Promise<RevocationProcessResult> {
    const workflow = await this.repo.findById(workflowId);
    if (!workflow) {
      return {
        workflowId,
        outcome: 'skipped',
        status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
        errorMessage: 'workflow_not_found',
      };
    }

    if (TERMINAL_REVOCATION_STATUSES.has(workflow.status)) {
      return { workflowId, outcome: 'completed', status: workflow.status };
    }

    const claimed = await this.repo.claimForProcessing(workflowId);
    if (!claimed) {
      return { workflowId, outcome: 'skipped', status: workflow.status };
    }

    const completedSteps = this.parseCompletedSteps(claimed.completedSteps);
    const ctx = this.toStepContext(claimed);

    const nextStep = this.resolveNextStep(claimed.status, completedSteps, ctx);
    if (!nextStep) {
      if (claimed.status !== DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE) {
        await this.repo.markFailed(workflowId, 'critical_steps_incomplete');
        return {
          workflowId,
          outcome: 'failed',
          status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
          errorMessage: 'critical_steps_incomplete',
        };
      }
      return { workflowId, outcome: 'completed', status: claimed.status };
    }

    if (completedSteps.includes(nextStep)) {
      return { workflowId, outcome: 'skipped', status: claimed.status, stepKey: nextStep };
    }

    return this.executeStep(workflowId, nextStep, false);
  }

  private async executeStep(
    workflowId: string,
    stepKey: RevocationStepKey,
    syncDenyOnly: boolean,
  ): Promise<RevocationProcessResult> {
    const workflow = await this.repo.findById(workflowId);
    if (!workflow) {
      return {
        workflowId,
        outcome: 'failed',
        status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
        errorMessage: 'workflow_not_found',
      };
    }

    const fromStatus = workflow.status;
    const pendingStatus = REVOCATION_STEP_PENDING_STATUS[stepKey];
    const ctx = this.toStepContext(workflow);

    if (pendingStatus && !syncDenyOnly) {
      await this.prisma.dataAuthorizationRevocationWorkflow.update({
        where: { id: workflowId },
        data: { status: pendingStatus },
      });
    }

    try {
      const stepOutcome = await this.runStep(stepKey, ctx);
      const targetStatus = REVOCATION_STEP_TARGET_STATUS[stepKey];

      await this.prisma.$transaction(async (tx) => {
        await this.repo.advanceWorkflow(tx, workflowId, {
          status: targetStatus,
          completedStep: stepKey,
          ...(stepKey === REVOCATION_STEP_KEY.DENY_SWITCH
            ? { denySwitchActivatedAt: new Date() }
            : {}),
          ...(stepKey === REVOCATION_STEP_KEY.RETENTION_DECISION
            ? {
                retentionDecision:
                  workflow.retentionDecision ?? REVOCATION_RETENTION_DECISION.RETAIN,
              }
            : {}),
          ...(stepKey === REVOCATION_STEP_KEY.VERIFY ? { completedAt: new Date() } : {}),
          nextRetryAt: new Date(),
        });

        await this.repo.appendStepEvent(tx, {
          workflowId,
          organizationId: workflow.organizationId,
          stepKey,
          fromStatus,
          toStatus: targetStatus,
          outcome: stepOutcome.outcome,
          correlationId: workflow.correlationId,
        });
      });

      if (stepKey === REVOCATION_STEP_KEY.VERIFY) {
        return {
          workflowId,
          outcome: 'completed',
          status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE,
          stepKey,
        };
      }

      return {
        workflowId,
        outcome: 'advanced',
        status: targetStatus,
        stepKey,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = workflow.attempts + 1;
      const stepErrors = {
        ...(this.parseStepErrors(workflow.stepErrors) ?? {}),
        [stepKey]: message,
      };

      if (attempts >= workflow.maxAttempts) {
        await this.repo.markFailed(workflowId, message, stepErrors);
        this.dataAuthMetrics?.recordRevocationFailed(stepKey);
        this.logger.error(`Revocation workflow dead-letter id=${workflowId} step=${stepKey}: ${message}`);
        return {
          workflowId,
          outcome: 'failed',
          status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
          stepKey,
          errorMessage: message,
        };
      }

      const retryAt = new Date(Date.now() + computeRevocationBackoffMs(attempts));
      await this.repo.markRetry(workflowId, message, retryAt, stepErrors);
      this.logger.warn(
        `Revocation workflow retry id=${workflowId} step=${stepKey} attempt=${attempts}: ${message}`,
      );
      return {
        workflowId,
        outcome: 'retry',
        status: workflow.status,
        stepKey,
        errorMessage: message,
      };
    }
  }

  private async runStep(stepKey: RevocationStepKey, ctx: RevocationStepContext) {
    switch (stepKey) {
      case REVOCATION_STEP_KEY.DENY_SWITCH:
        return this.steps.executeDenySwitch(ctx);
      case REVOCATION_STEP_KEY.STOP_INGESTION:
        return this.steps.executeStopIngestion(ctx);
      case REVOCATION_STEP_KEY.REVOKE_PROVIDER:
        return this.steps.executeRevokeProvider(ctx);
      case REVOCATION_STEP_KEY.CANCEL_QUEUES:
        return this.steps.executeCancelQueues(ctx);
      case REVOCATION_STEP_KEY.NOTIFY_PARTNER:
        return this.steps.executeNotifyPartner(ctx);
      case REVOCATION_STEP_KEY.RETENTION_DECISION:
        return this.steps.executeRetentionDecision(ctx);
      case REVOCATION_STEP_KEY.SCHEDULE_DELETION:
        return this.steps.executeScheduleDeletion(ctx);
      case REVOCATION_STEP_KEY.VERIFY:
        return this.steps.executeVerify(ctx);
      default:
        throw new Error(`unknown_revocation_step:${stepKey}`);
    }
  }

  private resolveNextStep(
    status: DataAuthorizationRevocationWorkflowStatus,
    completedSteps: string[],
    ctx: RevocationStepContext,
  ): RevocationStepKey | null {
    for (const step of STEP_ORDER) {
      if (completedSteps.includes(step)) continue;
      if (step === REVOCATION_STEP_KEY.SCHEDULE_DELETION) {
        const retention =
          ctx.retentionDecision ?? REVOCATION_RETENTION_DECISION.RETAIN;
        if (retention !== REVOCATION_RETENTION_DECISION.DELETE) continue;
      }
      const target = REVOCATION_STEP_TARGET_STATUS[step];
      if (this.statusRank(target) > this.statusRank(status)) {
        return step;
      }
    }
    return null;
  }

  private statusRank(status: DataAuthorizationRevocationWorkflowStatus): number {
    const order = [
      'REVOCATION_REQUESTED',
      'DENY_SWITCH_ACTIVE',
      'INGESTION_STOPPED',
      'PROVIDER_ACCESS_REVOKE_PENDING',
      'PROVIDER_ACCESS_REVOKED',
      'QUEUES_CANCELLED',
      'DOWNSTREAM_NOTIFICATION_PENDING',
      'DOWNSTREAM_NOTIFIED',
      'RETENTION_DECISION_PENDING',
      'RETENTION_DECIDED',
      'DELETION_SCHEDULED',
      'VERIFICATION_PENDING',
      'REVOCATION_COMPLETE',
      'REVOCATION_FAILED',
    ];
    return order.indexOf(status);
  }

  private toStepContext(
    workflow: Prisma.DataAuthorizationRevocationWorkflowGetPayload<object>,
  ): RevocationStepContext {
    return {
      workflowId: workflow.id,
      organizationId: workflow.organizationId,
      correlationId: workflow.correlationId,
      triggerType: workflow.triggerType,
      processingActivityId: workflow.processingActivityId,
      enforcementPolicyId: workflow.enforcementPolicyId,
      consentId: workflow.consentId,
      providerGrantId: workflow.providerGrantId,
      dataSharingAuthId: workflow.dataSharingAuthId,
      legacyOrgAuthId: workflow.legacyOrgAuthId,
      dataCategories: this.parseStringArray(workflow.dataCategories),
      purposes: this.parseStringArray(workflow.purposes),
      vehicleIds: this.parseStringArray(workflow.vehicleIds),
      retentionDecision: workflow.retentionDecision,
      reason: workflow.reason,
    };
  }

  private parseCompletedSteps(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? (value as string[]) : [];
  }

  private parseStringArray(value: Prisma.JsonValue | null): string[] {
    if (!value) return [];
    return Array.isArray(value) ? (value as string[]) : [];
  }

  private parseStepErrors(value: Prisma.JsonValue | null): Record<string, string> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, string>;
  }

  assertTenant(orgId: string, workflowOrgId: string): void {
    if (orgId !== workflowOrgId) {
      throw new ForbiddenException('Tenant mismatch for revocation workflow');
    }
  }
}
