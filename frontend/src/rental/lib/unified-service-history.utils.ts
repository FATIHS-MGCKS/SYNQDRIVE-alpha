import type {
  ApiServiceCase,
  ApiTask,
  VehicleServiceEventRecord,
} from '../../lib/api';
import type { Invoice } from '../components/invoices/invoiceTypes';
import { formatServiceEventTypeDe } from './service-info-display';
import {
  applyServiceHistoryFilters,
  completedDateKey,
  isMaintenanceHistoryTask,
  taskCompletedTimestamp,
  type ServiceHistoryFilters,
} from './service-history.utils';

const MS_DAY = 24 * 60 * 60 * 1000;
const LOCALE = 'de-DE';

export type ServiceHistoryEventKind =
  | 'task_completed'
  | 'task_cancelled'
  | 'case_completed'
  | 'case_cancelled'
  | 'case_status_change'
  | 'service_event'
  | 'linked_document'
  | 'linked_invoice';

export type ServiceHistorySource =
  | 'task'
  | 'service_case'
  | 'vehicle_service_event'
  | 'invoice'
  | 'document';

export const SERVICE_HISTORY_EVENT_KIND_LABEL: Record<ServiceHistoryEventKind, string> = {
  task_completed: 'Aufgabe erledigt',
  task_cancelled: 'Aufgabe storniert',
  case_completed: 'Servicefall abgeschlossen',
  case_cancelled: 'Servicefall storniert',
  case_status_change: 'Servicefall-Status',
  service_event: 'Serviceereignis',
  linked_document: 'Dokument verknüpft',
  linked_invoice: 'Rechnung verknüpft',
};

export const SERVICE_HISTORY_SOURCE_LABEL: Record<ServiceHistorySource, string> = {
  task: 'Aufgaben',
  service_case: 'Servicefall',
  vehicle_service_event: 'Serviceereignis',
  invoice: 'Rechnung',
  document: 'Dokument',
};

const TERMINAL_CASE_STATUSES = new Set<ApiServiceCase['status']>(['COMPLETED', 'CANCELLED']);

const RELEVANT_SERVICE_EVENT_TYPES = new Set<VehicleServiceEventRecord['eventType']>([
  'SERVICE',
  'OIL_CHANGE',
  'REPAIR',
  'TUV_INSPECTION',
  'BOKRAFT_INSPECTION',
  'FULL_SERVICE',
]);

export interface UnifiedServiceHistoryEntry {
  id: string;
  dedupeKey: string;
  kind: ServiceHistoryEventKind;
  source: ServiceHistorySource;
  occurredAt: string;
  sortMs: number;
  vehicleId: string | null;
  vendorId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  title: string;
  subtitle: string | null;
  task?: ApiTask;
  serviceCase?: ApiServiceCase;
  serviceEvent?: VehicleServiceEventRecord;
  invoiceId?: string;
  documentId?: string;
}

export interface UnifiedServiceHistoryFilters extends ServiceHistoryFilters {
  kind: ServiceHistoryEventKind | 'ALL';
}

export const DEFAULT_UNIFIED_SERVICE_HISTORY_FILTERS: UnifiedServiceHistoryFilters = {
  vehicleId: 'ALL',
  vendorId: 'ALL',
  type: 'ALL',
  dateFrom: '',
  dateTo: '',
  includeCancelled: false,
  kind: 'ALL',
};

export interface BuildUnifiedServiceHistoryInput {
  tasks: ApiTask[];
  serviceCases: ApiServiceCase[];
  serviceEvents?: VehicleServiceEventRecord[];
  invoicesById?: Map<string, Pick<Invoice, 'id' | 'invoiceNumberDisplay' | 'title' | 'invoiceDate' | 'vehicleId' | 'vendorId'>>;
}

export interface UnifiedServiceHistoryPage {
  items: UnifiedServiceHistoryEntry[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export const DEFAULT_UNIFIED_SERVICE_HISTORY_PAGE_SIZE = 50;

function parseInstantMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pushEntry(
  entries: UnifiedServiceHistoryEntry[],
  seen: Set<string>,
  entry: UnifiedServiceHistoryEntry,
) {
  if (seen.has(entry.dedupeKey)) return;
  seen.add(entry.dedupeKey);
  entries.push(entry);
}

function terminalCaseTimestamp(serviceCase: ApiServiceCase): string | null {
  if (serviceCase.status === 'COMPLETED') return serviceCase.completedAt;
  if (serviceCase.status === 'CANCELLED') return serviceCase.cancelledAt;
  return null;
}

function isTerminalServiceCase(serviceCase: ApiServiceCase): boolean {
  return TERMINAL_CASE_STATUSES.has(serviceCase.status);
}

function taskActor(task: ApiTask): { userId: string | null; name: string | null } {
  return {
    userId: task.completedByUserId ?? task.updatedByUserId ?? task.createdByUserId ?? null,
    name: task.assignedUserName ?? task.createdByName ?? null,
  };
}

function caseActor(serviceCase: ApiServiceCase): { userId: string | null; name: string | null } {
  return {
    userId: serviceCase.updatedByUserId ?? serviceCase.createdByUserId ?? null,
    name: null,
  };
}

function buildTerminalCaseKeys(serviceCases: ApiServiceCase[]): Set<string> {
  const keys = new Set<string>();
  for (const serviceCase of serviceCases) {
    if (!isTerminalServiceCase(serviceCase)) continue;
    keys.add(serviceCase.id);
  }
  return keys;
}

function shouldSuppressLinkedTask(task: ApiTask, terminalCaseIds: Set<string>): boolean {
  if (!task.serviceCaseId) return false;
  if (!terminalCaseIds.has(task.serviceCaseId)) return false;
  return task.status === 'DONE' || task.status === 'CANCELLED';
}

function buildTaskEntries(
  tasks: ApiTask[],
  terminalCaseIds: Set<string>,
  entries: UnifiedServiceHistoryEntry[],
  seen: Set<string>,
) {
  for (const task of tasks) {
    if (!isMaintenanceHistoryTask(task)) continue;
    if (shouldSuppressLinkedTask(task, terminalCaseIds)) continue;

    const sortMs = taskCompletedTimestamp(task);
    if (!sortMs) continue;
    const occurredAt = new Date(sortMs).toISOString();
    const actor = taskActor(task);
    const kind: ServiceHistoryEventKind =
      task.status === 'CANCELLED' ? 'task_cancelled' : 'task_completed';

    pushEntry(entries, seen, {
      id: `task:${task.id}:${kind}`,
      dedupeKey: `task:${task.id}:${kind}`,
      kind,
      source: 'task',
      occurredAt,
      sortMs,
      vehicleId: task.vehicleId,
      vendorId: task.vendorId,
      actorUserId: actor.userId,
      actorName: actor.name,
      title: task.title,
      subtitle: task.resolutionNote,
      task,
    });

    if (task.documentId) {
      pushEntry(entries, seen, {
        id: `task-doc:${task.id}:${task.documentId}`,
        dedupeKey: `document:${task.documentId}`,
        kind: 'linked_document',
        source: 'document',
        occurredAt,
        sortMs,
        vehicleId: task.vehicleId,
        vendorId: task.vendorId,
        actorUserId: actor.userId,
        actorName: actor.name,
        title: 'Dokument verknüpft',
        subtitle: task.title,
        task,
        documentId: task.documentId,
      });
    }

    if (task.invoiceId) {
      pushEntry(entries, seen, {
        id: `task-inv:${task.id}:${task.invoiceId}`,
        dedupeKey: `invoice:${task.invoiceId}`,
        kind: 'linked_invoice',
        source: 'invoice',
        occurredAt,
        sortMs,
        vehicleId: task.vehicleId,
        vendorId: task.vendorId,
        actorUserId: actor.userId,
        actorName: actor.name,
        title: 'Rechnung verknüpft',
        subtitle: task.title,
        task,
        invoiceId: task.invoiceId,
      });
    }

    for (const attachment of task.attachments ?? []) {
      const attachmentMs = parseInstantMs(attachment.createdAt);
      if (attachmentMs == null) continue;
      pushEntry(entries, seen, {
        id: `task-att:${attachment.id}`,
        dedupeKey: `task_attachment:${attachment.id}`,
        kind: 'linked_document',
        source: 'document',
        occurredAt: attachment.createdAt,
        sortMs: attachmentMs,
        vehicleId: task.vehicleId,
        vendorId: task.vendorId,
        actorUserId: attachment.uploadedByUserId,
        actorName: null,
        title: attachment.fileName ? `Anhang: ${attachment.fileName}` : 'Anhang hochgeladen',
        subtitle: task.title,
        task,
        documentId: task.documentId ?? undefined,
      });
    }
  }
}

function buildCaseMilestone(
  serviceCase: ApiServiceCase,
  id: string,
  dedupeKey: string,
  title: string,
  iso: string | null | undefined,
  entries: UnifiedServiceHistoryEntry[],
  seen: Set<string>,
) {
  const sortMs = parseInstantMs(iso);
  if (sortMs == null || !iso) return;
  const actor = caseActor(serviceCase);
  pushEntry(entries, seen, {
    id,
    dedupeKey,
    kind: 'case_status_change',
    source: 'service_case',
    occurredAt: iso,
    sortMs,
    vehicleId: serviceCase.vehicleId,
    vendorId: serviceCase.vendorId,
    actorUserId: actor.userId,
    actorName: actor.name,
    title,
    subtitle: serviceCase.title,
    serviceCase,
  });
}

function buildServiceCaseEntries(
  serviceCases: ApiServiceCase[],
  entries: UnifiedServiceHistoryEntry[],
  seen: Set<string>,
) {
  for (const serviceCase of serviceCases) {
    if (!isTerminalServiceCase(serviceCase)) continue;

    buildCaseMilestone(
      serviceCase,
      `case-opened:${serviceCase.id}`,
      `case:${serviceCase.id}:opened`,
      'Servicefall eröffnet',
      serviceCase.openedAt ?? serviceCase.createdAt,
      entries,
      seen,
    );

    if (serviceCase.scheduledAt) {
      buildCaseMilestone(
        serviceCase,
        `case-scheduled:${serviceCase.id}`,
        `case:${serviceCase.id}:scheduled`,
        'Werkstatttermin gesetzt',
        serviceCase.scheduledAt,
        entries,
        seen,
      );
    }

    const terminalIso = terminalCaseTimestamp(serviceCase);
    const terminalMs = parseInstantMs(terminalIso);
    if (terminalMs == null || !terminalIso) continue;

    const actor = caseActor(serviceCase);
    const terminalKind: ServiceHistoryEventKind =
      serviceCase.status === 'CANCELLED' ? 'case_cancelled' : 'case_completed';

    pushEntry(entries, seen, {
      id: `case-terminal:${serviceCase.id}:${terminalKind}`,
      dedupeKey: `case:${serviceCase.id}:${terminalKind}`,
      kind: terminalKind,
      source: 'service_case',
      occurredAt: terminalIso,
      sortMs: terminalMs,
      vehicleId: serviceCase.vehicleId,
      vendorId: serviceCase.vendorId,
      actorUserId: actor.userId,
      actorName: actor.name,
      title: serviceCase.title,
      subtitle: serviceCase.completionNotes,
      serviceCase,
    });

    if (serviceCase.documentId) {
      pushEntry(entries, seen, {
        id: `case-doc:${serviceCase.id}:${serviceCase.documentId}`,
        dedupeKey: `document:${serviceCase.documentId}`,
        kind: 'linked_document',
        source: 'document',
        occurredAt: terminalIso,
        sortMs: terminalMs,
        vehicleId: serviceCase.vehicleId,
        vendorId: serviceCase.vendorId,
        actorUserId: actor.userId,
        actorName: actor.name,
        title: 'Dokument verknüpft',
        subtitle: serviceCase.title,
        serviceCase,
        documentId: serviceCase.documentId,
      });
    }

    for (const attachment of serviceCase.attachments ?? []) {
      const attachmentMs = parseInstantMs(attachment.createdAt);
      if (attachmentMs == null) continue;
      pushEntry(entries, seen, {
        id: `case-att:${attachment.id}`,
        dedupeKey: `case_attachment:${attachment.id}`,
        kind: 'linked_document',
        source: 'document',
        occurredAt: attachment.createdAt,
        sortMs: attachmentMs,
        vehicleId: serviceCase.vehicleId,
        vendorId: serviceCase.vendorId,
        actorUserId: attachment.uploadedByUserId,
        actorName: null,
        title: attachment.fileName ? `Anhang: ${attachment.fileName}` : 'Dokument hochgeladen',
        subtitle: serviceCase.title,
        serviceCase,
      });
    }
  }
}

function buildServiceEventEntries(
  serviceEvents: VehicleServiceEventRecord[],
  entries: UnifiedServiceHistoryEntry[],
  seen: Set<string>,
) {
  for (const event of serviceEvents) {
    if (!RELEVANT_SERVICE_EVENT_TYPES.has(event.eventType)) continue;
    const sortMs = parseInstantMs(event.eventDate) ?? parseInstantMs(event.createdAt);
    if (sortMs == null) continue;
    const occurredAt = event.eventDate ?? event.createdAt;
    pushEntry(entries, seen, {
      id: `service-event:${event.id}`,
      dedupeKey: `service_event:${event.id}`,
      kind: 'service_event',
      source: 'vehicle_service_event',
      occurredAt,
      sortMs,
      vehicleId: event.vehicleId,
      vendorId: null,
      actorUserId: event.createdById,
      actorName: event.workshopName,
      title: formatServiceEventTypeDe(event.eventType),
      subtitle: event.notes,
      serviceEvent: event,
    });
  }
}

function enrichInvoiceEntries(
  entries: UnifiedServiceHistoryEntry[],
  invoicesById: Map<string, Pick<Invoice, 'id' | 'invoiceNumberDisplay' | 'title' | 'invoiceDate' | 'vehicleId' | 'vendorId'>>,
) {
  for (const entry of entries) {
    if (!entry.invoiceId) continue;
    const invoice = invoicesById.get(entry.invoiceId);
    if (!invoice) continue;
    entry.title = invoice.invoiceNumberDisplay || invoice.title || entry.title;
    const invoiceMs = parseInstantMs(invoice.invoiceDate);
    if (invoiceMs != null) {
      entry.sortMs = invoiceMs;
      entry.occurredAt = invoice.invoiceDate;
    }
    if (!entry.vehicleId) entry.vehicleId = invoice.vehicleId;
    if (!entry.vendorId) entry.vendorId = invoice.vendorId;
  }
}

export function buildUnifiedServiceHistory(
  input: BuildUnifiedServiceHistoryInput,
): UnifiedServiceHistoryEntry[] {
  const entries: UnifiedServiceHistoryEntry[] = [];
  const seen = new Set<string>();
  const terminalCaseIds = buildTerminalCaseKeys(input.serviceCases);
  const invoicesById = input.invoicesById ?? new Map();

  buildTaskEntries(input.tasks, terminalCaseIds, entries, seen);
  buildServiceCaseEntries(input.serviceCases, entries, seen);
  buildServiceEventEntries(input.serviceEvents ?? [], entries, seen);
  enrichInvoiceEntries(entries, invoicesById);

  return entries.sort((a, b) => b.sortMs - a.sortMs);
}

/** Backward-compatible task-only history via unified builder. */
export function buildTaskOnlyServiceHistory(tasks: ApiTask[]): UnifiedServiceHistoryEntry[] {
  return buildUnifiedServiceHistory({ tasks, serviceCases: [], serviceEvents: [] });
}

export function applyUnifiedServiceHistoryFilters(
  entries: UnifiedServiceHistoryEntry[],
  filters: UnifiedServiceHistoryFilters,
): UnifiedServiceHistoryEntry[] {
  const taskBacked = entries.filter((entry) => entry.task);
  const filteredTaskIds = new Set(
    applyServiceHistoryFilters(
      taskBacked.map((entry) => entry.task!),
      filters,
    ).map((task) => task.id),
  );

  return entries
    .filter((entry) => {
      if (entry.kind === 'task_completed' || entry.kind === 'task_cancelled') {
        if (!entry.task) return false;
        if (!filteredTaskIds.has(entry.task.id)) return false;
      }
      if (!filters.includeCancelled) {
        if (entry.kind === 'task_cancelled' || entry.kind === 'case_cancelled') return false;
      }
      if (filters.kind !== 'ALL' && entry.kind !== filters.kind) return false;
      if (filters.vehicleId !== 'ALL' && entry.vehicleId !== filters.vehicleId) return false;
      if (filters.vendorId !== 'ALL' && entry.vendorId !== filters.vendorId) return false;
      if (filters.type !== 'ALL' && entry.task && entry.task.type !== filters.type) return false;
      if (filters.dateFrom || filters.dateTo) {
        if (filters.dateFrom) {
          const from = new Date(filters.dateFrom).getTime();
          if (entry.sortMs < from) return false;
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo).getTime() + MS_DAY;
          if (entry.sortMs >= to) return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.sortMs - a.sortMs);
}

export function historyDateKeyFromMs(sortMs: number): string {
  if (!sortMs) return 'Unbekanntes Datum';
  return new Date(sortMs).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function groupUnifiedHistoryByDate(
  entries: UnifiedServiceHistoryEntry[],
): Map<string, UnifiedServiceHistoryEntry[]> {
  const map = new Map<string, UnifiedServiceHistoryEntry[]>();
  for (const entry of entries) {
    const key = historyDateKeyFromMs(entry.sortMs);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  for (const [key, list] of map.entries()) {
    map.set(
      key,
      [...list].sort((a, b) => b.sortMs - a.sortMs),
    );
  }
  return map;
}

export function paginateUnifiedServiceHistory(
  entries: UnifiedServiceHistoryEntry[],
  options: { offset?: number; limit?: number } = {},
): UnifiedServiceHistoryPage {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? DEFAULT_UNIFIED_SERVICE_HISTORY_PAGE_SIZE);
  const slice = entries.slice(offset, offset + limit);
  const nextOffset = offset + limit < entries.length ? offset + limit : null;
  return {
    items: slice,
    total: entries.length,
    hasMore: nextOffset != null,
    nextOffset,
  };
}

/** Legacy helper — still used by task-only code paths. */
export { completedDateKey, taskCompletedTimestamp };
