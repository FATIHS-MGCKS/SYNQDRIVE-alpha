import { BadRequestException } from '@nestjs/common';
import {
  APPROVAL_REQUIRED_ACTIONS,
  WORKFLOW_ACTION_TYPES,
} from './workflow.constants';
import { validateWorkflowDefinition, type WorkflowActionDef } from './workflow-definition.validator';
import { WORKFLOW_LIFECYCLE_ERROR_CODES } from './workflow-lifecycle.errors';
import { computeWorkflowContentHash } from './workflow-lifecycle.util';

const BLOCKED_PUBLISH_ACTIONS = new Set([
  'ai.execute',
  'ai.send_message',
  'ai.book_appointment',
  'customer.contact.send',
  'invoice.charge',
  'booking.cancel',
  'ai_execute',
  'ai_send_message',
  'ai_book_appointment',
]);

export interface WorkflowPublishValidationInput {
  name?: string;
  category?: string;
  trigger?: { type: string; config?: Record<string, unknown> };
  conditions?: Array<{ field?: string; path?: string; operator: string; value?: unknown }>;
  actions?: Array<{ type: string; config?: Record<string, unknown>; requiresApproval?: boolean }>;
  scope?: { type: string; stationIds?: string[]; vehicleIds?: string[] };
}

export interface WorkflowPublishValidationResult {
  validated: ReturnType<typeof validateWorkflowDefinition>;
  snapshot: {
    trigger: ReturnType<typeof validateWorkflowDefinition>['trigger'];
    scope: ReturnType<typeof validateWorkflowDefinition>['scope'];
    conditions: ReturnType<typeof validateWorkflowDefinition>['conditions'];
    actions: ReturnType<typeof validateWorkflowDefinition>['actions'];
  };
  contentHash: string;
}

export function validateWorkflowForPublish(
  input: WorkflowPublishValidationInput,
): WorkflowPublishValidationResult {
  const validated = validateWorkflowDefinition(input);
  const issues = collectPublishCapabilityIssues(validated.actions);
  if (issues.length > 0) {
    throw new BadRequestException({
      message: issues[0].message,
      code: WORKFLOW_LIFECYCLE_ERROR_CODES.PUBLISH_VALIDATION_FAILED,
      issues,
    });
  }

  const snapshot = {
    trigger: validated.trigger,
    scope: validated.scope,
    conditions: validated.conditions,
    actions: validated.actions,
  };
  return {
    validated,
    snapshot,
    contentHash: computeWorkflowContentHash(snapshot),
  };
}

export function collectPublishCapabilityIssues(actions: WorkflowActionDef[]) {
  const issues: Array<{ code: string; message: string; actionType: string }> = [];
  for (const action of actions) {
    if (BLOCKED_PUBLISH_ACTIONS.has(action.type)) {
      issues.push({
        code: 'WORKFLOW_ACTION_BLOCKED',
        message: `Action "${action.type}" cannot be published`,
        actionType: action.type,
      });
      continue;
    }
    if (!(WORKFLOW_ACTION_TYPES as readonly string[]).includes(action.type)) {
      issues.push({
        code: 'WORKFLOW_ACTION_UNKNOWN',
        message: `Action "${action.type}" is not registered for production`,
        actionType: action.type,
      });
    }
  }
  return issues;
}

/** Interim: approval-gated workflows may publish but cannot activate until resume ships. */
export function collectActivationPolicyIssues(actions: WorkflowActionDef[]) {
  const issues: Array<{ code: string; message: string }> = [];
  const hasApprovalGated = actions.some(
    (a) => a.requiresApproval === true || APPROVAL_REQUIRED_ACTIONS.has(a.type),
  );
  if (hasApprovalGated) {
    issues.push({
      code: 'WORKFLOW_APPROVAL_RESUME_NOT_SUPPORTED',
      message:
        'Workflows with approval-gated actions cannot be activated until pause-and-resume is available (Phase 5).',
    });
  }
  return issues;
}
