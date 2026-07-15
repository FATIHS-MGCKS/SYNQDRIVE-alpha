import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import {
  ACTIVE_TASK_STATUSES,
  assertTaskTransition,
  canTransition,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  TASK_STATUS_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
} from './task-transition.policy';

const ALL_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'];

const ALLOWED_PAIRS: Array<[TaskStatus, TaskStatus]> = [
  ['OPEN', 'IN_PROGRESS'],
  ['OPEN', 'WAITING'],
  ['OPEN', 'DONE'],
  ['OPEN', 'CANCELLED'],
  ['IN_PROGRESS', 'WAITING'],
  ['IN_PROGRESS', 'DONE'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['WAITING', 'IN_PROGRESS'],
  ['WAITING', 'DONE'],
  ['WAITING', 'CANCELLED'],
];

const FORBIDDEN_PAIRS: Array<[TaskStatus, TaskStatus]> = [
  ['IN_PROGRESS', 'OPEN'],
  ['WAITING', 'OPEN'],
  ['DONE', 'OPEN'],
  ['DONE', 'IN_PROGRESS'],
  ['DONE', 'WAITING'],
  ['DONE', 'CANCELLED'],
  ['CANCELLED', 'OPEN'],
  ['CANCELLED', 'IN_PROGRESS'],
  ['CANCELLED', 'WAITING'],
  ['CANCELLED', 'DONE'],
];

describe('task-transition.policy', () => {
  it('exports stable active and terminal status sets', () => {
    expect(ACTIVE_TASK_STATUSES).toEqual(['OPEN', 'IN_PROGRESS', 'WAITING']);
    expect(TERMINAL_TASK_STATUSES).toEqual(['DONE', 'CANCELLED']);
    expect([...ACTIVE_TASK_STATUSES, ...TERMINAL_TASK_STATUSES].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('matches the normative transition matrix for non-idempotent moves', () => {
    expect(TASK_STATUS_TRANSITIONS.OPEN).toEqual(['IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED']);
    expect(TASK_STATUS_TRANSITIONS.IN_PROGRESS).toEqual(['WAITING', 'DONE', 'CANCELLED']);
    expect(TASK_STATUS_TRANSITIONS.WAITING).toEqual(['IN_PROGRESS', 'DONE', 'CANCELLED']);
    expect(TASK_STATUS_TRANSITIONS.DONE).toEqual([]);
    expect(TASK_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
  });

  describe('isActiveTaskStatus / isTerminalTaskStatus', () => {
    it.each(ACTIVE_TASK_STATUSES.map((s) => [s]))('treats %s as active', (status) => {
      expect(isActiveTaskStatus(status)).toBe(true);
      expect(isTerminalTaskStatus(status)).toBe(false);
    });

    it.each(TERMINAL_TASK_STATUSES.map((s) => [s]))('treats %s as terminal', (status) => {
      expect(isTerminalTaskStatus(status)).toBe(true);
      expect(isActiveTaskStatus(status)).toBe(false);
    });
  });

  describe('canTransition', () => {
    it.each(ALLOWED_PAIRS)('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    it.each(FORBIDDEN_PAIRS)('forbids %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });

    it.each(ALL_STATUSES)('treats identical status %s as idempotent', (status) => {
      expect(canTransition(status, status)).toBe(true);
    });
  });

  describe('assertTaskTransition', () => {
    it.each(ALLOWED_PAIRS)('does not throw for allowed %s → %s', (from, to) => {
      expect(() => assertTaskTransition(from, to)).not.toThrow();
    });

    it.each(FORBIDDEN_PAIRS)('throws for forbidden %s → %s', (from, to) => {
      expect(() => assertTaskTransition(from, to)).toThrow(BadRequestException);
      expect(() => assertTaskTransition(from, to)).toThrow(`Invalid status transition ${from} → ${to}`);
    });

    it.each(ALL_STATUSES)('does not throw for idempotent %s → %s', (status) => {
      expect(() => assertTaskTransition(status, status)).not.toThrow();
    });
  });
});
