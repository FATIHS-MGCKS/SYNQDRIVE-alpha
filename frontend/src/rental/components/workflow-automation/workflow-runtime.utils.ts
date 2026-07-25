import type { TranslationKey } from '../../i18n/translations/en';
import type { WorkflowListItemDto } from '../../../lib/api';
import type { WorkflowRuntimeFilter } from './workflow-runtime.types';

type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function workflowStatusTone(
  status: string,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DRAFT':
      return 'warning';
    case 'PENDING_ACTIVATION':
      return 'info';
    case 'INVALID':
      return 'critical';
    case 'ARCHIVED':
    case 'DISABLED':
    default:
      return 'neutral';
  }
}

export function workflowStatusLabel(status: string, t: TFunction): string {
  const key = `workflowAutomation.status.${status}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return status;
}

export function workflowRiskLabel(riskClass: string, t: TFunction): string {
  const key = `workflowAutomation.risk.${riskClass}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return riskClass;
}

export function workflowRiskTone(
  riskClass: string,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch (riskClass) {
    case 'LOW':
      return 'success';
    case 'HIGH':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function workflowApprovalLabel(approvalStatus: string, t: TFunction): string {
  const key = `workflowAutomation.approval.${approvalStatus}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return approvalStatus;
}

export function workflowApprovalTone(
  approvalStatus: string,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch (approvalStatus) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'none':
    default:
      return 'neutral';
  }
}

export function workflowSourceLabel(sourceType: string, t: TFunction): string {
  const key = `workflowAutomation.source.${sourceType}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return sourceType;
}

export function workflowLastRunTone(
  outcome: string | null | undefined,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch (outcome) {
    case 'success':
      return 'success';
    case 'partial':
      return 'warning';
    case 'policy_blocked':
      return 'info';
    case 'failed':
      return 'critical';
    case 'waiting_approval':
      return 'info';
    default:
      return 'neutral';
  }
}

export function workflowLastRunOutcomeLabel(
  outcome: string | null | undefined,
  t: TFunction,
): string {
  if (!outcome || outcome === 'none') return t('workflowAutomation.lastRun.none');
  const key = `workflowAutomation.lastRun.${outcome}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return outcome;
}

export function workflowTriggerSummary(item: WorkflowListItemDto, t: TFunction): string {
  const trigger = item.trigger as { type?: string; event?: string } | null | undefined;
  const type = trigger?.type ?? trigger?.event ?? '';
  if (!type) return t('workflowAutomation.trigger.unknown');
  const key = `workflowAutomation.trigger.${type}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return type.replace(/_/g, ' ');
}

export function workflowActionSummary(item: WorkflowListItemDto, t: TFunction): string {
  const actions = Array.isArray(item.actions) ? item.actions : [];
  if (actions.length === 0) return t('workflowAutomation.actions.none');
  const types = actions
    .map((a) => {
      const action = a as { type?: string };
      const type = action.type ?? '';
      const key = `workflowAutomation.actionType.${type}` as TranslationKey;
      const translated = t(key);
      return translated !== key ? translated : type.replace(/_/g, ' ');
    })
    .filter(Boolean);
  if (types.length <= 2) return types.join(', ');
  return t('workflowAutomation.actions.more', { count: types.length - 2, shown: types.slice(0, 2).join(', ') });
}

export function workflowConditionSummary(item: WorkflowListItemDto, t: TFunction): string {
  const conditions = item.conditions as { all?: unknown[]; any?: unknown[] } | unknown[] | null | undefined;
  let count = 0;
  if (Array.isArray(conditions)) {
    count = conditions.length;
  } else if (conditions && typeof conditions === 'object') {
    count =
      (Array.isArray(conditions.all) ? conditions.all.length : 0) +
      (Array.isArray(conditions.any) ? conditions.any.length : 0);
  }
  if (count === 0) return t('workflowAutomation.conditions.none');
  return t('workflowAutomation.conditions.count', { count });
}

export function matchesWorkflowFilter(
  item: WorkflowListItemDto,
  filter: WorkflowRuntimeFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return item.status === 'ACTIVE';
    case 'disabled':
      return item.status === 'DISABLED';
    case 'draft':
      return item.status === 'DRAFT';
    case 'pending_approval':
      return item.approvalStatus === 'pending' || item.status === 'PENDING_ACTIVATION';
    case 'archived':
      return item.status === 'ARCHIVED';
    case 'invalid':
      return item.status === 'INVALID' || item.unavailableActionCount > 0;
    case 'system_template':
      return item.sourceType === 'system';
    default:
      return true;
  }
}

export function filterWorkflowItems(
  items: WorkflowListItemDto[],
  filter: WorkflowRuntimeFilter,
  search: string,
  t: TFunction,
): WorkflowListItemDto[] {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesWorkflowFilter(item, filter)) return false;
    if (!q) return true;
    const haystack = [
      item.name,
      item.description ?? '',
      workflowTriggerSummary(item, t),
      item.lastRunLabel ?? '',
      workflowSourceLabel(item.sourceType, t),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export const WORKFLOW_RUNTIME_FILTERS: WorkflowRuntimeFilter[] = [
  'all',
  'active',
  'disabled',
  'draft',
  'pending_approval',
  'archived',
  'invalid',
  'system_template',
];

export function formatWorkflowRelativeTime(
  dateStr: string | null | undefined,
  locale: string,
): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return locale.startsWith('de') ? 'gerade eben' : 'just now';
  if (mins < 60) return locale.startsWith('de') ? `vor ${mins} Min.` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale.startsWith('de') ? `vor ${hrs} Std.` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return locale.startsWith('de') ? `vor ${days} T.` : `${days}d ago`;
  return d.toLocaleDateString(locale.startsWith('de') ? 'de-DE' : 'en-GB');
}

export function parseApiError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Request failed';
}
