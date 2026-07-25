import { BadRequestException } from '@nestjs/common';
import {
  APPROVAL_REQUIRED_ACTIONS,
  LEGACY_ACTION_TO_CANONICAL,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EVENT_TYPES,
  type WorkflowActionType,
  type WorkflowEventType,
} from './workflow.constants';
import {
  DEFAULT_ERROR_STRATEGY_BY_ACTION,
  NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES,
  WORKFLOW_ACTION_ERROR_STRATEGIES,
  isActionCompensatable,
  resolveBlockingOnFailure,
} from './runtime/error-strategy/workflow-action-error-strategy.constants';
import {
  LEGACY_TRIGGER_TO_EVENT,
  resolveCanonicalEventType,
} from './registry';
import { normalizeVehicleStatusInput } from './vehicle-status.util';

export interface WorkflowTriggerDef {
  type: string;
  config?: Record<string, unknown>;
}

export interface WorkflowConditionDef {
  field?: string;
  path?: string;
  operator: string;
  value?: unknown;
}

export interface WorkflowActionDef {
  type: string;
  config?: Record<string, unknown>;
  requiresApproval?: boolean;
  errorStrategy?: string;
  fallbackActionKey?: string;
  compensateActionKey?: string;
  compensatable?: boolean;
  actionKey?: string;
}

export interface WorkflowScopeDef {
  type: string;
  stationIds?: string[];
  vehicleIds?: string[];
}

export function normalizeTriggerType(raw: string): WorkflowEventType | string {
  if ((WORKFLOW_EVENT_TYPES as readonly string[]).includes(raw)) return raw;
  return resolveCanonicalEventType(raw);
}

export function normalizeActionType(raw: string): string {
  if ((WORKFLOW_ACTION_TYPES as readonly string[]).includes(raw)) return raw;
  return LEGACY_ACTION_TO_CANONICAL[raw] ?? raw;
}

export function validateWorkflowDefinition(input: {
  name?: string;
  description?: string | null;
  category?: string;
  trigger?: WorkflowTriggerDef;
  conditions?: WorkflowConditionDef[];
  actions?: WorkflowActionDef[];
  scope?: WorkflowScopeDef;
  status?: string;
}): {
  trigger: WorkflowTriggerDef;
  conditions: WorkflowConditionDef[];
  actions: WorkflowActionDef[];
  scope: WorkflowScopeDef;
} {
  if (input.name !== undefined && !input.name.trim()) {
    throw new BadRequestException('Workflow name is required');
  }
  if (input.name && input.name.length > 200) {
    throw new BadRequestException('Workflow name must be at most 200 characters');
  }
  if (input.category && !(WORKFLOW_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new BadRequestException(`Invalid workflow category: ${input.category}`);
  }

  const trigger = input.trigger;
  if (!trigger?.type) {
    throw new BadRequestException('Workflow trigger.type is required');
  }
  const canonicalTrigger = normalizeTriggerType(trigger.type);
  const allowedTriggers = [
    ...WORKFLOW_EVENT_TYPES,
    ...Object.keys(LEGACY_TRIGGER_TO_EVENT),
  ];
  if (!allowedTriggers.includes(trigger.type) && !WORKFLOW_EVENT_TYPES.includes(canonicalTrigger as WorkflowEventType)) {
    throw new BadRequestException(`Unsupported trigger type: ${trigger.type}`);
  }

  const actions = input.actions ?? [];
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new BadRequestException('Workflow must define at least one action');
  }

  const normalizedActions: WorkflowActionDef[] = actions.map((action, index) => {
    if (!action?.type) {
      throw new BadRequestException(`Action at index ${index} is missing type`);
    }
    const canonical = normalizeActionType(action.type);
    const blocked = [
      'ai.execute',
      'ai.send_message',
      'ai.book_appointment',
      'customer.contact.send',
      'invoice.charge',
      'booking.cancel',
      'ai_execute',
      'ai_send_message',
      'ai_book_appointment',
    ];
    if (blocked.includes(action.type) || blocked.includes(canonical)) {
      throw new BadRequestException(
        `Action "${action.type}" is not available for automatic execution`,
      );
    }
    if (!(WORKFLOW_ACTION_TYPES as readonly string[]).includes(canonical)) {
      throw new BadRequestException(`Unsupported action type: ${action.type}`);
    }
    const requiresApproval =
      action.requiresApproval === true || APPROVAL_REQUIRED_ACTIONS.has(canonical);
    const errorStrategyRaw =
      action.errorStrategy ??
      DEFAULT_ERROR_STRATEGY_BY_ACTION[canonical] ??
      'STOP_WORKFLOW';
    if (!WORKFLOW_ACTION_ERROR_STRATEGIES.includes(errorStrategyRaw as never)) {
      throw new BadRequestException(`Invalid errorStrategy at index ${index}: ${errorStrategyRaw}`);
    }
    const compensatableRequested = action.compensatable === true;
    if (compensatableRequested && NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES.has(canonical)) {
      throw new BadRequestException(
        `Action "${canonical}" cannot be compensatable — external communication is not reliably reversible`,
      );
    }
    if (errorStrategyRaw === 'EXECUTE_FALLBACK' && !action.fallbackActionKey) {
      throw new BadRequestException(
        `Action at index ${index} uses EXECUTE_FALLBACK but fallbackActionKey is missing`,
      );
    }
    if (errorStrategyRaw === 'COMPENSATE_PREVIOUS' && !isActionCompensatable(canonical, compensatableRequested)) {
      throw new BadRequestException(
        `Action at index ${index} uses COMPENSATE_PREVIOUS but is not compensatable`,
      );
    }
    let config = action.config ?? {};
    if (canonical === 'vehicle.status.update') {
      const status = action.config?.status;
      const normalized =
        typeof status === 'string' ? normalizeVehicleStatusInput(status) : undefined;
      if (!normalized) {
        throw new BadRequestException(
          `vehicle.status.update requires a valid VehicleStatus (got: ${String(status)})`,
        );
      }
      config = { ...config, status: normalized };
    }
    return {
      type: canonical,
      config,
      requiresApproval,
      errorStrategy: errorStrategyRaw,
      fallbackActionKey: action.fallbackActionKey,
      compensateActionKey: action.compensateActionKey,
      compensatable: isActionCompensatable(canonical, compensatableRequested),
      actionKey: action.actionKey ?? `action-${index}`,
    };
  });

  const actionKeys = new Set(normalizedActions.map((a) => a.actionKey));
  for (const action of normalizedActions) {
    if (action.fallbackActionKey && !actionKeys.has(action.fallbackActionKey)) {
      throw new BadRequestException(
        `fallbackActionKey "${action.fallbackActionKey}" does not reference an action in this workflow`,
      );
    }
  }

  const conditions = Array.isArray(input.conditions) ? input.conditions : [];

  const scope = input.scope ?? { type: 'organization' };
  if (!scope.type) {
    throw new BadRequestException('Workflow scope.type is required');
  }

  return {
    trigger: { ...trigger, type: canonicalTrigger },
    conditions,
    actions: normalizedActions,
    scope,
  };
}
