import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowMatcherMatchedWorkflow } from '../matcher/workflow-matcher.types';
import {
  buildWorkflowRunIdempotencyKey,
  resolveOccurrenceIdFromEnvelope,
  WorkflowIdempotencyService,
} from '../idempotency';
import { WorkflowRunOrchestratorRepository } from './workflow-run-orchestrator.repository';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

export interface CreateRunFromMatchInput {
  organizationId: string;
  match: WorkflowMatcherMatchedWorkflow;
  envelope: WorkflowDomainEventEnvelope;
}

@Injectable()
export class WorkflowRunOrchestratorService {
  private readonly logger = new Logger(WorkflowRunOrchestratorService.name);

  constructor(
    private readonly repository: WorkflowRunOrchestratorRepository,
    private readonly idempotency: WorkflowIdempotencyService,
  ) {}

  buildIdempotencyKey(
    organizationId: string,
    workflowVersionId: string,
    envelope: WorkflowDomainEventEnvelope,
  ): string {
    const occurrenceId = resolveOccurrenceIdFromEnvelope(envelope);
    return buildWorkflowRunIdempotencyKey({
      organizationId,
      workflowVersionId,
      occurrenceId,
    });
  }

  async createRunFromMatch(input: CreateRunFromMatchInput) {
    const occurrenceId = resolveOccurrenceIdFromEnvelope(input.envelope);
    const idempotencyKey = buildWorkflowRunIdempotencyKey({
      organizationId: input.organizationId,
      workflowVersionId: input.match.workflowVersionId,
      occurrenceId,
    });

    const version = await this.repository.loadVersionGraph(
      input.organizationId,
      input.match.workflowVersionId,
    );
    if (!version) {
      throw new NotFoundException({
        message: 'Workflow version not found',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.NOT_FOUND,
      });
    }

    const payload =
      input.envelope.payload && typeof input.envelope.payload === 'object'
        ? (input.envelope.payload as Record<string, unknown>)
        : {};

    const conditionEval = this.repository.evaluateVersionConditions(
      version,
      payload,
      input.organizationId,
    );
    const policySnapshot = await this.repository.getOrCreatePolicySnapshot(input.organizationId);

    const createInput = {
      organizationId: input.organizationId,
      match: input.match,
      envelope: input.envelope,
      idempotencyKey,
      occurrenceId,
      version,
      policySnapshotId: policySnapshot.id,
      conditionResult: conditionEval,
      skipped: !conditionEval.passed,
    };

    try {
      const run = await this.repository.createRunWithActions(createInput);
      await this.idempotency.recordDecision({
        organizationId: input.organizationId,
        entityType: 'RUN',
        scopeKey: idempotencyKey,
        outcome: conditionEval.passed ? 'ACCEPTED' : 'ACCEPTED',
        reason: conditionEval.passed ? 'Run created' : 'Run created as SKIPPED (conditions not met)',
        occurrenceId,
        eventId: input.envelope.eventId,
        correlationId: input.envelope.correlationId,
        causationId: input.envelope.causationId,
        workflowRunId: run.id,
      });
      return run;
    } catch (err) {
      if (this.idempotency.isUniqueConstraintError(err)) {
        const existing = await this.repository.findExistingRun(input.organizationId, idempotencyKey);
        if (existing) {
          await this.idempotency.recordDecision({
            organizationId: input.organizationId,
            entityType: 'RUN',
            scopeKey: idempotencyKey,
            outcome: 'DUPLICATE_SUPPRESSED',
            reason: this.idempotency.explainDuplicateSuppression({
              entityType: 'RUN',
              scopeKey: idempotencyKey,
              existingId: existing.id,
            }),
            occurrenceId,
            eventId: input.envelope.eventId,
            workflowRunId: existing.id,
          });
          this.logger.debug(
            `Returning existing workflow run for idempotency key (org=${input.organizationId})`,
          );
          return existing;
        }
      }
      throw err;
    }
  }
}
