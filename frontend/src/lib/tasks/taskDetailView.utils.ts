import type { SupportedLocale } from '../../i18n/locales';
import type { TimelineItem } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns/status-utils';
import {
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskStatusTone,
} from '../../rental/lib/task-detail.utils';
import { shortTaskId } from '../../rental/lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../rental/lib/task-display.utils';
import {
  formatTaskDetailDate,
  formatTaskDetailDateTime,
  formatTaskDetailDueCompact,
  taskDetailEmDash,
  taskDetailLinkedObjectTypeLabel,
  taskDetailStatusLabel,
  taskDetailTimingActiveFromLabel,
  taskDetailTimingDueLabel,
  taskDetailTypeLabel,
  taskDetailUnassignedLabel,
  tdp,
} from './task-detail-presentation-i18n';
import { buildTaskDetailChecklistModel, type TaskDetailChecklistModel } from './taskDetailChecklist.utils';
import { buildTaskCommentAuthorLabel, buildTaskTimelineItems } from './taskTimeline.utils';
import type {
  ApiTask,
  ApiTaskDetail,
  ApiTaskPriority,
  ApiTaskStatus,
  TaskChecklistProgress,
  TaskLinkedObject,
  TaskNextActionType,
} from './types';

export type { TaskDetailChecklistModel } from './taskDetailChecklist.utils';

export interface TaskDetailViewMember {
  id: string;
  name: string;
}

export interface TaskDetailViewModelOptions {
  locale: SupportedLocale;
  eyebrow?: string | null;
  subtitle?: string | null;
  category?: string | null;
  priorityLabel?: string | null;
  orgMembers?: TaskDetailViewMember[];
  stationLabel?: string | null;
  now?: Date;
}

export interface TaskDetailHeaderModel {
  title: string;
  eyebrow: string | null;
  subtitle: string | null;
  status: ApiTaskStatus;
  statusLabel: string;
  statusTone: StatusTone;
  priority: ApiTaskPriority;
  priorityLabel: string;
  showPriority: boolean;
  timingLabel: string | null;
  timingWarn: boolean;
  category: string | null;
}

export interface TaskDetailReasonModel {
  headline: string;
  description: string;
  basis: string | null;
  detectedAtLabel: string | null;
  humanReadableSource: string;
}

export interface TaskDetailNextStepModel {
  label: string;
  description: string | null;
  actionType: TaskNextActionType;
  enabled: boolean;
  disabledReason: string | null;
  primaryActionLabel: string | null;
}

export interface TaskDetailLinkedObjectModel {
  id: string;
  type: TaskLinkedObject['type'];
  typeLabel: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  statusLabel: string | null;
  isAvailable: boolean;
  unavailableReason: string | null;
  raw: TaskLinkedObject;
}

export interface TaskDetailCommentModel {
  id: string;
  body: string;
  authorLabel: string;
  createdAt: string;
  createdAtLabel: string;
}

export interface TaskDetailTechnicalRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface TaskDetailTechnicalModel {
  rows: TaskDetailTechnicalRow[];
  metadata: Record<string, unknown> | null;
}

export interface TaskDetailViewModel {
  taskId: string;
  header: TaskDetailHeaderModel;
  reason: TaskDetailReasonModel;
  nextStep: TaskDetailNextStepModel | null;
  checklist: TaskDetailChecklistModel | null;
  linkedObjects: TaskDetailLinkedObjectModel[];
  comments: TaskDetailCommentModel[];
  timeline: TimelineItem[];
  attachments: NonNullable<ApiTask['attachments']>;
  resolutionNote: string | null;
  technical: TaskDetailTechnicalModel;
  flags: {
    isTerminal: boolean;
    isActive: boolean;
    isOverdue: boolean;
    blocksVehicleAvailability: boolean;
    canAddComment: boolean;
  };
}

const LINKED_OBJECT_ORDER: TaskLinkedObject['type'][] = [
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'SERVICE_CASE',
  'INVOICE',
  'DOCUMENT',
  'FINE',
  'VENDOR',
  'ALERT',
];

export function isNormalizedTaskDetail(task: ApiTask): task is ApiTaskDetail {
  return (
    'summary' in task &&
    task.summary != null &&
    'reason' in task &&
    task.reason != null &&
    'nextAction' in task &&
    task.nextAction != null &&
    Array.isArray(task.linkedObjects)
  );
}

export function sanitizeReasonBasis(basis: string | null | undefined): string | null {
  if (!basis?.trim()) return null;
  const parts = basis
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^Quelle:\s*/i.test(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function inferTaskChecklistProgress(task: ApiTask): TaskChecklistProgress {
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

function resolveTimingLabel(
  detail: ApiTaskDetail,
  locale: SupportedLocale,
  now: Date,
): { label: string | null; warn: boolean } {
  if (detail.timing.dueDate) {
    return {
      label: taskDetailTimingDueLabel(
        locale,
        formatTaskDetailDueCompact(locale, detail.timing.dueDate),
      ),
      warn: detail.timing.isOverdue,
    };
  }

  const activatesAt = detail.timing.activatesAt;
  if (activatesAt) {
    const activeAt = new Date(activatesAt);
    if (!Number.isNaN(activeAt.getTime()) && activeAt.getTime() > now.getTime()) {
      return {
        label: taskDetailTimingActiveFromLabel(
          locale,
          formatTaskDetailDueCompact(locale, activatesAt),
        ),
        warn: false,
      };
    }
  }

  return { label: null, warn: false };
}

function shouldShowPriority(detail: ApiTaskDetail): boolean {
  return detail.summary.priority === 'CRITICAL' || detail.summary.priority === 'HIGH' || detail.timing.isOverdue;
}

function mapLinkedObject(row: TaskLinkedObject, locale: SupportedLocale): TaskDetailLinkedObjectModel {
  return {
    id: row.id,
    type: row.type,
    typeLabel: taskDetailLinkedObjectTypeLabel(locale, row.type),
    primaryLabel: row.primaryLabel,
    secondaryLabel: row.secondaryLabel ?? null,
    statusLabel: row.statusLabel ?? null,
    isAvailable: row.isAvailable,
    unavailableReason: row.unavailableReason ?? null,
    raw: row,
  };
}

function sortLinkedObjects(objects: TaskLinkedObject[]): TaskLinkedObject[] {
  return [...objects].sort(
    (a, b) => LINKED_OBJECT_ORDER.indexOf(a.type) - LINKED_OBJECT_ORDER.indexOf(b.type),
  );
}

function mapNextStep(detail: ApiTaskDetail): TaskDetailNextStepModel | null {
  const next = detail.nextAction;
  if (!next || next.actionType === 'NONE') return null;

  return {
    label: next.label,
    description: next.description ?? null,
    actionType: next.actionType,
    enabled: next.enabled,
    disabledReason: next.disabledReason ?? null,
    primaryActionLabel: next.enabled || next.label ? next.label : null,
  };
}

function buildReason(detail: ApiTaskDetail, locale: SupportedLocale): TaskDetailReasonModel {
  const detectedAt = detail.reason.detectedAt;
  return {
    headline: detail.reason.title,
    description:
      detail.reason.description?.trim() || tdp(locale, 'tasks.detail.reason.noDescription'),
    basis: sanitizeReasonBasis(detail.reason.basis),
    detectedAtLabel: detectedAt ? formatTaskDetailDateTime(locale, detectedAt) : null,
    humanReadableSource: detail.summary.humanReadableSource,
  };
}

function buildTimeline(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions,
): TimelineItem[] {
  return buildTaskTimelineItems(detail.timeline ?? [], {
    locale: options.locale,
  });
}

function buildTechnicalRows(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions,
): TaskDetailTechnicalModel {
  const locale = options.locale;
  const rows: TaskDetailTechnicalRow[] = [
    { label: tdp(locale, 'tasks.detail.technical.reference'), value: shortTaskId(detail.summary.id) },
    {
      label: tdp(locale, 'tasks.detail.technical.type'),
      value: taskDetailTypeLabel(locale, {
        type: detail.summary.type,
        category: detail.category,
        metadata: detail.technicalMetadata.metadata ?? null,
      }),
    },
    { label: tdp(locale, 'tasks.detail.technical.source'), value: detail.summary.humanReadableSource },
  ];

  if (detail.technicalMetadata.source) {
    rows.push({
      label: tdp(locale, 'tasks.detail.technical.rawSource'),
      value: detail.technicalMetadata.source,
    });
  }

  if (detail.technicalMetadata.dedupKey) {
    rows.push({
      label: tdp(locale, 'tasks.detail.technical.dedupKey'),
      value: detail.technicalMetadata.dedupKey,
    });
  }

  rows.push({
    label: tdp(locale, 'tasks.detail.technical.assignedTo'),
    value:
      detail.assignment.assignedUser?.displayName ?? taskDetailUnassignedLabel(locale),
  });

  rows.push({
    label: tdp(locale, 'tasks.detail.technical.createdBy'),
    value: detail.assignment.createdBy?.displayName ?? taskDetailEmDash(locale),
  });

  if (detail.assignment.responsibleRoleLabel) {
    rows.push({ label: tdp(locale, 'tasks.detail.technical.role'), value: detail.assignment.responsibleRoleLabel });
  }

  rows.push({
    label: tdp(locale, 'tasks.detail.metaCreated'),
    value: formatTaskDetailDateTime(locale, detail.timing.createdAt),
  });

  rows.push({
    label: tdp(locale, 'tasks.detail.metaDue'),
    value: formatTaskDetailDate(locale, detail.timing.dueDate),
    highlight: detail.timing.isOverdue,
  });

  if (options.stationLabel) {
    rows.push({ label: tdp(locale, 'tasks.form.station'), value: options.stationLabel });
  }

  if (detail.timing.completedAt) {
    rows.push({
      label: tdp(locale, 'tasks.detail.metaCompleted'),
      value: formatTaskDetailDateTime(locale, detail.timing.completedAt),
    });
  }

  if (detail.completion.resolutionNote) {
    rows.push({
      label: tdp(locale, 'tasks.detail.technical.resolutionNote'),
      value: detail.completion.resolutionNote,
    });
  }

  return {
    rows,
    metadata: detail.technicalMetadata.metadata ?? null,
  };
}

export function buildTaskDetailViewModel(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions,
): TaskDetailViewModel {
  const locale = options.locale;
  const now = options.now ?? new Date();
  const timing = resolveTimingLabel(detail, locale, now);
  const priorityLabel =
    options.priorityLabel ??
    vehicleTaskPriorityLabel(mapApiPriority(detail.summary.priority), locale);

  const checklist = buildTaskDetailChecklistModel(detail, locale, now);

  const members = options.orgMembers ?? [];
  const comments = (detail.comments ?? []).map((comment) => ({
    id: comment.id,
    body: comment.body,
    authorLabel: buildTaskCommentAuthorLabel(
      comment.userId,
      members,
      null,
      locale,
    ),
    createdAt: comment.createdAt,
    createdAtLabel: formatTaskDetailDateTime(locale, comment.createdAt),
  }));

  return {
    taskId: detail.summary.id,
    header: {
      title: detail.summary.title,
      eyebrow: options.eyebrow ?? null,
      subtitle: options.subtitle ?? shortTaskId(detail.summary.id),
      status: detail.summary.status,
      statusLabel: taskDetailStatusLabel(locale, detail.summary.status),
      statusTone: taskStatusTone(detail.summary.status, detail.timing.isOverdue),
      priority: detail.summary.priority,
      priorityLabel,
      showPriority: shouldShowPriority(detail),
      timingLabel: timing.label,
      timingWarn: timing.warn,
      category: options.category ?? detail.category ?? null,
    },
    reason: buildReason(detail, locale),
    nextStep: mapNextStep(detail),
    checklist,
    linkedObjects: sortLinkedObjects(detail.linkedObjects).map((row) => mapLinkedObject(row, locale)),
    comments,
    timeline: buildTimeline(detail, options),
    attachments: detail.attachments ?? [],
    resolutionNote: detail.completion.resolutionNote ?? detail.resolutionNote,
    technical: buildTechnicalRows(detail, options),
    flags: {
      isTerminal: isTerminalTaskStatus(detail.summary.status),
      isActive: isActiveTaskStatus(detail.summary.status),
      isOverdue: detail.timing.isOverdue,
      blocksVehicleAvailability: detail.blocksVehicleAvailability,
      canAddComment: isActiveTaskStatus(detail.summary.status),
    },
  };
}
