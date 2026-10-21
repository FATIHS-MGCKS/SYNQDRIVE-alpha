import type { TranslationKey } from '../../../i18n/translations/en';
import type {
  WorkflowActionDto,
  WorkflowConditionDto,
  WorkflowDto,
  WorkflowListItemDto,
} from '../../../lib/api';
import type {
  WorkflowCatalogDto,
  WorkflowConditionGroupForm,
  WorkflowConditionRuleForm,
  WorkflowConfigFieldErrors,
  WorkflowConfigFormState,
  WorkflowConfigImpactSummary,
} from './workflow-config.types';
import { assessWorkflowRiskFromActions } from './workflow-config.risk';

const SECRET_KEY_PATTERN = /secret|token|password|apikey|api_key|credential/i;
const RECIPIENT_KEY_PATTERN = /email|phone|e164|recipient|to|mobile/i;

type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

let ruleIdCounter = 0;
function nextId(prefix: string) {
  ruleIdCounter += 1;
  return `${prefix}-${ruleIdCounter}`;
}

export function createEmptyWorkflowConfigForm(): WorkflowConfigFormState {
  return {
    name: '',
    description: '',
    category: 'vehicle_return',
    triggerType: 'booking.returned',
    triggerConfig: {},
    scopeType: 'organization',
    scopeStationIds: '',
    scopeVehicleIds: '',
    conditionGroup: { match: 'all', negate: false, rules: [] },
    actions: [{ id: nextId('action'), type: 'task.create', config: { priority: 'NORMAL' } }],
    changeReason: '',
    status: 'DRAFT',
  };
}

export function parseConditionsFromApi(raw: unknown): WorkflowConditionGroupForm {
  if (Array.isArray(raw)) {
    return {
      match: 'all',
      negate: false,
      rules: raw.map((item) => ruleFromApi(item as WorkflowConditionDto)),
    };
  }
  if (raw && typeof raw === 'object') {
    const group = raw as {
      match?: 'all' | 'any';
      negate?: boolean;
      rules?: WorkflowConditionDto[];
      all?: WorkflowConditionDto[];
      any?: WorkflowConditionDto[];
    };
    const rules = group.rules ?? group.all ?? group.any ?? [];
    return {
      match: group.match ?? (Array.isArray(group.any) ? 'any' : 'all'),
      negate: Boolean(group.negate),
      rules: rules.map((item) => ruleFromApi(item)),
    };
  }
  return { match: 'all', negate: false, rules: [] };
}

function ruleFromApi(item: WorkflowConditionDto): WorkflowConditionRuleForm {
  return {
    id: nextId('cond'),
    field: item.field ?? item.path?.replace(/^payload\./, '') ?? 'vehicle_status',
    operator: item.operator ?? 'equals',
    value: item.value == null ? '' : String(item.value),
  };
}

export function serializeConditionsForApi(group: WorkflowConditionGroupForm): unknown {
  const rules: WorkflowConditionDto[] = group.rules.map((rule) => ({
    field: rule.field,
    operator: rule.operator,
    value: parseConditionValue(rule),
  }));
  if (group.match === 'all' && !group.negate && rules.length > 0) {
    return rules;
  }
  return {
    match: group.match,
    negate: group.negate,
    rules,
  };
}

function parseConditionValue(rule: WorkflowConditionRuleForm): unknown {
  if (rule.operator === 'exists') return undefined;
  const fieldMeta = rule.field;
  if (['health_score', 'mileage', 'days_since_last_service', 'invoice_amount', 'overdue_days'].includes(fieldMeta)) {
    if (rule.value.trim() === '') return null;
    const parsed = Number(rule.value);
    return Number.isFinite(parsed) ? parsed : rule.value;
  }
  if (rule.operator === 'is_true') return true;
  if (rule.operator === 'is_false') return false;
  return rule.value;
}

export function buildFormFromWorkflow(
  workflow: WorkflowDto | WorkflowListItemDto,
): WorkflowConfigFormState {
  const trigger = workflow.trigger as { type?: string; config?: Record<string, unknown> };
  const scope = workflow.scope as { type?: string; stationIds?: string[]; vehicleIds?: string[] };
  const actions = Array.isArray(workflow.actions) ? workflow.actions : [];

  return {
    name: workflow.name,
    description: workflow.description ?? '',
    category: workflow.category,
    triggerType: trigger?.type ?? 'booking.returned',
    triggerConfig: stringifyConfig(trigger?.config ?? {}),
    scopeType: scope?.type ?? 'organization',
    scopeStationIds: (scope?.stationIds ?? []).join(', '),
    scopeVehicleIds: (scope?.vehicleIds ?? []).join(', '),
    conditionGroup: parseConditionsFromApi(workflow.conditions),
    actions: actions.map((action) => {
      const typed = action as WorkflowActionDto;
      return {
        id: nextId('action'),
        type: typed.type,
        config: stringifyConfig(typed.config ?? {}),
        requiresApproval: typed.requiresApproval,
      };
    }),
    changeReason: '',
    status:
      workflow.status === 'ACTIVE' || workflow.status === 'DISABLED'
        ? workflow.status
        : 'DRAFT',
  };
}

function stringifyConfig(config: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value == null) continue;
    result[key] = String(value);
  }
  return result;
}

export function buildWorkflowPayload(
  form: WorkflowConfigFormState,
  intent: 'draft' | 'publish' | 'activate',
) {
  const status =
    intent === 'draft' ? 'DRAFT' : intent === 'activate' ? 'ACTIVE' : form.status;
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    category: form.category,
    trigger: {
      type: form.triggerType,
      config: parseActionConfig(form.triggerConfig),
    },
    conditions: serializeConditionsForApi(form.conditionGroup) as WorkflowConditionDto[],
    actions: form.actions.map((action) => ({
      type: action.type,
      config: parseActionConfig(action.config),
      ...(action.requiresApproval ? { requiresApproval: true } : {}),
    })),
    scope: {
      type: form.scopeType,
      ...(form.scopeType === 'station'
        ? { stationIds: splitIds(form.scopeStationIds) }
        : {}),
      ...(form.scopeType === 'vehicle'
        ? { vehicleIds: splitIds(form.scopeVehicleIds) }
        : {}),
    },
    status,
    ...(form.changeReason.trim() ? { activationReason: form.changeReason.trim() } : {}),
  };
}

function splitIds(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseActionConfig(config: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value.trim() === '') continue;
    if (['priority', 'severity', 'status', 'target', 'channel', 'title', 'message'].includes(key)) {
      result[key] = value;
      continue;
    }
    if (key.endsWith('Minutes') || key.endsWith('Days') || key === 'threshold') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) result[key] = parsed;
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function validateWorkflowConfigForm(
  form: WorkflowConfigFormState,
  catalog: WorkflowCatalogDto | null,
  t: TFunction,
  options?: { requireChangeReason?: boolean; isPublish?: boolean },
): WorkflowConfigFieldErrors {
  const errors: WorkflowConfigFieldErrors = {};
  if (!form.name.trim()) {
    errors.name = t('workflowAutomation.editor.errors.nameRequired');
  } else if (form.name.trim().length > 200) {
    errors.name = t('workflowAutomation.editor.errors.nameTooLong');
  }
  if (!form.category) errors.category = t('workflowAutomation.editor.errors.categoryRequired');
  if (!form.triggerType) errors.triggerType = t('workflowAutomation.editor.errors.triggerRequired');
  if (!catalog?.triggers.some((trigger) => trigger.type === form.triggerType)) {
    errors.triggerType = t('workflowAutomation.editor.errors.triggerUnavailable');
  }
  if (!form.actions.length) {
    errors.actions = t('workflowAutomation.editor.errors.actionRequired');
  }
  const unavailable = form.actions.filter(
    (action) => !catalog?.actions.some((item) => item.type === action.type),
  );
  if (unavailable.length > 0) {
    errors.actions = t('workflowAutomation.editor.errors.actionUnavailable');
  }
  for (const rule of form.conditionGroup.rules) {
    if (!rule.field || !rule.operator) {
      errors.conditions = t('workflowAutomation.editor.errors.conditionIncomplete');
      break;
    }
    const fieldMeta = catalog?.conditionFields.find((field) => field.key === rule.field);
    if (fieldMeta?.dataType === 'number' && rule.operator !== 'exists' && rule.value.trim() !== '') {
      const parsed = Number(rule.value);
      if (!Number.isFinite(parsed)) {
        rule.valueError = t('workflowAutomation.editor.errors.numberInvalid');
        errors.conditions = t('workflowAutomation.editor.errors.conditionInvalid');
      } else {
        if (fieldMeta.min != null && parsed < fieldMeta.min) {
          rule.valueError = t('workflowAutomation.editor.errors.numberMin', { min: fieldMeta.min });
          errors.conditions = t('workflowAutomation.editor.errors.conditionInvalid');
        }
        if (fieldMeta.max != null && parsed > fieldMeta.max) {
          rule.valueError = t('workflowAutomation.editor.errors.numberMax', { max: fieldMeta.max });
          errors.conditions = t('workflowAutomation.editor.errors.conditionInvalid');
        }
      }
    }
  }
  if (options?.requireChangeReason && !form.changeReason.trim()) {
    errors.changeReason = t('workflowAutomation.editor.errors.changeReasonRequired');
  }
  if (options?.isPublish && form.actions.length === 0) {
    errors.actions = t('workflowAutomation.editor.errors.actionRequired');
  }
  return errors;
}

export function isWorkflowConfigDirty(
  baseline: WorkflowConfigFormState,
  current: WorkflowConfigFormState,
): boolean {
  return JSON.stringify(baseline) !== JSON.stringify(current);
}

export function buildImpactSummary(
  form: WorkflowConfigFormState,
  catalog: WorkflowCatalogDto | null,
  t: TFunction,
): WorkflowConfigImpactSummary {
  const riskClass = assessWorkflowRiskFromActions(form.actions);
  const approvalActionCount = form.actions.filter(
    (action) =>
      catalog?.actions.find((item) => item.type === action.type)?.requiresApproval
      || action.requiresApproval,
  ).length;
  const unavailableActionCount = form.actions.filter(
    (action) => !catalog?.actions.some((item) => item.type === action.type),
  ).length;
  const triggerKey = `workflowAutomation.trigger.${form.triggerType}` as TranslationKey;
  const triggerLabel = t(triggerKey);
  return {
    riskClass,
    requiresPublishApproval: riskClass === 'HIGH' || riskClass === 'CRITICAL',
    approvalActionCount,
    unavailableActionCount,
    triggerLabel: triggerLabel !== triggerKey ? triggerLabel : form.triggerType,
    actionCount: form.actions.length,
    conditionCount: form.conditionGroup.rules.length,
  };
}

export function maskRecipientValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    const [user, domain] = trimmed.split('@');
    if (!domain) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (/^\+?\d[\d\s-]{4,}$/.test(trimmed)) {
    return trimmed.replace(/\d(?=\d{2})/g, '*');
  }
  return trimmed.length <= 4 ? '****' : `${trimmed.slice(0, 2)}***`;
}

export function sanitizeConfigForDisplay(
  config: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!config) return result;
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = '••••••••';
      continue;
    }
    const asString = value == null ? '' : String(value);
    result[key] = RECIPIENT_KEY_PATTERN.test(key) ? maskRecipientValue(asString) : asString;
  }
  return result;
}

export function isSystemFieldEditable(
  field: string,
  sourceType: 'custom' | 'system' | 'migrated',
  catalog: WorkflowCatalogDto | null,
): boolean {
  if (sourceType !== 'system') return true;
  return catalog?.systemTemplateEditableFields.includes(field as 'enabled' | 'description') ?? false;
}

export function parseBoundedNumberInput(
  raw: string,
  options?: { min?: number; max?: number },
): { value: string; error?: string } {
  if (raw.trim() === '') return { value: '' };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { value: raw, error: 'invalid' };
  if (options?.min != null && parsed < options.min) return { value: raw, error: 'min' };
  if (options?.max != null && parsed > options.max) return { value: raw, error: 'max' };
  return { value: String(parsed) };
}

export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
