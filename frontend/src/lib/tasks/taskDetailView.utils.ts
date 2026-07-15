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
import { formatTaskTimelineTitle } from '../../rental/lib/task-timeline-display.utils';
import { resolveDisplaySource, resolveUserName, shortTaskId } from '../../rental/lib/task-list.utils';
import { mapApiPriority, vehicleTaskPriorityLabel } from '../../rental/lib/task-display.utils';
import { formatOperatorTaskDue } from '../../operator/tasks/operatorTask.utils';
import type {
  ApiTask,
  ApiTaskChecklistItem,
  ApiTaskDetail,
  ApiTaskPriority,
  ApiTaskStatus,
  TaskChecklistProgress,
  TaskLinkedObject,
  TaskNextActionType,
} from './types';

export interface TaskDetailViewMember {
  id: string;
  name: string;
}

export interface TaskDetailViewModelOptions {
  eyebrow?: string | null;
  subtitle?: string | null;
  displaySource?: string | null;
  category?: string | null;
  priorityLabel?: string | null;
  orgMembers?: TaskDetailViewMember[];
  vehicleLabel?: string | null;
  vehicleModel?: string | null;
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
  displaySource: string | null;
}

export interface TaskDetailReasonModel {
  title: string;
  description: string;
  basis: string | null;
  detectedAtLabel: string | null;
}

export interface TaskDetailNextStepModel {
  label: string;
  description: string | null;
  actionType: TaskNextActionType;
  enabled: boolean;
  disabledReason: string | null;
  primaryActionLabel: string | null;
}

export interface TaskDetailChecklistModel {
  progress: TaskChecklistProgress;
  items: ApiTaskChecklistItem[];
  blocked: boolean;
  blockerLabel: string | null;
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

const NEXT_ACTION_PRIMARY_LABELS: Record<TaskNextActionType, string | null> = {
  START: 'Starten',
  RESUME: 'Fortsetzen',
  COMPLETE: 'Abschließen',
  ASSIGN: 'Zuweisen',
  REVIEW: 'Prüfen',
  NONE: null,
};

function isNormalizedDetail(task: ApiTask): task is ApiTaskDetail {
  return (
    'reason' in task &&
    task.reason != null &&
    typeof task.reason === 'object' &&
    'title' in task.reason
  );
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

function resolveTimingLabel(task: ApiTask, now: Date): { label: string | null; warn: boolean } {
  const timing = isNormalizedDetail(task) ? task.timing : null;
  if (timing?.dueDate || task.dueDate) {
    const due = timing?.dueDate ?? task.dueDate;
    return {
      label: `Fällig ${formatOperatorTaskDue(due)}`,
      warn: timing?.isOverdue ?? task.isOverdue,
    };
  }

  const activatesAt = timing?.activatesAt ?? task.activatesAt;
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

function shouldShowPriority(task: ApiTask): boolean {
  return task.priority === 'CRITICAL' || task.priority === 'HIGH' || task.isOverdue;
}

function buildLinkedObjects(task: ApiTask, options: TaskDetailViewModelOptions): TaskLinkedObject[] {
  if (task.linkedObjects?.length) return task.linkedObjects;

  const rows: TaskLinkedObject[] = [];
  const push = (
    type: TaskLinkedObject['type'],
    id: string | null | undefined,
    primaryLabel: string | null | undefined,
    actionType: TaskLinkedObject['action']['type'],
    actionIdKey: keyof TaskLinkedObject['action'],
  ) => {
    if (!id) return;
    const label = primaryLabel?.trim();
    rows.push({
      type,
      id,
      primaryLabel: label || 'Daten werden geladen…',
      iconKey: type.toLowerCase(),
      action: { type: actionType, [actionIdKey]: id } as TaskLinkedObject['action'],
      isAvailable: Boolean(label),
      unavailableReason: label ? null : 'Bezeichnung noch nicht verfügbar',
    });
  };

  push('VEHICLE', task.vehicleId, options.vehicleLabel, 'OPEN_VEHICLE', 'vehicleId');
  push('BOOKING', task.bookingId, null, 'OPEN_BOOKING', 'bookingId');
  push('CUSTOMER', task.customerId, null, 'OPEN_CUSTOMER', 'customerId');
  push('INVOICE', task.invoiceId, null, 'OPEN_INVOICE', 'invoiceId');
  push('DOCUMENT', task.documentId, null, 'OPEN_DOCUMENT', 'documentId');
  push('ALERT', task.alertId, null, 'OPEN_ALERT', 'alertId');
  push('SERVICE_CASE', task.serviceCaseId, null, 'OPEN_SERVICE_CASE', 'serviceCaseId');
  push('FINE', task.fineId, null, 'OPEN_FINE', 'fineId');
  push('VENDOR', task.vendorId, null, 'OPEN_VENDOR', 'vendorId');

  return rows;
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

function inferNextStep(
  task: ApiTask,
  progress: TaskChecklistProgress,
  now: Date,
): TaskDetailNextStepModel | null {
  if (isTerminalTaskStatus(task.status)) return null;

  const activatesAt = task.activatesAt ? new Date(task.activatesAt) : null;
  const notYetActive =
    activatesAt != null && !Number.isNaN(activatesAt.getTime()) && activatesAt > now;

  if (task.status === 'OPEN') {
    return {
      label: 'Aufgabe starten',
      description: notYetActive ? 'Die Aufgabe ist noch nicht aktiv.' : 'Beginnen Sie mit der Bearbeitung.',
      actionType: 'START',
      enabled: !notYetActive,
      disabledReason: notYetActive ? 'Die Aufgabe ist noch nicht aktiv.' : null,
      primaryActionLabel: 'Starten',
    };
  }

  if (task.status === 'WAITING') {
    return {
      label: 'Aufgabe fortsetzen',
      description: 'Die Aufgabe wartet auf Fortsetzung.',
      actionType: 'RESUME',
      enabled: !notYetActive,
      disabledReason: notYetActive ? 'Die Aufgabe ist noch nicht aktiv.' : null,
      primaryActionLabel: 'Fortsetzen',
    };
  }

  if (task.status === 'IN_PROGRESS') {
    const blocked = !progress.canCompleteByChecklist;
    return {
      label: 'Aufgabe abschließen',
      description: blocked
        ? 'Offene Pflichtpunkte in der Checkliste müssen zuerst erledigt werden.'
        : 'Schließen Sie die Aufgabe ab, wenn alles erledigt ist.',
      actionType: 'COMPLETE',
      enabled: !blocked && !notYetActive,
      disabledReason: blocked
        ? 'Offene Pflichtpunkte in der Checkliste.'
        : notYetActive
          ? 'Die Aufgabe ist noch nicht aktiv.'
          : null,
      primaryActionLabel: 'Abschließen',
    };
  }

  return null;
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
    primaryActionLabel: NEXT_ACTION_PRIMARY_LABELS[next.actionType],
  };
}

function buildReason(task: ApiTask, options: TaskDetailViewModelOptions): TaskDetailReasonModel {
  if (isNormalizedDetail(task)) {
    const detectedAt = task.reason.detectedAt;
    return {
      title: task.reason.title,
      description: task.reason.description?.trim() || 'Keine Beschreibung hinterlegt.',
      basis: task.reason.basis ?? options.displaySource ?? resolveDisplaySource(task.sourceType, task.source),
      detectedAtLabel: detectedAt ? formatTaskDateTime(detectedAt) : null,
    };
  }

  return {
    title: task.type.replace(/_/g, ' '),
    description: task.description?.trim() || 'Keine Beschreibung hinterlegt.',
    basis: options.displaySource ?? resolveDisplaySource(task.sourceType, task.source),
    detectedAtLabel:
      task.sourceType !== 'MANUAL' ? formatTaskDateTime(task.createdAt) : null,
  };
}

function buildTimeline(
  task: ApiTask,
  members: TaskDetailViewMember[],
): TimelineItem[] {
  const events = task.timeline ?? [];
  if (!events.length) return [];

  return events.map((event) => {
    const normalizedLabel = 'label' in event && event.label ? event.label : null;
    const title =
      normalizedLabel ??
      formatTaskTimelineTitle(event, members);

    const actor =
      'actor' in event && event.actor?.displayName
        ? event.actor.displayName
        : event.actorUserId
          ? resolveUserName(event.actorUserId, members, 'Unbekannter Nutzer')
          : null;

    return {
      id: event.id,
      title,
      time: formatTaskDateTime(event.createdAt),
      description: actor ? `von ${actor}` : undefined,
    };
  });
}

function buildTechnicalRows(
  task: ApiTask,
  options: TaskDetailViewModelOptions,
): TaskDetailTechnicalModel {
  const members = options.orgMembers ?? [];
  const rows: TaskDetailTechnicalRow[] = [
    { label: 'Referenz', value: shortTaskId(task.id) },
    { label: 'Typ', value: (isNormalizedDetail(task) ? task.summary.type : task.type).replace(/_/g, ' ') },
    {
      label: 'Quelle',
      value:
        (isNormalizedDetail(task) ? task.summary.humanReadableSource : null) ??
        options.displaySource ??
        resolveDisplaySource(task.sourceType, task.source),
    },
  ];

  if (task.source) {
    rows.push({ label: 'Rohquelle', value: task.source });
  }

  if (task.dedupKey) {
    rows.push({ label: 'Dedup-Schlüssel', value: task.dedupKey });
  }

  const assignedName = isNormalizedDetail(task)
    ? task.assignment.assignedUser?.displayName ?? null
    : task.assignedUserName ??
      (task.assignedUserId
        ? resolveUserName(task.assignedUserId, members, task.assignedUserId)
        : null);

  rows.push({
    label: 'Zugewiesen an',
    value: assignedName ?? 'Nicht zugewiesen',
  });

  const createdBy = isNormalizedDetail(task)
    ? task.assignment.createdBy?.displayName ?? null
    : task.createdByName ??
      (task.createdByUserId
        ? resolveUserName(task.createdByUserId, members, 'System')
        : 'System');

  rows.push({ label: 'Erstellt von', value: createdBy ?? '—' });

  if (isNormalizedDetail(task) && task.assignment.responsibleRoleLabel) {
    rows.push({ label: 'Rolle', value: task.assignment.responsibleRoleLabel });
  }

  rows.push({
    label: 'Erstellt am',
    value: formatTaskDateTime(isNormalizedDetail(task) ? task.timing.createdAt : task.createdAt),
  });

  rows.push({
    label: 'Fällig am',
    value: formatTaskDate(
      isNormalizedDetail(task) ? task.timing.dueDate : task.dueDate,
    ),
    highlight: task.isOverdue,
  });

  if (options.stationLabel) {
    rows.push({ label: 'Station', value: options.stationLabel });
  }

  if (options.vehicleLabel) {
    rows.push({
      label: 'Fahrzeug',
      value: [options.vehicleLabel, options.vehicleModel].filter(Boolean).join(' · ') || options.vehicleLabel,
    });
  }

  if (task.completedAt) {
    rows.push({ label: 'Abgeschlossen', value: formatTaskDateTime(task.completedAt) });
  }

  if (task.resolutionNote) {
    rows.push({ label: 'Abschluss-Notiz', value: task.resolutionNote });
  }

  const metadata = isNormalizedDetail(task)
    ? task.technicalMetadata.metadata
    : task.metadata;

  return { rows, metadata: metadata ?? null };
}

export function buildTaskDetailViewModel(
  task: ApiTask,
  options: TaskDetailViewModelOptions = {},
): TaskDetailViewModel {
  const now = options.now ?? new Date();
  const progress = inferTaskChecklistProgress(task);
  const timing = resolveTimingLabel(task, now);
  const priorityLabel =
    options.priorityLabel ??
    vehicleTaskPriorityLabel(mapApiPriority(task.priority));

  const checklistItems = [...(task.checklist ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'de'),
  );

  const checklist =
    progress.hasChecklist && checklistItems.length > 0
      ? {
          progress,
          items: checklistItems,
          blocked: !progress.canCompleteByChecklist && isActiveTaskStatus(task.status),
          blockerLabel: progress.canCompleteByChecklist
            ? null
            : 'Offene Pflichtpunkte vor Abschluss',
        }
      : null;

  const members = options.orgMembers ?? [];
  const comments = (task.comments ?? []).map((comment) => ({
    id: comment.id,
    body: comment.body,
    authorLabel: comment.userId
      ? resolveUserName(comment.userId, members, 'Unbekannter Nutzer')
      : 'Unbekannter Nutzer',
    createdAtLabel: formatTaskDateTime(comment.createdAt),
  }));

  const linkedObjects = buildLinkedObjects(task, options).map(mapLinkedObject);

  const nextStep = isNormalizedDetail(task)
    ? mapNextStep(task) ?? inferNextStep(task, progress, now)
    : inferNextStep(task, progress, now);

  return {
    header: {
      title: isNormalizedDetail(task) ? task.summary.title : task.title,
      eyebrow: options.eyebrow ?? null,
      subtitle:
        options.subtitle ??
        [
          shortTaskId(task.id),
          options.displaySource ?? resolveDisplaySource(task.sourceType, task.source),
        ]
          .filter(Boolean)
          .join(' · '),
      status: task.status,
      statusLabel: taskStatusLabelDe(task.status),
      statusTone: taskStatusTone(task.status, task.isOverdue),
      priority: task.priority,
      priorityLabel,
      showPriority: shouldShowPriority(task),
      timingLabel: timing.label,
      timingWarn: timing.warn,
      category: options.category ?? task.category ?? null,
      displaySource:
        options.displaySource ??
        (isNormalizedDetail(task) ? task.summary.humanReadableSource : null) ??
        resolveDisplaySource(task.sourceType, task.source),
    },
    reason: buildReason(task, options),
    nextStep,
    checklist,
    linkedObjects,
    comments,
    timeline: buildTimeline(task, members),
    attachments: task.attachments ?? [],
    resolutionNote: task.resolutionNote,
    technical: buildTechnicalRows(task, options),
    flags: {
      isTerminal: isTerminalTaskStatus(task.status),
      isActive: isActiveTaskStatus(task.status),
      isOverdue: task.isOverdue,
      blocksVehicleAvailability: task.blocksVehicleAvailability,
      canAddComment: isActiveTaskStatus(task.status),
    },
  };
}
