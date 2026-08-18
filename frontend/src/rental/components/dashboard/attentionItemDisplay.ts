import type {
  ActionQueueChildAction,
  ActionQueueGroupItem,
  ActionQueueItem,
  ActionQueueModuleTarget,
} from './dashboardTypes';
import {
  appendObdUnpluggedToHint,
  isTelemetryOfflineAttentionItem,
  shouldShowObdUnpluggedBadge,
} from '../../lib/obd-plug-status';
import { dt } from './dashboard-i18n';

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripHintPrefix(value: string): string {
  return value.replace(/^(hinweis|hint)\s*:\s*/i, '').trim();
}

function containsText(haystack: string | undefined, needle: string | undefined): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  return h.includes(n) || n.includes(h);
}

export function attentionCategoryEyebrow(
  input: {
    category: ActionQueueItem['category'];
    module?: ActionQueueModuleTarget;
    groupType?: ActionQueueItem['groupType'];
  },
  locale: string,
): string {
  if (input.module === 'service_compliance') return dt(locale, 'dashboard.label.service');
  if (input.groupType === 'customer-docs') return dt(locale, 'dashboard.label.documents');
  if (input.category === 'handover' || input.category === 'booking') return dt(locale, 'dashboard.label.booking');
  if (input.category === 'operations') return dt(locale, 'dashboard.label.operations');
  if (input.category === 'task') return dt(locale, 'dashboard.label.task');
  if (input.category === 'health') return dt(locale, 'dashboard.label.health');
  if (input.category === 'vehicle') return dt(locale, 'dashboard.label.telemetry');
  if (input.category === 'notification') return dt(locale, 'dashboard.notifications');
  if (input.category === 'financial') return dt(locale, 'dashboard.label.finance');
  return dt(locale, 'dashboard.label.operations');
}

export interface AttentionRowCopy {
  title: string;
  contextLine?: string;
  hintLine?: string;
}

export function composeAttentionRowCopy(
  title: string,
  parts: {
    entityLabel?: string | null;
    reason?: string | null;
    detail?: string | null;
    subtitle?: string | null;
    recommendedAction?: string | null;
    explanation?: string | null;
  },
): AttentionRowCopy {
  const cleanTitle = stripHintPrefix(title);
  const excluded = new Set([normalizeText(cleanTitle)]);

  const contextCandidates = [
    parts.entityLabel,
    parts.subtitle,
    parts.explanation,
  ]
    .map((value) => (value ? stripHintPrefix(value) : ''))
    .filter((value) => value.length > 0)
    .filter((value) => !containsText(cleanTitle, value));

  const contextLine = contextCandidates.find((value) => !excluded.has(normalizeText(value)));
  if (contextLine) excluded.add(normalizeText(contextLine));

  const hintCandidates = [
    parts.reason,
    parts.detail,
    parts.recommendedAction,
  ]
    .map((value) => (value ? stripHintPrefix(value) : ''))
    .filter((value) => value.length > 0)
    .filter((value) => !containsText(cleanTitle, value))
    .filter((value) => !containsText(contextLine, value))
    .filter((value) => !excluded.has(normalizeText(value)));

  const hintLine = hintCandidates[0];

  return {
    title: cleanTitle,
    contextLine: contextLine || undefined,
    hintLine: hintLine || undefined,
  };
}

export function enrichAttentionCopyWithObdUnplugged(
  copy: AttentionRowCopy,
  item: {
    title: string;
    semanticKey?: string;
    vehicleId?: string;
    reason?: string;
  },
  obdPlugByVehicleId?: Map<string, boolean | null> | null,
): AttentionRowCopy {
  if (!item.vehicleId || !obdPlugByVehicleId) return copy;
  if (!isTelemetryOfflineAttentionItem(item)) return copy;
  if (!shouldShowObdUnpluggedBadge(obdPlugByVehicleId.get(item.vehicleId))) return copy;
  return {
    ...copy,
    hintLine: appendObdUnpluggedToHint(copy.hintLine, true),
  };
}

export function composeAttentionItemCopy(item: ActionQueueItem): AttentionRowCopy {
  return composeAttentionRowCopy(item.title, {
    entityLabel: item.entityLabel,
    reason: item.reason,
    detail: item.detail,
    explanation: item.predictiveInsight?.explanation,
    recommendedAction: item.predictiveInsight?.recommendedAction,
  });
}

export function composeAttentionChildCopy(child: ActionQueueChildAction): AttentionRowCopy {
  return composeAttentionRowCopy(child.title, {
    reason: child.detail,
  });
}

export function composeAttentionGroupCopy(group: ActionQueueGroupItem): AttentionRowCopy {
  return composeAttentionRowCopy(group.title, {
    entityLabel: group.entityLabel,
    subtitle: group.subtitle,
  });
}

export function attentionExpandLabel(total: number, locale: string, isExpanded: boolean): string {
  if (isExpanded) return dt(locale, 'dashboard.attention.showLess');
  if (total === 1) return dt(locale, 'dashboard.attention.showAllOne');
  return dt(locale, 'dashboard.attention.showAllMany', { count: total });
}
