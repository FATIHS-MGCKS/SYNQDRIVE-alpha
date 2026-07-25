import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowMatcherMatchedWorkflow } from '../matcher/workflow-matcher.types';
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

  constructor(private readonly repository: WorkflowRunOrchestratorRepository) {}

  buildIdempotencyKey(envelope: WorkflowDomainEventEnvelope, definitionId: string): string {
    const base = envelope.eventId ?? `${envelope.eventType}:${envelope.entityId ?? 'none'}`;
    return `${base}:workflow:${definitionId}`;
  }

  async createRunFromMatch(input: CreateRunFromMatchInput) {
    const idempotencyKey = this.buildIdempotencyKey(input.envelope, input.match.workflowDefinitionId);
    const existing = await this.repository.findExistingRun(input.organizationId, idempotencyKey);
    if (existing) {
      this.logger.debug(
        `Returning existing workflow run for idempotency key (org=${input.organizationId})`,
      );
      return existing;
    }

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

    const conditionEval = this.repository.evaluateVersionConditions(version, payload);
    const policySnapshot = await this.repository.getOrCreatePolicySnapshot(input.organizationId);

    if (!conditionEval.passed) {
      return this.repository.createRunWithActions({
        organizationId: input.organizationId,
        match: input.match,
        envelope: input.envelope,
        idempotencyKey: `${idempotencyKey}:skipped`,
        version,
        policySnapshotId: policySnapshot.id,
        conditionResult: conditionEval,
        skipped: true,
      });
    }

    return this.repository.createRunWithActions({
      organizationId: input.organizationId,
      match: input.match,
      envelope: input.envelope,
      idempotencyKey,
      version,
      policySnapshotId: policySnapshot.id,
      conditionResult: conditionEval,
      skipped: false,
    });
  }
}
