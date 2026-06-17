import { BadRequestException } from '@nestjs/common';
import {
  APPROVAL_REQUIRED_ACTIONS,
  LEGACY_ACTION_TO_CANONICAL,
  LEGACY_TRIGGER_TO_EVENT,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EVENT_TYPES,
  type WorkflowActionType,
  type WorkflowEventType,
} from './workflow.constants';
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
}

export interface WorkflowScopeDef {
  type: string;
  stationIds?: string[];
  vehicleIds?: string[];
}

export function normalizeTriggerType(raw: string): WorkflowEventType | string {
  if ((WORKFLOW_EVENT_TYPES as readonly string[]).includes(raw)) return raw;
  return LEGACY_TRIGGER_TO_EVENT[raw] ?? raw;
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
    };
  });

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
