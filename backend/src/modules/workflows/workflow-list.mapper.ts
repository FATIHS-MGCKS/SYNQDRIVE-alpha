import type { OrgWorkflow, OrgWorkflowChangeRequest, OrgWorkflowRun } from '@prisma/client';
import { assessWorkflowSensitivity } from './maker-checker/workflow-maker-checker.constants';
import {
  LEGACY_ACTION_TO_CANONICAL,
  LEGACY_TRIGGER_TO_EVENT,
  WORKFLOW_ACTION_TYPES,
} from './workflow.constants';

export const SYSTEM_WORKFLOW_ANCHOR_NAME = '__system_maker_checker_anchor__';

export type WorkflowRiskClass = 'LOW' | 'HIGH' | 'CRITICAL';
export type WorkflowSourceType = 'custom' | 'system' | 'migrated';
export type WorkflowApprovalStatus = 'none' | 'pending' | 'approved';
export type WorkflowLastRunOutcome =
  | 'none'
  | 'success'
  | 'failed'
  | 'partial'
  | 'waiting_approval'
  | 'skipped'
  | 'policy_blocked';

export interface WorkflowListItemDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  scope: unknown;
  status: string;
  statusLabel: string;
  enabled: boolean;
  version: number;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  lastTriggeredAt: Date | null;
  triggerCount: number;
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
  riskClass: WorkflowRiskClass;
  sourceType: WorkflowSourceType;
  approvalStatus: WorkflowApprovalStatus;
  activeVersion: number;
  lastRunAt: string | null;
  lastRunOutcome: WorkflowLastRunOutcome;
  lastRunLabel: string | null;
  hasLegacyMapping: boolean;
  unavailableActionCount: number;
}

const STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  DISABLED: 'Disabled',
  INVALID: 'Invalid',
  PENDING_ACTIVATION: 'Pending activation',
  ARCHIVED: 'Archived',
};

export function isSystemWorkflow(workflow: Pick<OrgWorkflow, 'name' | 'isTemplate'>): boolean {
  return workflow.name === SYSTEM_WORKFLOW_ANCHOR_NAME
    || (workflow.isTemplate && workflow.name === SYSTEM_WORKFLOW_ANCHOR_NAME);
}

function hasLegacyMapping(workflow: Pick<OrgWorkflow, 'trigger' | 'actions'>): boolean {
  const trigger = workflow.trigger as { type?: string } | null;
  const triggerType = trigger?.type ?? '';
  if (triggerType in LEGACY_TRIGGER_TO_EVENT) return true;

  const actions = Array.isArray(workflow.actions)
    ? (workflow.actions as Array<{ type?: string }>)
    : [];
  return actions.some((action) => {
    const type = action.type ?? '';
    return type in LEGACY_ACTION_TO_CANONICAL && !(WORKFLOW_ACTION_TYPES as readonly string[]).includes(type);
  });
}

function countUnavailableActions(workflow: Pick<OrgWorkflow, 'actions'>): number {
  const supported = new Set<string>([
    ...WORKFLOW_ACTION_TYPES,
    ...Object.keys(LEGACY_ACTION_TO_CANONICAL),
  ]);
  const actions = Array.isArray(workflow.actions)
    ? (workflow.actions as Array<{ type?: string }>)
    : [];
  return actions.filter((action) => !supported.has(action.type ?? '')).length;
}

function resolveSourceType(workflow: OrgWorkflow): WorkflowSourceType {
  if (isSystemWorkflow(workflow)) return 'system';
  if (hasLegacyMapping(workflow)) return 'migrated';
  return 'custom';
}

function resolveApprovalStatus(
  workflow: OrgWorkflow,
  pendingRequest?: OrgWorkflowChangeRequest | null,
): WorkflowApprovalStatus {
  if (workflow.status === 'PENDING_ACTIVATION' || pendingRequest?.status === 'PENDING') {
    return 'pending';
  }
  if (pendingRequest?.status === 'APPROVED') return 'approved';
  return 'none';
}

function resolveLastRunOutcome(run?: OrgWorkflowRun | null): {
  outcome: WorkflowLastRunOutcome;
  label: string | null;
} {
  if (!run) return { outcome: 'none', label: null };

  switch (run.status) {
    case 'SUCCESS':
      return { outcome: 'success', label: 'Success' };
    case 'FAILED':
      if (run.errorMessage?.toLowerCase().includes('policy')) {
        return { outcome: 'policy_blocked', label: 'Policy blocked' };
      }
      return { outcome: 'failed', label: 'Failed' };
    case 'WAITING_APPROVAL':
      return { outcome: 'waiting_approval', label: 'Waiting approval' };
    case 'SKIPPED':
      return { outcome: 'skipped', label: 'Skipped' };
    case 'RUNNING':
    case 'PENDING':
      return { outcome: 'partial', label: 'In progress' };
    default:
      return { outcome: 'none', label: run.status };
  }
}

export function mapWorkflowListItem(
  workflow: OrgWorkflow,
  context?: {
    latestRun?: OrgWorkflowRun | null;
    pendingChangeRequest?: OrgWorkflowChangeRequest | null;
  },
): WorkflowListItemDto {
  const actions = Array.isArray(workflow.actions)
    ? (workflow.actions as Array<{ type: string }>)
    : [];
  const riskClass = assessWorkflowSensitivity(actions);
  const lastRun = resolveLastRunOutcome(context?.latestRun);

  return {
    id: workflow.id,
    organizationId: workflow.organizationId,
    name: workflow.name,
    description: workflow.description,
    category: workflow.category,
    trigger: workflow.trigger,
    conditions: workflow.conditions,
    actions: workflow.actions,
    scope: workflow.scope,
    status: workflow.status,
    statusLabel: STATUS_DISPLAY[workflow.status] ?? workflow.status,
    enabled: workflow.enabled,
    version: workflow.version,
    createdById: workflow.createdById,
    createdByName: workflow.createdByName,
    updatedById: workflow.updatedById,
    updatedByName: workflow.updatedByName,
    lastTriggeredAt: workflow.lastTriggeredAt,
    triggerCount: workflow.triggerCount,
    isTemplate: workflow.isTemplate,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    riskClass,
    sourceType: resolveSourceType(workflow),
    approvalStatus: resolveApprovalStatus(workflow, context?.pendingChangeRequest),
    activeVersion: workflow.version,
    lastRunAt: context?.latestRun?.finishedAt?.toISOString()
      ?? context?.latestRun?.startedAt?.toISOString()
      ?? null,
    lastRunOutcome: lastRun.outcome,
    lastRunLabel: lastRun.label,
    hasLegacyMapping: hasLegacyMapping(workflow),
    unavailableActionCount: countUnavailableActions(workflow),
  };
}
