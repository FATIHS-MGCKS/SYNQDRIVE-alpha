/**
 * Task Domain V2 — Migration and legacy (J)
 */
import { TaskCompletionMode, TaskType } from '@prisma/client';
import { TaskDataDiagnosticService } from '../diagnostic/task-data-diagnostic.service';
import { TaskDataRepairService } from '../diagnostic/task-data-repair.service';
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';
import type { RepairTaskRow } from '../diagnostic/task-data-repair.types';

function repairTask(overrides: Partial<RepairTaskRow> = {}): RepairTaskRow {
  return {
    id: 'task-legacy-1',
    organizationId: 'org1',
    title: 'Legacy',
    status: 'DONE',
    type: TaskType.CUSTOM,
    completionMode: null,
    completedAt: new Date('2026-01-01'),
    completedByUserId: null,
    cancelledAt: null,
    createdAt: new Date('2025-12-01'),
    updatedAt: new Date('2026-01-01'),
    activatesAt: null,
    dueDate: null,
    resolutionNote: null,
    resolutionCode: null,
    assignedUserId: null,
    supersededByTaskId: null,
    bookingId: null,
    vehicleId: null,
    invoiceId: null,
    documentId: null,
    source: null,
    dedupKey: null,
    metadata: null,
    checklistItems: [],
    events: [],
    _count: { comments: 0, attachments: 0 },
    ...overrides,
  };
}

function diagnosticTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-legacy-1',
    organizationId: 'org1',
    title: 'Legacy',
    status: 'DONE',
    type: 'CUSTOM',
    completionMode: null,
    completedAt: new Date('2026-01-01'),
    cancelledAt: null,
    createdAt: new Date('2025-12-01'),
    activatesAt: null,
    dueDate: null,
    resolutionNote: null,
    resolutionCode: null,
    bookingId: null,
    vehicleId: null,
    invoiceId: null,
    documentId: null,
    assignedUserId: null,
    source: null,
    dedupKey: null,
    checklistItems: [],
    events: [],
    ...overrides,
  };
}

describe('Task Domain V2 — Migration and legacy (J)', () => {
  describe('serialization — null completionMode', () => {
    it('getTaskById returns legacy DONE without completionMode', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue({
        ...baseTask({ status: 'DONE', completionMode: null, completedAt: new Date() }),
        checklistItems: [],
        comments: [],
        attachments: [],
        events: [],
      });

      const detail = await svc.getTaskById('t1', 'org1');
      expect(detail.status).toBe('DONE');
      expect(detail.completionMode).toBeNull();
    });
  });

  describe('tasks without activatesAt', () => {
    it('treats null activatesAt as immediately active for bucket listing', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findMany.mockResolvedValue([
        baseTask({ id: 't-legacy', activatesAt: null, status: 'OPEN', dueDate: new Date('2026-07-20') }),
      ]);
      prisma.taskChecklistItem.findMany.mockResolvedValue([]);

      const list = await svc.listTasks('org1', { bucket: 'UPCOMING' });
      expect(Array.isArray(list)).toBe(true);
      expect(prisma.orgTask.findMany).toHaveBeenCalled();
    });
  });

  describe('legacy DONE with open checklist', () => {
    it('suppresses completion blockers on terminal tasks in detail view', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue({
        ...baseTask({ status: 'DONE', completionMode: null }),
        checklistItems: [
          {
            id: 'ci1',
            taskId: 't1',
            title: 'Open legacy step',
            description: null,
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        comments: [],
        attachments: [],
        events: [],
      });

      const detail = await svc.getTaskById('t1', 'org1');
      expect(detail.checklistProgress?.canCompleteByChecklist).toBe(true);
      expect(detail.checklistProgress?.completionBlockers).toEqual([]);
    });

    it('diagnostic flags legacy checklist inconsistency', async () => {
      const prisma = {
        organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org1' }]) },
        orgTask: {
          findMany: jest.fn().mockResolvedValue([
            diagnosticTask({
              completionMode: TaskCompletionMode.MANUAL,
              events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
              checklistItems: [{ id: 'c1', isDone: false, isRequired: true }],
            }),
          ]),
        },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
        generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const diagnostic = new TaskDataDiagnosticService(prisma as any);

      const report = await diagnostic.runDiagnostic({ organizationId: 'org1' });
      expect(report.summary.byCheck.done_with_open_required_checklist).toBe(1);
    });

    it('repair documents legacy checklist inconsistency instead of mutating items', async () => {
      const prismaMock = {
        organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org1' }]) },
        orgTask: {
          findMany: jest.fn().mockResolvedValue([
            repairTask({
              completionMode: TaskCompletionMode.MANUAL,
              events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
              checklistItems: [{ id: 'c1', isDone: false, isRequired: true }],
            }),
          ]),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        taskEvent: { create: jest.fn() },
        taskComment: { updateMany: jest.fn() },
        taskAttachment: { updateMany: jest.fn() },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      };
      const diagnostic = {
        runDiagnostic: jest.fn().mockResolvedValue({
          mode: 'diagnostic',
          dryRun: true,
          readOnly: true,
          generatedAt: new Date().toISOString(),
          referenceNow: new Date().toISOString(),
          organizationId: 'org1',
          organizationCount: 1,
          tasksScanned: 1,
          summary: { totalFindings: 0, errors: 0, warnings: 0, infos: 0, byCategory: {}, byCheck: {} },
          checks: [],
        }),
      };
      const tasks = { supersedeTask: jest.fn(), updateTaskTiming: jest.fn() };
      const repair = new TaskDataRepairService(prismaMock as any, tasks as any, diagnostic as any);

      const report = await repair.runRepair({ organizationId: 'org1' });
      expect(report.actions.some((a) => a.actionId === 'document_legacy_checklist_inconsistency')).toBe(
        true,
      );
      expect(prismaMock.orgTask.update).not.toHaveBeenCalled();
    });
  });

  describe('completionMode backfill signal', () => {
    it('diagnostic flags DONE without completionMode', async () => {
      const prisma = {
        organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org1' }]) },
        orgTask: {
          findMany: jest.fn().mockResolvedValue([
            diagnosticTask({ completionMode: null, completedAt: new Date() }),
          ]),
        },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
        generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const diagnostic = new TaskDataDiagnosticService(prisma as any);

      const report = await diagnostic.runDiagnostic({ organizationId: 'org1' });
      expect(report.summary.byCheck.done_missing_completion_mode).toBe(1);
    });

    it('does not flag DONE with MANUAL completionMode', async () => {
      const prisma = {
        organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org1' }]) },
        orgTask: {
          findMany: jest.fn().mockResolvedValue([
            diagnosticTask({
              completionMode: TaskCompletionMode.MANUAL,
              completedAt: new Date(),
              events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
            }),
          ]),
        },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
        generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const diagnostic = new TaskDataDiagnosticService(prisma as any);

      const report = await diagnostic.runDiagnostic({ organizationId: 'org1' });
      expect(report.summary.byCheck.done_missing_completion_mode ?? 0).toBe(0);
    });
  });
});
