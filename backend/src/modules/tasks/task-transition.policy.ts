import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

/** Non-terminal statuses — used for overdue, dedup, and summary filters. */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

/** Terminal statuses — no outgoing transitions except idempotent self. */
export const TERMINAL_TASK_STATUSES: TaskStatus[] = ['DONE', 'CANCELLED'];

/**
 * Allowed status transitions (V2 §C.1). Rows = from, values = permitted targets
 * excluding idempotent self (handled separately by canTransition).
 * DONE/CANCELLED have no outgoing transitions to a different status.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'DONE', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ACTIVE_TASK_STATUSES.includes(status);
}

/** True when `to` is reachable from `from`, including idempotent same-status. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

/** Throws when `from` → `to` is not allowed. Same-status is a no-op (idempotent). */
export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new BadRequestException(`Invalid status transition ${from} → ${to}`);
  }
}
