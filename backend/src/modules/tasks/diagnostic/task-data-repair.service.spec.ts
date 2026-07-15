import { TaskCompletionMode, TaskType } from '@prisma/client';
import { TaskDataDiagnosticService } from './task-data-diagnostic.service';
import { TaskDataRepairService } from './task-data-repair.service';
import type { RepairTaskRow } from './task-data-repair.types';

function task(overrides: Partial<RepairTaskRow> = {}): RepairTaskRow {
  return {
    id: 'task-00000001-0000-4000-8000-000000000001',
    organizationId: 'org-1',
    title: 'Test',
    status: 'DONE',
    type: TaskType.CUSTOM,
    completionMode: null,
    completedAt: null,
    completedByUserId: null,
    cancelledAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
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

function emptyDiagnosticReport() {
  return {
    mode: 'diagnostic' as const,
    dryRun: true as const,
    readOnly: true as const,
    generatedAt: new Date().toISOString(),
    referenceNow: new Date().toISOString(),
    organizationId: 'org-1',
    organizationCount: 1,
    tasksScanned: 0,
    summary: {
      totalFindings: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
      byCategory: {
        done_integrity: 0,
        done_checklist: 0,
        active_duplicates: 0,
        missing_links: 0,
        timing: 0,
        audit: 0,
        legacy_automation: 0,
      },
      byCheck: {},
    },
    checks: [],
  };
}

describe('TaskDataRepairService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    orgTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    taskEvent: { create: jest.fn() },
    taskComment: { updateMany: jest.fn() },
    taskAttachment: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const tasks = {
    supersedeTask: jest.fn(),
    updateTaskTiming: jest.fn(),
  };

  const diagnostic = {
    runDiagnostic: jest.fn(),
  };

  let service: TaskDataRepairService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    diagnostic.runDiagnostic.mockResolvedValue(emptyDiagnosticReport());
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    service = new TaskDataRepairService(prisma as any, tasks as any, diagnostic as any);
  });

  it('defaults to dry-run and plans completion mode backfill for system DONE tasks', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        source: 'BOOKING',
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.dryRun).toBe(true);
    expect(report.apply).toBe(false);
    expect(report.summary.planned).toBeGreaterThanOrEqual(2);
    expect(report.actions.some((a) => a.actionId === 'backfill_completion_mode')).toBe(true);
    expect(report.actions.every((a) => a.applied === false)).toBe(true);
    expect(tasks.supersedeTask).not.toHaveBeenCalled();
  });

  it('leaves unclear completion mode unresolved', async () => {
    prisma.orgTask.findMany.mockResolvedValue([task({ status: 'DONE' })]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.unresolved.some((u) => u.rule === 'backfill_completion_mode')).toBe(true);
    expect(report.actions.some((a) => a.actionId === 'backfill_completion_mode')).toBe(false);
  });

  it('plans MANUAL completion mode for human actor', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        completedByUserId: 'user-1',
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });
    const modeAction = report.actions.find((a) => a.actionId === 'backfill_completion_mode');

    expect(modeAction?.after.completionMode).toBe(TaskCompletionMode.MANUAL);
    expect(report.actions.some((a) => a.actionId === 'backfill_completion_event')).toBe(true);
  });

  it('plans duplicate supersede and resource reassignment without deleting data', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        id: 'canonical',
        status: 'OPEN',
        type: TaskType.BOOKING_PREPARATION,
        bookingId: 'b1',
        dedupKey: 'booking:prep:b1',
      }),
      task({
        id: 'duplicate',
        status: 'OPEN',
        type: TaskType.BOOKING_PREPARATION,
        bookingId: 'b1',
        dedupKey: 'legacy:prep:b1',
        _count: { comments: 2, attachments: 1 },
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.actions.some((a) => a.actionId === 'reassign_task_resources')).toBe(true);
    expect(report.actions.some((a) => a.actionId === 'supersede_duplicate_task')).toBe(true);
  });

  it('documents legacy checklist inconsistency instead of checking items off', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        completionMode: TaskCompletionMode.MANUAL,
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
        checklistItems: [{ id: 'c1', isDone: false, isRequired: true }],
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.actions.some((a) => a.actionId === 'document_legacy_checklist_inconsistency')).toBe(true);
    expect(report.actions.some((a) => a.actionId.includes('checklist'))).toBe(true);
  });

  it('plans timing clamp only for activatesAt after dueDate on active tasks', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'OPEN',
        activatesAt: new Date('2026-12-01T10:00:00.000Z'),
        dueDate: new Date('2026-11-01T10:00:00.000Z'),
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.actions.some((a) => a.actionId === 'fix_timing_activates_after_due')).toBe(true);
  });

  it('applies supersede via TasksService when --apply is used', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        id: 'canonical',
        status: 'OPEN',
        type: TaskType.VEHICLE_CLEANING,
        vehicleId: 'veh-1',
        dedupKey: 'vehicle:cleaning:veh-1:standalone',
      }),
      task({
        id: 'duplicate',
        status: 'OPEN',
        type: TaskType.VEHICLE_CLEANING,
        vehicleId: 'veh-1',
        dedupKey: 'vehicle:cleaning:veh-1:standalone',
      }),
    ]);
    tasks.supersedeTask.mockResolvedValue({});

    const report = await service.runRepair({ organizationId: 'org-1', apply: true, batchSize: 5 });

    expect(tasks.supersedeTask).toHaveBeenCalledWith(
      'org-1',
      'duplicate',
      expect.objectContaining({
        resolutionCode: 'TASK_DATA_REPAIR_SUPERSEDED',
        supersededByTaskId: 'canonical',
      }),
    );
    expect(report.summary.applied).toBeGreaterThan(0);
    expect(diagnostic.runDiagnostic).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when completion mode already set', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        completionMode: TaskCompletionMode.AUTO_RESOLVED,
        source: 'BOOKING',
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        events: [{ type: 'AUTO_RESOLVED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
      }),
    ]);

    const report = await service.runRepair({ organizationId: 'org-1' });

    expect(report.actions.some((a) => a.actionId === 'backfill_completion_mode')).toBe(false);
  });
});
