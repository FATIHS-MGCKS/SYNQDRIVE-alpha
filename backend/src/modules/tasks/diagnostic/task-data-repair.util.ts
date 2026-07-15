import { TaskCompletionMode, TaskType } from '@prisma/client';
import { isLegacyPerTypeDocumentDedupKey } from '@modules/documents/booking-document-phase.util';
import { isInvoicePaymentCheckDedupKey } from '@modules/invoices/invoice-payment-task.util';
import {
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
} from '../booking-task-automation.constants';
import { isActiveTaskStatus } from '../task-transition.policy';
import {
  isBareLegacyVehicleCleaningDedupKey,
  isCanonicalVehicleCleaningDedupKey,
  isLegacyBookingCleanDedupKey,
} from '../vehicle-cleaning-task.util';
import { TASK_DATA_REPAIR_SCRIPT_VERSION } from './task-data-repair.types';
import type { RepairTaskRow } from './task-data-repair.types';

export const KNOWN_AUTOMATION_SOURCES = new Set([
  'BOOKING',
  'DOCUMENT',
  'VENDOR',
  'INVOICE',
  'INSIGHT_SERVICE',
  'INSIGHT_COMPLIANCE',
  'INSIGHT_HEALTH',
  'VEHICLE_CLEANING',
]);

export function buildBackfillMetadata(
  repairRule: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    provenance: 'BACKFILL',
    scriptVersion: TASK_DATA_REPAIR_SCRIPT_VERSION,
    repairRule,
    ...extra,
  };
}

export function hasCompletionEvent(task: RepairTaskRow): boolean {
  return task.events.some(
    (e) =>
      (e.type === 'STATUS_CHANGED' && e.newValue === 'DONE') ||
      e.type === 'AUTO_RESOLVED' ||
      e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN',
  );
}

export function inferCompletionMode(task: RepairTaskRow): TaskCompletionMode | null {
  if (task.completionMode) return task.completionMode;
  if (task.status !== 'DONE') return null;

  if (task.completedByUserId) return TaskCompletionMode.MANUAL;

  if (task.events.some((e) => e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN')) {
    return TaskCompletionMode.MANUAL;
  }

  const manualStatusEvent = task.events.find(
    (e) => e.type === 'STATUS_CHANGED' && e.newValue === 'DONE' && e.actorUserId,
  );
  if (manualStatusEvent) return TaskCompletionMode.MANUAL;

  if (task.events.some((e) => e.type === 'SUPERSEDED') || task.supersededByTaskId) {
    return TaskCompletionMode.SUPERSEDED;
  }

  if (task.events.some((e) => e.type === 'AUTO_RESOLVED')) {
    return TaskCompletionMode.AUTO_RESOLVED;
  }

  if (task.source && KNOWN_AUTOMATION_SOURCES.has(task.source) && !task.completedByUserId) {
    return TaskCompletionMode.AUTO_RESOLVED;
  }

  return null;
}

export function inferCompletedAt(task: RepairTaskRow): Date | null {
  if (task.completedAt) return task.completedAt;
  if (task.status !== 'DONE') return null;

  const completionEvents = task.events.filter(
    (e) =>
      (e.type === 'STATUS_CHANGED' && e.newValue === 'DONE') ||
      e.type === 'AUTO_RESOLVED' ||
      e.type === 'SUPERSEDED' ||
      e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN',
  );
  if (completionEvents.length > 0) {
    return completionEvents[completionEvents.length - 1]!.createdAt;
  }

  if (task.updatedAt.getTime() >= task.createdAt.getTime()) {
    return task.updatedAt;
  }

  return null;
}

export function hasLegacyChecklistDocumented(task: RepairTaskRow): boolean {
  if (!task.metadata || typeof task.metadata !== 'object' || Array.isArray(task.metadata)) {
    return false;
  }
  const meta = task.metadata as Record<string, unknown>;
  return Boolean(meta.legacyChecklistInconsistency);
}

export function isCanonicalDedupKey(task: RepairTaskRow): boolean {
  const key = task.dedupKey;
  if (!key) return false;
  if (isLegacyBookingCleanDedupKey(key)) return false;
  if (isBareLegacyVehicleCleaningDedupKey(key)) return false;
  if (isLegacyPerTypeDocumentDedupKey(key)) return false;
  if (key.startsWith('invoice:unpaid:')) return false;

  switch (task.type) {
    case TaskType.BOOKING_PREPARATION:
      return key === bookingPreparationDedupKey(task.bookingId ?? '');
    case TaskType.BOOKING_PICKUP:
      return key === bookingPickupDedupKey(task.bookingId ?? '');
    case TaskType.BOOKING_RETURN:
      return key === bookingReturnDedupKey(task.bookingId ?? '');
    case TaskType.DOCUMENT_REVIEW:
      return key.startsWith('document:package:');
    case TaskType.VEHICLE_CLEANING:
      return isCanonicalVehicleCleaningDedupKey(key);
    case TaskType.INVOICE_REQUIRED:
      return task.invoiceId ? isInvoicePaymentCheckDedupKey(key) : false;
    default:
      return true;
  }
}

export function scoreCanonicalCandidate(task: RepairTaskRow): number {
  let score = 0;
  if (isCanonicalDedupKey(task)) score += 100;
  score += (task._count?.comments ?? 0) * 2;
  score += (task._count?.attachments ?? 0) * 3;
  if (task.type === TaskType.VEHICLE_CLEANING) {
    score -= task.createdAt.getTime() / 1_000_000_000;
  } else {
    score += task.updatedAt.getTime() / 1_000_000_000;
  }
  return score;
}

export function pickCanonicalTask(group: RepairTaskRow[]): RepairTaskRow {
  return [...group].sort((a, b) => {
    const scoreDiff = scoreCanonicalCandidate(b) - scoreCanonicalCandidate(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

export function cleaningWindowKey(task: RepairTaskRow): string {
  if (task.dedupKey && isCanonicalVehicleCleaningDedupKey(task.dedupKey)) {
    return task.dedupKey;
  }
  if (task.dedupKey && isLegacyBookingCleanDedupKey(task.dedupKey)) {
    return `legacy-booking-clean:${task.dedupKey}`;
  }
  return `vehicle:${task.vehicleId}:fallback`;
}

export function groupActiveDuplicates(tasks: RepairTaskRow[]): RepairTaskRow[][] {
  const active = tasks.filter((t) => isActiveTaskStatus(t.status));
  const groups: RepairTaskRow[][] = [];

  const byDedup = new Map<string, RepairTaskRow[]>();
  for (const task of active) {
    if (!task.dedupKey) continue;
    const list = byDedup.get(task.dedupKey) ?? [];
    list.push(task);
    byDedup.set(task.dedupKey, list);
  }
  for (const group of byDedup.values()) {
    if (group.length > 1) groups.push(group);
  }

  groups.push(
    ...groupByKey(
      active.filter((t) => t.type === TaskType.BOOKING_PREPARATION && t.bookingId),
      (t) => `booking-prep:${t.bookingId}`,
    ),
  );
  groups.push(
    ...groupByKey(
      active.filter((t) => t.type === TaskType.DOCUMENT_REVIEW && t.dedupKey?.startsWith('document:package:')),
      (t) => t.dedupKey!,
    ),
  );
  groups.push(
    ...groupByKey(
      active.filter((t) => t.type === TaskType.VEHICLE_CLEANING && t.vehicleId),
      cleaningWindowKey,
    ),
  );
  groups.push(
    ...groupByKey(
      active.filter((t) => t.type === TaskType.INVOICE_REQUIRED && t.invoiceId),
      (t) => `invoice-payment:${t.invoiceId}`,
    ),
  );

  return dedupeGroups(groups);
}

function groupByKey(tasks: RepairTaskRow[], keyFn: (task: RepairTaskRow) => string): RepairTaskRow[][] {
  const groups = new Map<string, RepairTaskRow[]>();
  for (const task of tasks) {
    const key = keyFn(task);
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function dedupeGroups(groups: RepairTaskRow[][]): RepairTaskRow[][] {
  const seen = new Set<string>();
  const out: RepairTaskRow[][] = [];
  for (const group of groups) {
    const key = [...group.map((t) => t.id)].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(group);
  }
  return out;
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
