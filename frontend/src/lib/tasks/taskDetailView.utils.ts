import type { TimelineItem } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns/status-utils';
import {
  formatTaskDate,
  formatTaskDateTime,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  taskStatusLabelDe,
  taskStatusTone,
} from '../../rental/lib/task-detail.utils';
import { resolveUserName, shortTaskId } from '../../rental/lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../rental/lib/task-display.utils';
import { formatOperatorTaskDue } from '../../operator/tasks/operatorTask.utils';
import { buildTaskDetailChecklistModel, type TaskDetailChecklistModel } from './taskDetailChecklist.utils';
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

const LINKED_OBJECT_TYPE_LABELS: Record<TaskLinkedObject['type'], string> = {
  VEHICLE: 'Fahrzeug',
  BOOKING: 'Buchung',
  CUSTOMER: 'Kunde',
  INVOICE: 'Rechnung',
  DOCUMENT: 'Dokument',
  ALERT: 'Hinweis',
  SERVICE_CASE: 'Servicefall',
  FINE: 'Bußgeld',
  VENDOR: 'Partner',
};

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

function resolveTimingLabel(detail: ApiTaskDetail, now: Date): { label: string | null; warn: boolean } {
  if (detail.timing.dueDate) {
    return {
      label: `Fällig ${formatOperatorTaskDue(detail.timing.dueDate)}`,
      warn: detail.timing.isOverdue,
    };
  }

  const activatesAt = detail.timing.activatesAt;
  if (activatesAt) {
    const activeAt = new Date(activatesAt);
    if (!Number.isNaN(activeAt.getTime()) && activeAt.getTime() > now.getTime()) {
      return {
        label: `Aktiv ab ${formatOperatorTaskDue(activatesAt)}`,
        warn: false,
      };
    }
  }

  return { label: null, warn: false };
}

function shouldShowPriority(detail: ApiTaskDetail): boolean {
  return detail.summary.priority === 'CRITICAL' || detail.summary.priority === 'HIGH' || detail.timing.isOverdue;
}

function mapLinkedObject(row: TaskLinkedObject): TaskDetailLinkedObjectModel {
  return {
    id: row.id,
    type: row.type,
    typeLabel: LINKED_OBJECT_TYPE_LABELS[row.type] ?? row.type,
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

function buildReason(detail: ApiTaskDetail): TaskDetailReasonModel {
  const detectedAt = detail.reason.detectedAt;
  return {
    headline: detail.reason.title,
    description: detail.reason.description?.trim() || 'Keine Beschreibung hinterlegt.',
    basis: sanitizeReasonBasis(detail.reason.basis),
    detectedAtLabel: detectedAt ? formatTaskDateTime(detectedAt) : null,
    humanReadableSource: detail.summary.humanReadableSource,
  };
}

function buildTimeline(detail: ApiTaskDetail): TimelineItem[] {
  return (detail.timeline ?? []).map((event) => ({
    id: event.id,
    title: event.label,
    time: formatTaskDateTime(event.createdAt),
    description: event.actor?.displayName ? `von ${event.actor.displayName}` : undefined,
  }));
}

function buildTechnicalRows(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions,
): TaskDetailTechnicalModel {
  const members = options.orgMembers ?? [];
  const rows: TaskDetailTechnicalRow[] = [
    { label: 'Referenz', value: shortTaskId(detail.summary.id) },
    { label: 'Typ', value: detail.summary.type.replace(/_/g, ' ') },
    { label: 'Quelle', value: detail.summary.humanReadableSource },
  ];

  if (detail.technicalMetadata.source) {
    rows.push({ label: 'Rohquelle', value: detail.technicalMetadata.source });
  }

  if (detail.technicalMetadata.dedupKey) {
    rows.push({ label: 'Dedup-Schlüssel', value: detail.technicalMetadata.dedupKey });
  }

  rows.push({
    label: 'Zugewiesen an',
    value: detail.assignment.assignedUser?.displayName ?? 'Nicht zugewiesen',
  });

  rows.push({
    label: 'Erstellt von',
    value: detail.assignment.createdBy?.displayName ?? '—',
  });

  if (detail.assignment.responsibleRoleLabel) {
    rows.push({ label: 'Rolle', value: detail.assignment.responsibleRoleLabel });
  }

  rows.push({
    label: 'Erstellt am',
    value: formatTaskDateTime(detail.timing.createdAt),
  });

  rows.push({
    label: 'Fällig am',
    value: formatTaskDate(detail.timing.dueDate),
    highlight: detail.timing.isOverdue,
  });

  if (options.stationLabel) {
    rows.push({ label: 'Station', value: options.stationLabel });
  }

  if (detail.timing.completedAt) {
    rows.push({
      label: 'Abgeschlossen',
      value: formatTaskDateTime(detail.timing.completedAt),
    });
  }

  if (detail.completion.resolutionNote) {
    rows.push({ label: 'Abschluss-Notiz', value: detail.completion.resolutionNote });
  }

  return {
    rows,
    metadata: detail.technicalMetadata.metadata ?? null,
  };
}

export function buildTaskDetailViewModel(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions = {},
): TaskDetailViewModel {
  const now = options.now ?? new Date();
  const timing = resolveTimingLabel(detail, now);
  const priorityLabel =
    options.priorityLabel ??
    vehicleTaskPriorityLabel(mapApiPriority(detail.summary.priority));

  const checklist = buildTaskDetailChecklistModel(detail, now);

  const members = options.orgMembers ?? [];
  const comments = (detail.comments ?? []).map((comment) => ({
    id: comment.id,
    body: comment.body,
    authorLabel: comment.userId
      ? resolveUserName(comment.userId, members, 'Unbekannter Nutzer')
      : 'Unbekannter Nutzer',
    createdAtLabel: formatTaskDateTime(comment.createdAt),
  }));

  return {
    taskId: detail.summary.id,
    header: {
      title: detail.summary.title,
      eyebrow: options.eyebrow ?? null,
      subtitle: options.subtitle ?? shortTaskId(detail.summary.id),
      status: detail.summary.status,
      statusLabel: taskStatusLabelDe(detail.summary.status),
      statusTone: taskStatusTone(detail.summary.status, detail.timing.isOverdue),
      priority: detail.summary.priority,
      priorityLabel,
      showPriority: shouldShowPriority(detail),
      timingLabel: timing.label,
      timingWarn: timing.warn,
      category: options.category ?? detail.category ?? null,
    },
    reason: buildReason(detail),
    nextStep: mapNextStep(detail),
    checklist,
    linkedObjects: sortLinkedObjects(detail.linkedObjects).map(mapLinkedObject),
    comments,
    timeline: buildTimeline(detail),
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
