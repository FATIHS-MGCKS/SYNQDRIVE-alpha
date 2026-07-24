import { BadRequestException } from '@nestjs/common';
import { LEGACY_ACTION_TO_CANONICAL } from './workflow.constants';
import { normalizeVehicleStatusInput } from './vehicle-status.util';
import type { WorkflowActionDef } from './workflow-definition.validator';

/** Bumped when capability matrix changes — exposed via API for auditability. */
export const WORKFLOW_ACTION_CAPABILITY_REVISION = '2026-07-25.1';

export type WorkflowActionCapabilityStatus =
  | 'AVAILABLE'
  | 'INTERNAL_ONLY'
  | 'EXPERIMENTAL'
  | 'DISABLED'
  | 'UNSUPPORTED';

export const WORKFLOW_ACTION_ERROR_CODES = {
  UNKNOWN_ACTION: 'WORKFLOW_ACTION_UNKNOWN',
  DISABLED_ACTION: 'WORKFLOW_ACTION_DISABLED',
  UNSUPPORTED_ACTION: 'WORKFLOW_ACTION_UNSUPPORTED',
  MISSING_HANDLER: 'WORKFLOW_ACTION_MISSING_HANDLER',
  INVALID_CONFIG: 'WORKFLOW_ACTION_INVALID_CONFIG',
  NOT_ACTIVATABLE: 'WORKFLOW_ACTION_NOT_ACTIVATABLE',
  EXPERIMENTAL_NOT_ALLOWED: 'WORKFLOW_ACTION_EXPERIMENTAL_NOT_ALLOWED',
} as const;

export type WorkflowActionErrorCode =
  (typeof WORKFLOW_ACTION_ERROR_CODES)[keyof typeof WORKFLOW_ACTION_ERROR_CODES];

export interface WorkflowActionCapabilityDefinition {
  canonicalType: string;
  label: string;
  status: WorkflowActionCapabilityStatus;
  legacyAliases: string[];
  handlerRegistered: boolean;
  requiresApproval: boolean;
  description: string;
  blockedReason?: string;
  selectableInUi: boolean;
}

export interface WorkflowActionCapabilityIssue {
  index: number;
  rawType: string;
  canonicalType: string | null;
  code: WorkflowActionErrorCode;
  message: string;
}

export interface WorkflowActionCapabilityPlanItem {
  index: number;
  rawType: string;
  canonicalType: string | null;
  status: WorkflowActionCapabilityStatus | 'UNKNOWN';
  handlerRegistered: boolean;
  selectableInUi: boolean;
  wouldExecute: boolean;
  validationErrors: string[];
  code?: WorkflowActionErrorCode;
  message?: string;
}

export interface WorkflowActionCapabilityListResponse {
  revision: string;
  generatedAt: string;
  actions: Array<{
    canonicalType: string;
    label: string;
    status: WorkflowActionCapabilityStatus;
    legacyAliases: string[];
    handlerRegistered: boolean;
    requiresApproval: boolean;
    description: string;
    blockedReason?: string;
    selectableInUi: boolean;
  }>;
}

const REGISTRY: WorkflowActionCapabilityDefinition[] = [
  {
    canonicalType: 'task.create',
    label: 'Create task',
    status: 'AVAILABLE',
    legacyAliases: ['create_task'],
    handlerRegistered: true,
    requiresApproval: false,
    description: 'Creates an OrgTask from workflow context.',
    selectableInUi: true,
  },
  {
    canonicalType: 'alert.create',
    label: 'Create alert',
    status: 'AVAILABLE',
    legacyAliases: ['create_alert'],
    handlerRegistered: true,
    requiresApproval: false,
    description: 'Creates an alert task for operators.',
    selectableInUi: true,
  },
  {
    canonicalType: 'vehicle.status.update',
    label: 'Change vehicle status',
    status: 'AVAILABLE',
    legacyAliases: ['change_vehicle_status'],
    handlerRegistered: true,
    requiresApproval: false,
    description: 'Updates vehicle operational status.',
    selectableInUi: true,
  },
  {
    canonicalType: 'notification.prepare',
    label: 'Prepare notification (draft only)',
    status: 'AVAILABLE',
    legacyAliases: ['send_notification'],
    handlerRegistered: true,
    requiresApproval: false,
    description: 'Creates a draft notification task — does not send externally.',
    selectableInUi: true,
  },
  {
    canonicalType: 'workflow.approval.request',
    label: 'Request approval',
    status: 'AVAILABLE',
    legacyAliases: ['request_approval'],
    handlerRegistered: true,
    requiresApproval: true,
    description: 'Pauses workflow until a human approves.',
    selectableInUi: true,
  },
  {
    canonicalType: 'ai.suggest_action',
    label: 'AI: Suggest action (approval required)',
    status: 'AVAILABLE',
    legacyAliases: ['ai_suggest'],
    handlerRegistered: true,
    requiresApproval: true,
    description: 'Creates a review task and approval gate for AI suggestions.',
    selectableInUi: true,
  },
  {
    canonicalType: 'vehicle.cleaning.status.update',
    label: 'Set cleaning status',
    status: 'UNSUPPORTED',
    legacyAliases: ['change_cleaning_status'],
    handlerRegistered: false,
    requiresApproval: false,
    description: 'Cleaning status automation is not implemented.',
    blockedReason: 'No production handler registered',
    selectableInUi: false,
  },
  {
    canonicalType: 'vendor.assign',
    label: 'Assign vendor / service',
    status: 'UNSUPPORTED',
    legacyAliases: ['assign_vendor'],
    handlerRegistered: false,
    requiresApproval: false,
    description: 'Vendor assignment automation is not implemented.',
    blockedReason: 'No production handler registered',
    selectableInUi: false,
  },
  {
    canonicalType: 'ai.execute',
    label: 'AI: Execute action',
    status: 'DISABLED',
    legacyAliases: ['ai_execute'],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Autonomous AI execution is disabled.',
    blockedReason: 'Autonomous AI execution is not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'ai.send_message',
    label: 'AI: Send customer message',
    status: 'DISABLED',
    legacyAliases: ['ai_send_message'],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'AI customer messaging is disabled.',
    blockedReason: 'Customer messaging adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'ai.book_appointment',
    label: 'AI: Book appointment',
    status: 'DISABLED',
    legacyAliases: ['ai_book_appointment'],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'AI appointment booking is disabled.',
    blockedReason: 'Appointment booking adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'customer.contact.send',
    label: 'Send customer contact message',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Direct customer contact actions are disabled.',
    blockedReason: 'Customer contact adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'invoice.charge',
    label: 'Charge invoice',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Invoice charging is disabled in workflows.',
    blockedReason: 'Billing charge adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'booking.cancel',
    label: 'Cancel booking',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Booking cancellation via workflow is disabled.',
    blockedReason: 'Booking cancel side effects require dedicated review',
    selectableInUi: false,
  },
  {
    canonicalType: 'channel.email.send',
    label: 'Send email',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Email channel delivery is disabled until adapter is complete.',
    blockedReason: 'Email channel adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'channel.whatsapp.send',
    label: 'Send WhatsApp message',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'WhatsApp delivery is disabled until adapter is complete.',
    blockedReason: 'WhatsApp channel adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'channel.sms.send',
    label: 'Send SMS',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'SMS delivery is disabled until adapter is complete.',
    blockedReason: 'SMS channel adapter not production-ready',
    selectableInUi: false,
  },
  {
    canonicalType: 'voice.call.initiate',
    label: 'Initiate voice call',
    status: 'DISABLED',
    legacyAliases: [],
    handlerRegistered: false,
    requiresApproval: true,
    description: 'Voice call initiation is disabled until adapter is complete.',
    blockedReason: 'Voice call adapter not production-ready',
    selectableInUi: false,
  },
];

const byCanonical = new Map(
  REGISTRY.map((entry) => [entry.canonicalType, entry] as const),
);

const aliasToCanonical = new Map<string, string>();
for (const entry of REGISTRY) {
  for (const alias of entry.legacyAliases) {
    aliasToCanonical.set(alias, entry.canonicalType);
  }
}
for (const [legacy, canonical] of Object.entries(LEGACY_ACTION_TO_CANONICAL)) {
  if (!aliasToCanonical.has(legacy)) {
    aliasToCanonical.set(legacy, canonical);
  }
}

export function listWorkflowActionCapabilities(): WorkflowActionCapabilityListResponse {
  return {
    revision: WORKFLOW_ACTION_CAPABILITY_REVISION,
    generatedAt: new Date().toISOString(),
    actions: REGISTRY.map((entry) => ({
      canonicalType: entry.canonicalType,
      label: entry.label,
      status: entry.status,
      legacyAliases: [...entry.legacyAliases],
      handlerRegistered: entry.handlerRegistered,
      requiresApproval: entry.requiresApproval,
      description: entry.description,
      blockedReason: entry.blockedReason,
      selectableInUi: entry.selectableInUi,
    })),
  };
}

export function resolveWorkflowActionType(rawType: string): {
  canonicalType: string | null;
  definition: WorkflowActionCapabilityDefinition | null;
} {
  const trimmed = rawType?.trim();
  if (!trimmed) {
    return { canonicalType: null, definition: null };
  }
  if (byCanonical.has(trimmed)) {
    const definition = byCanonical.get(trimmed)!;
    return { canonicalType: definition.canonicalType, definition };
  }
  const aliasCanonical = aliasToCanonical.get(trimmed) ?? null;
  if (aliasCanonical && byCanonical.has(aliasCanonical)) {
    return { canonicalType: aliasCanonical, definition: byCanonical.get(aliasCanonical)! };
  }
  return { canonicalType: null, definition: null };
}

export function validateActionConfig(
  definition: WorkflowActionCapabilityDefinition,
  config: Record<string, unknown> | undefined,
): string[] {
  const errors: string[] = [];
  const cfg = config ?? {};

  switch (definition.canonicalType) {
    case 'vehicle.status.update': {
      const status = cfg.status;
      const normalized =
        typeof status === 'string' ? normalizeVehicleStatusInput(status) : undefined;
      if (!normalized) {
        errors.push('vehicle.status.update requires a valid VehicleStatus');
      }
      break;
    }
    case 'task.create': {
      const title = cfg.title;
      if (title !== undefined && typeof title === 'string' && !title.trim()) {
        errors.push('task.create title cannot be empty when provided');
      }
      break;
    }
    case 'alert.create': {
      const message = cfg.message;
      if (message !== undefined && typeof message === 'string' && !message.trim()) {
        errors.push('alert.create message cannot be empty when provided');
      }
      break;
    }
    case 'notification.prepare': {
      const message = cfg.message;
      if (message !== undefined && typeof message === 'string' && !message.trim()) {
        errors.push('notification.prepare message cannot be empty when provided');
      }
      break;
    }
    default:
      break;
  }

  return errors;
}

function issueForDefinition(
  index: number,
  rawType: string,
  canonicalType: string | null,
  definition: WorkflowActionCapabilityDefinition | null,
  mode: 'save' | 'activate' | 'execute' | 'preview',
  config?: Record<string, unknown>,
): WorkflowActionCapabilityIssue | null {
  if (!canonicalType || !definition) {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.UNKNOWN_ACTION,
      message: `Unknown workflow action type: ${rawType}`,
    };
  }

  if (definition.status === 'DISABLED') {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.DISABLED_ACTION,
      message:
        definition.blockedReason ??
        `Action "${canonicalType}" is disabled and cannot be used`,
    };
  }

  if (definition.status === 'UNSUPPORTED') {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.UNSUPPORTED_ACTION,
      message:
        definition.blockedReason ??
        `Action "${canonicalType}" is not supported in production`,
    };
  }

  if (definition.status === 'EXPERIMENTAL' && mode !== 'preview') {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.EXPERIMENTAL_NOT_ALLOWED,
      message: `Action "${canonicalType}" is experimental and cannot be ${mode === 'save' ? 'saved' : 'activated'}`,
    };
  }

  if (!definition.handlerRegistered) {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.MISSING_HANDLER,
      message: `Action "${canonicalType}" has no registered production handler`,
    };
  }

  if ((mode === 'activate' || mode === 'execute') && definition.status !== 'AVAILABLE') {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.NOT_ACTIVATABLE,
      message: `Action "${canonicalType}" cannot be activated or executed in status ${definition.status}`,
    };
  }

  const configErrors = validateActionConfig(definition, config);
  if (configErrors.length > 0) {
    return {
      index,
      rawType,
      canonicalType,
      code: WORKFLOW_ACTION_ERROR_CODES.INVALID_CONFIG,
      message: configErrors.join('; '),
    };
  }

  return null;
}

export function collectWorkflowActionCapabilityIssues(
  actions: WorkflowActionDef[],
  mode: 'save' | 'activate' | 'execute' | 'preview' = 'save',
): WorkflowActionCapabilityIssue[] {
  const issues: WorkflowActionCapabilityIssue[] = [];
  actions.forEach((action, index) => {
    const { canonicalType, definition } = resolveWorkflowActionType(action.type);
    const issue = issueForDefinition(
      index,
      action.type,
      canonicalType,
      definition,
      mode,
      action.config,
    );
    if (issue) issues.push(issue);
  });
  return issues;
}

export function assertWorkflowActionsCapable(
  actions: WorkflowActionDef[],
  mode: 'save' | 'activate' | 'execute',
): void {
  const issues = collectWorkflowActionCapabilityIssues(actions, mode);
  if (issues.length === 0) return;
  const first = issues[0];
  throw new BadRequestException({
    message: first.message,
    code: first.code,
    issues,
  });
}

export function buildWorkflowActionCapabilityPlan(
  actions: WorkflowActionDef[],
): WorkflowActionCapabilityPlanItem[] {
  return actions.map((action, index) => {
    const { canonicalType, definition } = resolveWorkflowActionType(action.type);
    const issue = issueForDefinition(
      index,
      action.type,
      canonicalType,
      definition,
      'preview',
      action.config,
    );
    const validationErrors = definition
      ? validateActionConfig(definition, action.config)
      : [`Unknown workflow action type: ${action.type}`];

    const wouldExecute =
      !!definition &&
      definition.status === 'AVAILABLE' &&
      definition.handlerRegistered &&
      validationErrors.length === 0;

    return {
      index,
      rawType: action.type,
      canonicalType,
      status: definition?.status ?? 'UNKNOWN',
      handlerRegistered: definition?.handlerRegistered ?? false,
      selectableInUi: definition?.selectableInUi ?? false,
      wouldExecute,
      validationErrors,
      code: issue?.code,
      message: issue?.message,
    };
  });
}

/** Canonical types that may be persisted in workflow definitions. */
export const WORKFLOW_SAVABLE_ACTION_TYPES = REGISTRY.filter(
  (entry) =>
    entry.status === 'AVAILABLE' &&
    entry.handlerRegistered &&
    entry.selectableInUi,
).map((entry) => entry.canonicalType);

export const WORKFLOW_EXECUTABLE_ACTION_TYPES = [...WORKFLOW_SAVABLE_ACTION_TYPES];
