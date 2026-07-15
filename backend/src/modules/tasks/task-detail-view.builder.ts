import {
  TaskCompletionMode,
  TaskPriority,
  TaskSource,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import type { ChecklistProgress } from './checklist-progress.util';
import {
  classifyPrimaryTaskBucket,
  createTaskBucketContext,
  isTaskActivated,
  type TaskBucketContext,
} from './task-bucket.util';
import { getTaskTypeChecklistTemplate } from './task-templates';
import { isActiveTaskStatus, isTerminalTaskStatus } from './task-transition.policy';
import type { TaskLinkedObject } from './task-linked-object.types';
import type {
  NormalizedTaskTimelineEvent,
  TaskActionAvailability,
  TaskAvailableActions,
  TaskDetailAssignment,
  TaskDetailCompletion,
  TaskDetailNextAction,
  TaskDetailNormalizedSections,
  TaskDetailReason,
  TaskDetailSummary,
  TaskDetailTechnicalMetadata,
  TaskDetailTiming,
  TaskNextActionTargetType,
  TaskNextActionType,
  TaskUserRef,
} from './task-detail-view.types';

const TASK_TYPE_LABEL_DE: Record<TaskType, string> = {
  VEHICLE_SERVICE: 'Fahrzeug-Service / Wartung',
  REPAIR: 'Reparatur',
  VEHICLE_INSPECTION: 'TÜV/HU & Inspektion',
  TIRE_CHECK: 'Reifen prüfen / wechseln',
  BRAKE_CHECK: 'Bremsen prüfen',
  BATTERY_CHECK: 'Batterie prüfen',
  VEHICLE_CLEANING: 'Reinigung / Aufbereitung',
  BOOKING_PREPARATION: 'Buchungsvorbereitung',
  BOOKING_PICKUP: 'Fahrzeugübergabe',
  BOOKING_RETURN: 'Fahrzeugrückgabe',
  DOCUMENT_REVIEW: 'Dokumentenprüfung',
  INVOICE_REQUIRED: 'Rechnung erforderlich',
  CUSTOMER_FOLLOWUP: 'Kunden-Nachverfolgung',
  CUSTOM: 'Allgemeine Aufgabe',
};

const TASK_SOURCE_LABEL_DE: Record<TaskSource, string> = {
  MANUAL: 'Manuell erstellt',
  SYSTEM: 'System',
  ALERT: 'Hinweis / Insight',
  HEALTH: 'Fahrzeug-Health',
  BOOKING: 'Buchung',
  DOCUMENT: 'Dokument',
  VENDOR: 'Partner / Werkstatt',
};

const TIMELINE_TYPE_LABEL_DE: Record<string, string> = {
  CREATED: 'Aufgabe erstellt',
  STATUS_CHANGED: 'Status geändert',
  ASSIGNED: 'Zuweisung geändert',
  COMMENT_ADDED: 'Kommentar hinzugefügt',
  CHECKLIST_ITEM_ADDED: 'Checklistenpunkt hinzugefügt',
  CHECKLIST_ITEM_UPDATED: 'Checklistenpunkt aktualisiert',
  ATTACHMENT_ADDED: 'Anhang hinzugefügt',
  AUTO_RESOLVED: 'Automatisch erledigt',
  SUPERSEDED: 'Automatisch beendet',
  CHECKLIST_COMPLETION_OVERRIDDEN: 'Checklisten-Override',
  TIMING_CHANGED: 'Zeitplan geändert',
  ESCALATED: 'Eskaliert',
  LINKS_UPDATED: 'Verknüpfungen geändert',
  UPDATED: 'Aufgabe aktualisiert',
};

const STATUS_LABEL_DE: Record<TaskStatus, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING: 'Wartet',
  DONE: 'Erledigt',
  CANCELLED: 'Storniert',
};

const CONTROLLED_METADATA_KEYS = [
  'automation',
  'timeWindow',
  'origin',
  'damageId',
  'stationId',
  'detectedAt',
  'firstDetectedAt',
  'evidenceSummary',
  'ruleId',
  'allowAutoResolve',
  'responsibleRole',
  'responsibleRoleLabel',
] as const;

export interface LegacyFormattedTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  source: string | null;
  sourceType: TaskSource;
  dedupKey: string | null;
  completionMode: TaskCompletionMode | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  completedByUserId: string | null;
  supersededByTaskId: string | null;
  assignedUserId: string | null;
  createdByUserId: string | null;
  activatesAt: string;
  isOverdue: boolean;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  metadata: unknown;
  vehicleId?: string | null;
  bookingId?: string | null;
  checklistProgress: ChecklistProgress;
  timeline?: Array<{
    id: string;
    type: string;
    actorUserId: string | null;
    oldValue: string | null;
    newValue: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

export interface BuildTaskDetailViewInput {
  legacy: LegacyFormattedTask;
  linkedObjects: TaskLinkedObject[];
  usersById: Map<string, TaskUserRef>;
  blocksVehicleAvailability?: boolean;
  canOverrideChecklist?: boolean;
  now?: Date;
  bucketContext?: TaskBucketContext;
}

export function buildTaskDetailNormalizedSections(
  input: BuildTaskDetailViewInput,
): TaskDetailNormalizedSections {
  const now = input.now ?? new Date();
  const meta = readMetadata(input.legacy.metadata);
  const bucketContext = input.bucketContext ?? createTaskBucketContext(now);

  return {
    summary: buildSummary(input.legacy, meta),
    reason: buildReason(input.legacy, meta),
    nextAction: buildNextAction(input.legacy, input.linkedObjects, now),
    linkedObjects: input.linkedObjects,
    checklistProgress: input.legacy.checklistProgress,
    assignment: buildAssignment(input.legacy, meta, input.usersById),
    timing: buildTiming(input.legacy, input.blocksVehicleAvailability ?? false, now, bucketContext),
    completion: buildCompletion(input.legacy, input.usersById),
    timeline: buildNormalizedTimeline(input.legacy.timeline ?? [], input.usersById),
    technicalMetadata: buildTechnicalMetadata(input.legacy),
    availableActions: buildAvailableActions(input.legacy, input.canOverrideChecklist ?? false, now),
  };
}

function readMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function formatUserRef(
  userId: string | null | undefined,
  usersById: Map<string, TaskUserRef>,
): TaskUserRef | null {
  if (!userId) return null;
  return usersById.get(userId) ?? null;
}

export function buildUserDisplayName(user: {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const fromName = user.name?.trim();
  if (fromName) return fromName;
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  if (user.email?.trim()) return user.email.trim();
  return 'Unbekannter Benutzer';
}

function buildSummary(legacy: LegacyFormattedTask, meta: Record<string, unknown>): TaskDetailSummary {
  return {
    id: legacy.id,
    title: legacy.title,
    type: legacy.type,
    status: legacy.status,
    priority: legacy.priority,
    sourceType: legacy.sourceType,
    humanReadableSource: resolveHumanReadableSource(legacy, meta),
    completionMode: legacy.completionMode,
  };
}

export function resolveHumanReadableSource(
  task: Pick<LegacyFormattedTask, 'source' | 'sourceType' | 'type'>,
  meta: Record<string, unknown>,
): string {
  if (meta.origin === 'DAMAGE' || typeof meta.damageId === 'string') {
    return 'Schaden';
  }

  const source = (task.source ?? '').toUpperCase();
  if (task.sourceType === 'BOOKING') return 'Buchung';
  if (task.sourceType === 'DOCUMENT') return 'Dokument';
  if (task.sourceType === 'VENDOR') return 'Partner / Werkstatt';
  if (task.sourceType === 'HEALTH' || source === 'INSIGHT_HEALTH') return 'Fahrzeug-Health';
  if (source === 'INSIGHT_SERVICE' || source === 'INSIGHT_COMPLIANCE') return 'Service / Compliance';
  if (task.type === 'VEHICLE_CLEANING' || source === 'VEHICLE_CLEANING') return 'Reinigung';
  if (task.sourceType === 'SYSTEM' || task.sourceType === 'ALERT' || source.startsWith('INSIGHT_')) {
    return 'System';
  }
  return TASK_SOURCE_LABEL_DE[task.sourceType] ?? TASK_SOURCE_LABEL_DE.MANUAL;
}

function resolveTypeLabel(
  task: Pick<LegacyFormattedTask, 'type' | 'description'>,
  meta: Record<string, unknown>,
): string {
  if (task.type === 'REPAIR' && (meta.origin === 'DAMAGE' || typeof meta.damageId === 'string')) {
    return 'Schadenreparatur';
  }
  return TASK_TYPE_LABEL_DE[task.type] ?? task.type.replace(/_/g, ' ');
}

function buildReason(legacy: LegacyFormattedTask, meta: Record<string, unknown>): TaskDetailReason {
  const detectedAt = pickIsoString(
    meta.detectedAt,
    meta.firstDetectedAt,
    readNested(meta, 'automation', 'detectedAt'),
  );

  return {
    title: resolveTypeLabel(legacy, meta),
    description: legacy.description?.trim() || '',
    detectedAt: detectedAt ?? (legacy.sourceType !== 'MANUAL' ? legacy.createdAt : null),
    basis: summarizeEvidenceBasis(meta, legacy.source),
  };
}

function summarizeEvidenceBasis(meta: Record<string, unknown>, source: string | null): string | null {
  const parts: string[] = [];

  const automation = meta.automation;
  if (automation && typeof automation === 'object' && !Array.isArray(automation)) {
    const ruleId = (automation as Record<string, unknown>).ruleId;
    if (typeof ruleId === 'string' && ruleId.trim()) {
      parts.push(`Regel: ${ruleId.trim()}`);
    }
  }

  if (typeof meta.ruleId === 'string' && meta.ruleId.trim()) {
    parts.push(`Regel: ${meta.ruleId.trim()}`);
  }

  if (source?.trim()) {
    parts.push(`Quelle: ${source.trim()}`);
  }

  const evidence = meta.evidenceSummary;
  if (typeof evidence === 'string' && evidence.trim()) {
    parts.push(evidence.trim());
  } else if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const summary = (evidence as Record<string, unknown>).summary;
    if (typeof summary === 'string' && summary.trim()) {
      parts.push(summary.trim());
    }
  }

  const serviceOverdue = meta.serviceOverdue;
  if (serviceOverdue && typeof serviceOverdue === 'object' && !Array.isArray(serviceOverdue)) {
    const intervalExceeded = (serviceOverdue as Record<string, unknown>).intervalExceeded;
    if (typeof intervalExceeded === 'string' && intervalExceeded.trim()) {
      parts.push(intervalExceeded.trim());
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function buildAssignment(
  legacy: LegacyFormattedTask,
  meta: Record<string, unknown>,
  usersById: Map<string, TaskUserRef>,
): TaskDetailAssignment {
  const responsibleRoleLabel =
    (typeof meta.responsibleRoleLabel === 'string' && meta.responsibleRoleLabel.trim()) ||
    (typeof meta.responsibleRole === 'string' && meta.responsibleRole.trim()) ||
    null;

  return {
    assignedUser: formatUserRef(legacy.assignedUserId, usersById),
    createdBy: formatUserRef(legacy.createdByUserId, usersById),
    responsibleRoleLabel,
  };
}

function buildCompletion(
  legacy: LegacyFormattedTask,
  usersById: Map<string, TaskUserRef>,
): TaskDetailCompletion {
  return {
    completionMode: legacy.completionMode,
    resolutionCode: legacy.resolutionCode,
    resolutionNote: legacy.resolutionNote,
    completedBy: formatUserRef(legacy.completedByUserId, usersById),
    supersededByTaskId: legacy.supersededByTaskId,
  };
}

function buildTiming(
  legacy: LegacyFormattedTask,
  blocksVehicleAvailability: boolean,
  now: Date,
  bucketContext: TaskBucketContext,
): TaskDetailTiming {
  const activatesAtRaw = legacy.activatesAt ? new Date(legacy.activatesAt) : null;
  const isActivated = isTaskActivated({ activatesAt: activatesAtRaw }, now);
  const isActive = isActiveTaskStatus(legacy.status) && isActivated;

  return {
    createdAt: legacy.createdAt,
    activatesAt: legacy.activatesAt,
    dueDate: legacy.dueDate,
    startedAt: legacy.startedAt,
    completedAt: legacy.completedAt,
    cancelledAt: legacy.cancelledAt,
    isActive,
    isOverdue: legacy.isOverdue,
    bucket: classifyPrimaryTaskBucket(
      {
        status: legacy.status,
        priority: legacy.priority,
        dueDate: legacy.dueDate ? new Date(legacy.dueDate) : null,
        activatesAt: activatesAtRaw,
        createdAt: new Date(legacy.createdAt),
        assignedUserId: legacy.assignedUserId,
        blocksVehicleAvailability,
      },
      bucketContext,
    ),
  };
}

function buildTechnicalMetadata(legacy: LegacyFormattedTask): TaskDetailTechnicalMetadata {
  return {
    source: legacy.source,
    dedupKey: legacy.dedupKey,
    metadata: extractControlledMetadata(legacy.metadata),
  };
}

export function extractControlledMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of CONTROLLED_METADATA_KEYS) {
    if (key in raw) out[key] = raw[key];
  }

  return Object.keys(out).length > 0 ? out : null;
}

function buildNextAction(
  legacy: LegacyFormattedTask,
  linkedObjects: TaskLinkedObject[],
  now: Date,
): TaskDetailNextAction {
  const activatesAt = new Date(legacy.activatesAt);
  const templateHint = getTaskTypeChecklistTemplate(legacy.type)?.metadata.defaultNextAction ?? null;
  const primaryTarget = pickPrimaryNextActionTarget(legacy, linkedObjects);

  if (isTerminalTaskStatus(legacy.status)) {
    return {
      label: 'Keine Aktion erforderlich',
      description: 'Die Aufgabe ist abgeschlossen.',
      actionType: 'NONE',
      targetType: primaryTarget.targetType,
      targetId: primaryTarget.targetId,
      enabled: false,
      disabledReason: 'Aufgabe ist bereits abgeschlossen.',
    };
  }

  if (activatesAt.getTime() > now.getTime()) {
    return {
      label: 'Noch nicht aktiv',
      description: templateHint,
      actionType: 'REVIEW',
      targetType: primaryTarget.targetType,
      targetId: primaryTarget.targetId,
      enabled: false,
      disabledReason: 'Die Aufgabe ist erst ab dem Aktivierungszeitpunkt bearbeitbar.',
    };
  }

  if (!legacy.assignedUserId) {
    return {
      label: 'Zuweisen',
      description: 'Verantwortliche Person festlegen.',
      actionType: 'ASSIGN',
      targetType: 'TASK',
      targetId: legacy.id,
      enabled: true,
    };
  }

  if (legacy.status === 'WAITING') {
    return {
      label: 'Fortsetzen',
      description: templateHint ?? 'Aufgabe wieder in Bearbeitung nehmen.',
      actionType: 'RESUME',
      targetType: 'TASK',
      targetId: legacy.id,
      enabled: true,
    };
  }

  if (legacy.status === 'OPEN') {
    return {
      label: 'Starten',
      description: templateHint ?? 'Aufgabe in Bearbeitung nehmen.',
      actionType: 'START',
      targetType: 'TASK',
      targetId: legacy.id,
      enabled: true,
    };
  }

  if (legacy.status === 'IN_PROGRESS') {
    return {
      label: 'Abschließen',
      description: templateHint ?? 'Aufgabe fachlich abschließen.',
      actionType: 'COMPLETE',
      targetType: 'TASK',
      targetId: legacy.id,
      enabled: true,
    };
  }

  return {
    label: 'Prüfen',
    description: templateHint,
    actionType: 'REVIEW',
    targetType: primaryTarget.targetType,
    targetId: primaryTarget.targetId,
    enabled: true,
  };
}

function pickPrimaryNextActionTarget(
  legacy: LegacyFormattedTask,
  linkedObjects: TaskLinkedObject[],
): { targetType: TaskNextActionTargetType; targetId: string } {
  const available = linkedObjects.find((o) => o.isAvailable);
  if (available) {
    return { targetType: available.type as TaskNextActionTargetType, targetId: available.id };
  }

  if (legacy.vehicleId) return { targetType: 'VEHICLE', targetId: legacy.vehicleId };
  if (legacy.bookingId) return { targetType: 'BOOKING', targetId: legacy.bookingId };
  return { targetType: 'TASK', targetId: legacy.id };
}

function buildAvailableActions(
  legacy: LegacyFormattedTask,
  canOverrideChecklist: boolean,
  now: Date,
): TaskAvailableActions {
  const terminal = isTerminalTaskStatus(legacy.status);
  const activatesAt = new Date(legacy.activatesAt);
  const notYetActive = activatesAt.getTime() > now.getTime();
  const checklistBlocked =
    !legacy.checklistProgress.canCompleteByChecklist &&
    legacy.checklistProgress.completionBlockers.length > 0;

  const disabledTerminal: TaskActionAvailability = {
    enabled: false,
    disabledReason: 'Aufgabe ist bereits abgeschlossen.',
  };

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

  const disabledNotActive: TaskActionAvailability = {
    enabled: false,
    disabledReason: 'Die Aufgabe ist noch nicht aktiv.',
  };

  const completeBlockers: string[] = [];
  if (notYetActive) completeBlockers.push('Aufgabe ist noch nicht aktiv.');
  if (checklistBlocked && !canOverrideChecklist) {
    completeBlockers.push('Offene Pflichtpunkte in der Checkliste.');
  }

  return {
    start: availability(
      legacy.status === 'OPEN' && !notYetActive,
      legacy.status !== 'OPEN' ? 'Nur offene Aufgaben können gestartet werden.' : undefined,
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    moveToWaiting: availability(
      (legacy.status === 'OPEN' || legacy.status === 'IN_PROGRESS') && !notYetActive,
      legacy.status === 'WAITING'
        ? 'Aufgabe wartet bereits.'
        : 'Nur offene oder laufende Aufgaben können pausiert werden.',
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    resume: availability(
      legacy.status === 'WAITING' && !notYetActive,
      legacy.status !== 'WAITING' ? 'Nur wartende Aufgaben können fortgesetzt werden.' : undefined,
      notYetActive ? disabledNotActive.disabledReason : undefined,
    ),
    complete: availability(
      completeBlockers.length === 0,
      completeBlockers[0],
    ),
    cancel: availability(!notYetActive, disabledNotActive.disabledReason),
    comment: { enabled: true },
    overrideCompletion: availability(
      checklistBlocked && canOverrideChecklist,
      !checklistBlocked
        ? 'Override nur bei offenen Pflicht-Checklistenpunkten verfügbar.'
        : 'Keine Berechtigung für Checklisten-Override.',
    ),
  };
}

function availability(
  enabled: boolean,
  disabledReasonWhenFalse?: string,
  forcedDisabledReason?: string,
): TaskActionAvailability {
  if (enabled) return { enabled: true };
  return {
    enabled: false,
    disabledReason: forcedDisabledReason ?? disabledReasonWhenFalse ?? 'Aktion derzeit nicht verfügbar.',
  };
}

function buildNormalizedTimeline(
  events: NonNullable<LegacyFormattedTask['timeline']>,
  usersById: Map<string, TaskUserRef>,
): NormalizedTaskTimelineEvent[] {
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    label: resolveTimelineLabel(event),
    actor: formatUserRef(event.actorUserId, usersById),
    actorUserId: event.actorUserId,
    oldValue: event.oldValue,
    newValue: event.newValue,
    metadata: extractControlledEventMetadata(event.metadata),
    createdAt: event.createdAt,
  }));
}

function resolveTimelineLabel(event: {
  type: string;
  oldValue: string | null;
  newValue: string | null;
  metadata: unknown;
}): string {
  const meta = readMetadata(event.metadata);

  if (meta.resolutionKind === TaskCompletionMode.SUPERSEDED || event.type === 'SUPERSEDED') {
    const reason = resolveEventReasonLabel(meta);
    return reason ? `Automatisch beendet: ${reason}` : 'Automatisch beendet';
  }

  if (event.type === 'AUTO_RESOLVED' || meta.resolutionKind === TaskCompletionMode.AUTO_RESOLVED) {
    const reason = resolveEventReasonLabel(meta);
    return reason ? `Automatisch aufgelöst: ${reason}` : 'Automatisch aufgelöst';
  }

  if (event.type === 'CHECKLIST_ITEM_UPDATED' && meta.field === 'isDone') {
    const title = typeof meta.title === 'string' ? meta.title : 'Checklistenpunkt';
    if (event.newValue === 'true') return `Checklistenpunkt erledigt: ${title}`;
    if (event.newValue === 'false') return `Checklistenpunkt wieder geöffnet: ${title}`;
  }

  if (event.type === 'STATUS_CHANGED') {
    const target = event.newValue ?? '';
    const statusLabel = STATUS_LABEL_DE[target as TaskStatus];
    if (target === 'DONE' && meta.resolutionKind === TaskCompletionMode.MANUAL) {
      return 'Als erledigt markiert';
    }
    if (statusLabel) return `Status: ${statusLabel}`;
  }

  return TIMELINE_TYPE_LABEL_DE[event.type] ?? event.type.replace(/_/g, ' ');
}

function resolveEventReasonLabel(meta: Record<string, unknown>): string | null {
  if (typeof meta.resolutionCode === 'string' && meta.resolutionCode.trim()) {
    const mapped = humanizeResolutionCode(meta.resolutionCode.trim());
    if (mapped !== meta.resolutionCode.trim().replace(/_/g, ' ').toLowerCase()) {
      return mapped;
    }
  }
  if (typeof meta.reason === 'string' && meta.reason.trim()) {
    return humanizeResolutionReason(meta.reason.trim());
  }
  if (typeof meta.resolutionCode === 'string' && meta.resolutionCode.trim()) {
    return humanizeResolutionCode(meta.resolutionCode.trim());
  }
  return null;
}

function humanizeResolutionReason(reason: string): string {
  const cleaned = reason
    .replace(/^\[(Auto-resolved|Superseded)\]\s*/i, '')
    .replace(/^Booking\s+/i, 'Buchung ')
    .replace(/^Invoice\s+/i, 'Rechnung ')
    .trim();
  if (!cleaned) return reason;
  if (/[äöüß]/i.test(cleaned) || /\b(wurde|wurden|ist|sind)\b/i.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

function humanizeResolutionCode(code: string): string {
  const map: Record<string, string> = {
    INVOICE_PAID: 'Rechnung wurde bezahlt',
    BOOKING_CANCELLED: 'Buchung wurde storniert',
    BOOKING_PHASE_SUPERSEDED: 'Buchungsphase wurde ersetzt',
    INVOICE_TASK_SUPERSEDED: 'Rechnungsaufgabe wurde ersetzt',
    DOCUMENT_TASK_SUPERSEDED: 'Dokumentenaufgabe wurde ersetzt',
    CLEANING_TASK_SUPERSEDED: 'Reinigungsaufgabe wurde ersetzt',
    DOCUMENT_PHASE_SUPERSEDED: 'Dokumentenphase wurde ersetzt',
  };
  return map[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function extractControlledEventMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const allowed = [
    'resolutionKind',
    'resolutionCode',
    'reason',
    'ruleId',
    'supersededBy',
    'supersededByTaskId',
    'overriddenBlockers',
    'checklistOverride',
    'openRequiredItems',
    'remainingRequiredItems',
    'transition',
    'itemId',
    'title',
    'field',
    'isRequired',
    'bodyPreview',
    'auto',
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in raw) out[key] = raw[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pickIsoString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function readNested(
  meta: Record<string, unknown>,
  ...path: string[]
): unknown {
  let current: unknown = meta;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}