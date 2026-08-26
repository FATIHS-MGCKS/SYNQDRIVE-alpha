/**
 * Operator Task Card row presentation adapter (P2.2.46).
 * Machine task/status/priority/action values stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ApiTask } from '../../lib/api';
import {
  formatTaskDetailDueCompact,
  taskDetailChecklistBlockerLabel,
  taskDetailChecklistProgressLabel,
  taskDetailStatusLabel,
  taskDetailTimingActiveFromLabel,
  taskDetailTimingDueLabel,
  taskDetailUnassignedLabel,
} from '../../lib/tasks/task-detail-presentation-i18n';
import { taskDetailActionLabel } from '../../lib/tasks/task-detail-actions-presentation-i18n';
import type { OperatorTaskCardActionKind } from '../tasks/operatorTaskCard.utils';

export function resolveOperatorTaskCardLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function otc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorTaskCardLocale(locale), key, vars).text;
}

const CARD_ACTION_LABEL_KEYS: Partial<
  Record<OperatorTaskCardActionKind, TranslationKey>
> = {
  start: 'tasks.detail.actions.start',
  resume: 'tasks.detail.actions.resume',
  waiting: 'tasks.detail.actions.moveToWaiting',
  comment: 'tasks.detail.actions.comment',
  'open-task': 'operator.task.card.action.openTask',
  'open-document-package': 'operator.task.card.action.openDocumentPackage',
  'open-invoice': 'operator.task.card.action.openInvoice',
  'open-booking': 'operator.task.card.action.openBooking',
  'open-handover-pickup': 'operator.task.card.action.openHandoverPickup',
  'open-handover-return': 'operator.task.card.action.openHandoverReturn',
  'open-vehicle': 'operator.task.card.action.openVehicle',
  'open-service-case': 'operator.task.card.action.openServiceCase',
};

export function operatorTaskCardActionLabel(
  locale: string,
  kind: OperatorTaskCardActionKind,
): string {
  const key = CARD_ACTION_LABEL_KEYS[kind];
  if (!key) return kind;
  if (
    kind === 'start' ||
    kind === 'resume' ||
    kind === 'waiting' ||
    kind === 'comment'
  ) {
    return taskDetailActionLabel(locale, kind === 'waiting' ? 'moveToWaiting' : kind);
  }
  return otc(locale, key);
}

export function operatorTaskCardOpenAriaLabel(locale: string, title: string): string {
  return otc(locale, 'operator.task.card.openAria', { title });
}

export function operatorTaskCardObjectUnavailableLabel(locale: string): string {
  return otc(locale, 'operator.task.card.objectUnavailable');
}

export function operatorTaskCardOverdueLabel(locale: string): string {
  return otc(locale, 'status.overdue');
}

export function operatorTaskCardStatusLabel(locale: string, status: ApiTask['status']): string {
  return taskDetailStatusLabel(locale, status);
}

export function operatorTaskCardAutoResolvedLabel(locale: string): string {
  return otc(locale, 'tasks.detail.summary.autoResolved');
}

export function operatorTaskCardAssigneePrefix(locale: string): string {
  return otc(locale, 'operator.task.card.assigneePrefix');
}

export function operatorTaskCardAssigneeFallbackLabel(
  locale: string,
  task: Pick<ApiTask, 'assignedUserName' | 'assignedUserId'>,
): string | null {
  if (task.assignedUserName?.trim()) return task.assignedUserName.trim();
  if (task.assignedUserId) return otc(locale, 'operator.task.card.assigneeAssigned');
  return taskDetailUnassignedLabel(locale);
}

export function operatorTaskCardChecklistTitle(locale: string): string {
  return otc(locale, 'operator.task.card.checklist');
}

export function operatorTaskCardChecklistRequiredLabel(
  locale: string,
  completed: number,
  total: number,
): string {
  return otc(locale, 'operator.task.card.checklistRequired', { completed, total });
}

export function operatorTaskCardChecklistBlockerLabel(locale: string): string {
  return taskDetailChecklistBlockerLabel(locale, []);
}

export function operatorTaskCardTimingLabel(
  locale: string,
  task: Pick<ApiTask, 'dueDate' | 'activatesAt' | 'isOverdue'>,
  isActivated: boolean,
): { label: string | null; warn: boolean } {
  if (task.dueDate) {
    const formatted = formatTaskDetailDueCompact(locale, task.dueDate);
    return {
      label: formatted ? taskDetailTimingDueLabel(locale, formatted) : null,
      warn: task.isOverdue,
    };
  }

  if (task.activatesAt && !isActivated) {
    const formatted = formatTaskDetailDueCompact(locale, task.activatesAt);
    return {
      label: formatted ? taskDetailTimingActiveFromLabel(locale, formatted) : null,
      warn: false,
    };
  }

  return { label: null, warn: false };
}

export function operatorTaskCardChecklistProgressLabel(
  locale: string,
  completed: number,
  total: number,
): string {
  return taskDetailChecklistProgressLabel(locale, completed, total);
}

export function operatorTaskCardDisabledUnavailable(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.unavailable');
}

export function operatorTaskCardDisabledTerminal(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.terminal');
}

export function operatorTaskCardDisabledNotActive(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.notActive');
}

export function operatorTaskCardDisabledStartOpenOnly(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.startOpenOnly');
}

export function operatorTaskCardDisabledAlreadyWaiting(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.alreadyWaiting');
}

export function operatorTaskCardDisabledWaitingOpenOrProgress(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.waitingOpenOrProgress');
}

export function operatorTaskCardDisabledResumeWaitingOnly(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.resumeWaitingOnly');
}

export function operatorTaskCardDisabledChecklistBlocked(locale: string): string {
  return otc(locale, 'tasks.detail.validation.blockedByChecklist');
}

export function operatorTaskCardDisabledOverrideChecklistOnly(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.overrideChecklistOnly');
}

export function operatorTaskCardDisabledNoOverridePermission(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.noOverridePermission');
}

export function operatorTaskCardDisabledNoDocumentPackage(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.noDocumentPackage');
}

export function operatorTaskCardDisabledNoInvoice(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.noInvoice');
}

export function operatorTaskCardDisabledNoBooking(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.noBooking');
}

export function operatorTaskCardDisabledNoVehicle(locale: string): string {
  return otc(locale, 'operator.task.card.disabled.noVehicle');
}
