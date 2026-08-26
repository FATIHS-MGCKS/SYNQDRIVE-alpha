import type {
  ApiTask,
  ApiTaskDetail,
  ApiTaskPriority,
  ApiTaskStatus,
  ApiTaskType,
  TaskActionAvailability,
  TaskAvailableActions,
  TaskChecklistProgress,
} from '../../lib/api';
import { isTerminalTaskStatus } from '../../rental/lib/task-detail.utils';
import {
  operatorTaskCardActionLabel,
  operatorTaskCardAssigneeFallbackLabel,
  operatorTaskCardChecklistBlockerLabel,
  operatorTaskCardDisabledAlreadyWaiting,
  operatorTaskCardDisabledChecklistBlocked,
  operatorTaskCardDisabledNoBooking,
  operatorTaskCardDisabledNoDocumentPackage,
  operatorTaskCardDisabledNoInvoice,
  operatorTaskCardDisabledNoOverridePermission,
  operatorTaskCardDisabledNoVehicle,
  operatorTaskCardDisabledNotActive,
  operatorTaskCardDisabledOverrideChecklistOnly,
  operatorTaskCardDisabledResumeWaitingOnly,
  operatorTaskCardDisabledStartOpenOnly,
  operatorTaskCardDisabledTerminal,
  operatorTaskCardDisabledUnavailable,
  operatorTaskCardDisabledWaitingOpenOrProgress,
  operatorTaskCardTimingLabel,
} from '../lib/operator-task-card-i18n';
import {
  buildOperatorTaskDisplayModel,
  type FleetVehicleLookup,
} from './operatorTaskDisplay.utils';

export type OperatorTaskCardActionKind =
  | 'start'
  | 'resume'
  | 'complete'
  | 'waiting'
  | 'comment'
  | 'open-task'
  | 'open-booking'
  | 'open-handover-pickup'
  | 'open-handover-return'
  | 'open-invoice'
  | 'open-document-package'
  | 'open-vehicle'
  | 'open-service-case';

export interface OperatorTaskCardAction {
  kind: OperatorTaskCardActionKind;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  emphasis: 'primary' | 'secondary';
}

export interface OperatorTaskCardChecklistModel {
  requiredItems: number;
  completedRequiredItems: number;
  progressPercent: number | null;
  blocked: boolean;
  blockerLabel: string | null;
}

export interface OperatorTaskCardModel {
  title: string;
  objectLine: string | null;
  objectUnavailable: boolean;
  status: ApiTaskStatus;
  isOverdue: boolean;
  showPriority: boolean;
  priority: ApiTaskPriority;
  timingLabel: string | null;
  timingWarn: boolean;
  assigneeLabel: string | null;
  checklist: OperatorTaskCardChecklistModel | null;
  autoResolved: boolean;
  terminal: boolean;
}

export interface OperatorTaskCardActionPlan {
  primary: OperatorTaskCardAction | null;
  secondaries: OperatorTaskCardAction[];
}

function availability(
  locale: string,
  enabled: boolean,
  disabledReasonWhenFalse?: string,
  forcedDisabledReason?: string,
): TaskActionAvailability {
  if (enabled) return { enabled: true };
  return {
    enabled: false,
    disabledReason:
      forcedDisabledReason ??
      disabledReasonWhenFalse ??
      operatorTaskCardDisabledUnavailable(locale),
  };
}

function inferChecklistProgress(task: ApiTask): TaskChecklistProgress {
  if (task.checklistProgress) return task.checklistProgress;

  const items = task.checklist ?? [];
  if (items.length === 0) {
    return {
      totalItems: 0,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
      remainingRequiredItems: 0,
      progressPercent: null,
      hasChecklist: false,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    };
  }

  const requiredItems = items.filter((item) => item.isRequired);
  const completedRequiredItems = requiredItems.filter((item) => item.isDone).length;
  const remainingRequiredItems = Math.max(0, requiredItems.length - completedRequiredItems);
  const terminal = isTerminalTaskStatus(task.status);
  const blocked = !terminal && remainingRequiredItems > 0;

  return {
    totalItems: items.length,
    completedItems: items.filter((item) => item.isDone).length,
    requiredItems: requiredItems.length,
    completedRequiredItems,
    remainingRequiredItems,
    progressPercent:
      requiredItems.length > 0
        ? Math.round((completedRequiredItems / requiredItems.length) * 100)
        : null,
    hasChecklist: true,
    areRequiredItemsComplete: remainingRequiredItems === 0,
    canCompleteByChecklist: !blocked,
    completionBlockers: blocked ? ['REQUIRED_CHECKLIST_ITEMS_OPEN'] : [],
  };
}

export function isTaskActivated(task: ApiTask, now = new Date()): boolean {
  if (!task.activatesAt) return true;
  const activatesAt = new Date(task.activatesAt);
  if (Number.isNaN(activatesAt.getTime())) return true;
  return activatesAt.getTime() <= now.getTime();
}

export function shouldShowOperatorTaskPriority(task: ApiTask): boolean {
  return task.priority === 'CRITICAL' || task.priority === 'HIGH' || task.isOverdue;
}

export function resolveOperatorTaskTimingLabel(
  task: ApiTask,
  locale: string,
  now = new Date(),
): {
  label: string | null;
  warn: boolean;
} {
  return operatorTaskCardTimingLabel(locale, task, isTaskActivated(task, now));
}

export function resolveOperatorTaskObjectLine(
  task: ApiTask,
  vehicleById?: Map<string, FleetVehicleLookup>,
): { line: string | null; unavailable: boolean } {
  const hasUnavailableOnly =
    Boolean(task.linkedObjects?.length) &&
    !task.linkedObjects?.some((row) => row.isAvailable);
  if (hasUnavailableOnly) {
    return { line: null, unavailable: true };
  }

  const display = buildOperatorTaskDisplayModel(task, { vehicleById });
  const parts = [display.vehicleLine, display.bookingLine].filter(Boolean);
  if (parts.length > 0) {
    return { line: parts.join(' · '), unavailable: false };
  }

  const linked = task.linkedObjects?.find((row) => row.isAvailable)?.primaryLabel?.trim();
  if (linked) return { line: linked, unavailable: false };

  if (task.vehicleId || task.bookingId || task.invoiceId || task.serviceCaseId) {
    return { line: null, unavailable: true };
  }

  return { line: null, unavailable: false };
}

export function resolveOperatorTaskAssigneeLabel(task: ApiTask, locale: string): string | null {
  return operatorTaskCardAssigneeFallbackLabel(locale, task);
}

export function buildOperatorTaskCardModel(
  task: ApiTask,
  options?: { vehicleById?: Map<string, FleetVehicleLookup>; now?: Date; locale?: string },
): OperatorTaskCardModel {
  const locale = options?.locale ?? 'de';
  const now = options?.now ?? new Date();
  const object = resolveOperatorTaskObjectLine(task, options?.vehicleById);
  const timing = resolveOperatorTaskTimingLabel(task, locale, now);
  const progress = inferChecklistProgress(task);
  const checklist =
    progress.hasChecklist && progress.requiredItems > 0
      ? {
          requiredItems: progress.requiredItems,
          completedRequiredItems: progress.completedRequiredItems,
          progressPercent: progress.progressPercent,
          blocked: !progress.canCompleteByChecklist,
          blockerLabel: progress.canCompleteByChecklist
            ? null
            : operatorTaskCardChecklistBlockerLabel(locale),
        }
      : null;

  return {
    title: task.title,
    objectLine: object.line,
    objectUnavailable: object.unavailable,
    status: task.status,
    isOverdue: task.isOverdue,
    showPriority: shouldShowOperatorTaskPriority(task),
    priority: task.priority,
    timingLabel: timing.label,
    timingWarn: timing.warn,
    assigneeLabel: resolveOperatorTaskAssigneeLabel(task, locale),
    checklist,
    autoResolved: task.completionMode === 'AUTO_RESOLVED',
    terminal: isTerminalTaskStatus(task.status),
  };
}

export function readTaskAvailableActions(
  task: ApiTask,
  canOverrideChecklist: boolean,
  locale: string,
  now = new Date(),
): TaskAvailableActions {
  const detailActions = (task as ApiTaskDetail).availableActions;
  if (detailActions) return detailActions;
  return inferTaskAvailableActions(task, canOverrideChecklist, locale, now);
}

export function inferTaskAvailableActions(
  task: ApiTask,
  canOverrideChecklist: boolean,
  locale: string,
  now = new Date(),
): TaskAvailableActions {
  const terminal = isTerminalTaskStatus(task.status);
  const disabledTerminal = availability(locale, false, operatorTaskCardDisabledTerminal(locale));
  if (terminal) {
    return {
      start: disabledTerminal,
      moveToWaiting: disabledTerminal,
      resume: disabledTerminal,
      complete: disabledTerminal,
      cancel: disabledTerminal,
      comment: { enabled: true },
      overrideCompletion: disabledTerminal,
    };
  }

  const activatesAt = task.activatesAt ? new Date(task.activatesAt) : null;
  const notYetActive = activatesAt != null && !Number.isNaN(activatesAt.getTime()) && activatesAt > now;
  const progress = inferChecklistProgress(task);
  const checklistBlocked =
    !progress.canCompleteByChecklist && progress.completionBlockers.length > 0;
  const disabledNotActive = availability(
    locale,
    false,
    operatorTaskCardDisabledNotActive(locale),
  );

  const completeBlockers: string[] = [];
  if (notYetActive) completeBlockers.push(operatorTaskCardDisabledNotActive(locale));
  if (checklistBlocked && !canOverrideChecklist) {
    completeBlockers.push(operatorTaskCardDisabledChecklistBlocked(locale));
  }

  return {
    start: availability(
      locale,
      task.status === 'OPEN' && !notYetActive,
      task.status !== 'OPEN'
        ? operatorTaskCardDisabledStartOpenOnly(locale)
        : undefined,
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    moveToWaiting: availability(
      locale,
      (task.status === 'OPEN' || task.status === 'IN_PROGRESS') && !notYetActive,
      task.status === 'WAITING'
        ? operatorTaskCardDisabledAlreadyWaiting(locale)
        : operatorTaskCardDisabledWaitingOpenOrProgress(locale),
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    resume: availability(
      locale,
      task.status === 'WAITING' && !notYetActive,
      task.status !== 'WAITING'
        ? operatorTaskCardDisabledResumeWaitingOnly(locale)
        : undefined,
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    complete: availability(locale, completeBlockers.length === 0, completeBlockers[0]),
    cancel: availability(locale, !notYetActive, disabledNotActive.disabledReason),
    comment: { enabled: true },
    overrideCompletion: availability(
      locale,
      checklistBlocked && canOverrideChecklist,
      !checklistBlocked
        ? operatorTaskCardDisabledOverrideChecklistOnly(locale)
        : operatorTaskCardDisabledNoOverridePermission(locale),
    ),
  };
}

function action(
  locale: string,
  kind: OperatorTaskCardActionKind,
  enabled: boolean,
  emphasis: OperatorTaskCardAction['emphasis'],
  disabledReason?: string,
): OperatorTaskCardAction {
  return {
    kind,
    label: operatorTaskCardActionLabel(locale, kind),
    enabled,
    emphasis,
    disabledReason,
  };
}

function resolveTypePrimaryAction(
  task: ApiTask,
  available: TaskAvailableActions,
  locale: string,
): OperatorTaskCardAction | null {
  if (!isTaskActivated(task)) return null;

  switch (task.type as ApiTaskType) {
    case 'DOCUMENT_REVIEW':
      return action(
        locale,
        'open-document-package',
        Boolean(task.bookingId || task.documentId),
        'primary',
        operatorTaskCardDisabledNoDocumentPackage(locale),
      );
    case 'INVOICE_REQUIRED':
      return action(
        locale,
        'open-invoice',
        Boolean(task.invoiceId),
        'primary',
        operatorTaskCardDisabledNoInvoice(locale),
      );
    case 'BOOKING_PREPARATION':
      return action(
        locale,
        'open-booking',
        Boolean(task.bookingId),
        'primary',
        operatorTaskCardDisabledNoBooking(locale),
      );
    case 'BOOKING_PICKUP':
      return action(
        locale,
        'open-handover-pickup',
        Boolean(task.bookingId),
        'primary',
        operatorTaskCardDisabledNoBooking(locale),
      );
    case 'BOOKING_RETURN':
      return action(
        locale,
        'open-handover-return',
        Boolean(task.bookingId),
        'primary',
        operatorTaskCardDisabledNoBooking(locale),
      );
    case 'VEHICLE_SERVICE':
      if (task.serviceCaseId) {
        return action(locale, 'open-service-case', true, 'primary');
      }
      return action(
        locale,
        'open-vehicle',
        Boolean(task.vehicleId),
        'primary',
        operatorTaskCardDisabledNoVehicle(locale),
      );
    default:
      if (task.status === 'IN_PROGRESS' && !available.complete.enabled) {
        return action(locale, 'open-task', true, 'primary');
      }
      return null;
  }
}

function resolveStatusPrimaryAction(
  task: ApiTask,
  available: TaskAvailableActions,
  locale: string,
): OperatorTaskCardAction | null {
  if (!isTaskActivated(task)) {
    return action(locale, 'open-task', true, 'primary');
  }

  if (task.status === 'WAITING') {
    return action(
      locale,
      'resume',
      available.resume.enabled,
      'primary',
      available.resume.disabledReason,
    );
  }

  if (task.status === 'OPEN') {
    return action(
      locale,
      'start',
      available.start.enabled,
      'primary',
      available.start.disabledReason,
    );
  }

  if (task.status === 'IN_PROGRESS') {
    return action(locale, 'open-task', true, 'primary');
  }

  return action(locale, 'open-task', true, 'primary');
}

export function buildOperatorTaskCardActionPlan(
  task: ApiTask,
  options?: { canOverrideChecklist?: boolean; now?: Date; locale?: string },
): OperatorTaskCardActionPlan {
  const locale = options?.locale ?? 'de';
  const now = options?.now ?? new Date();
  const terminal = isTerminalTaskStatus(task.status);
  if (terminal || task.completionMode === 'AUTO_RESOLVED') {
    return { primary: null, secondaries: [] };
  }

  const available = readTaskAvailableActions(
    task,
    options?.canOverrideChecklist ?? false,
    locale,
    now,
  );
  const primary =
    resolveTypePrimaryAction(task, available, locale) ??
    resolveStatusPrimaryAction(task, available, locale);
  const secondaries: OperatorTaskCardAction[] = [];

  const addSecondary = (candidate: OperatorTaskCardAction | null) => {
    if (!candidate || !candidate.enabled) return;
    if (primary?.kind === candidate.kind) return;
    if (secondaries.some((row) => row.kind === candidate.kind)) return;
    secondaries.push(candidate);
  };

  if (primary?.kind !== 'complete') {
    addSecondary(action(locale, 'open-task', true, 'secondary'));
  }

  addSecondary(
    action(
      locale,
      'waiting',
      available.moveToWaiting.enabled,
      'secondary',
      available.moveToWaiting.disabledReason,
    ),
  );

  addSecondary(
    action(
      locale,
      'comment',
      available.comment.enabled,
      'secondary',
      available.comment.disabledReason,
    ),
  );

  return {
    primary,
    secondaries: secondaries.filter((row) => row.enabled).slice(0, 2),
  };
}
