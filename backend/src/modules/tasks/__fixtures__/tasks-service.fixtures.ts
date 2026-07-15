import type { TaskStatus } from '@prisma/client';
import { TasksService } from '../tasks.service';

/** Canonical OrgTask row factory for TasksService unit tests. */
export function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    organizationId: 'org1',
    title: 'Task',
    description: null,
    category: null,
    type: 'CUSTOM',
    status: 'OPEN' as TaskStatus,
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    assignedUserId: null,
    createdByUserId: null,
    updatedByUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    activatesAt: null,
    completionMode: null,
    resolutionCode: null,
    completedByUserId: null,
    supersededByTaskId: null,
    estimatedDurationMinutes: null,
    serviceCaseId: null,
    blocksVehicleAvailability: false,
    metadata: null,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

export function makeTasksPrismaMock() {
  return {
    orgTask: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    taskEvent: { create: jest.fn().mockResolvedValue({}) },
    taskComment: { create: jest.fn() },
    taskChecklistItem: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    taskAttachment: { create: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    dashboardInsight: { findFirst: jest.fn() },
    fine: { findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    vehicleDocumentExtraction: { findUnique: jest.fn() },
    serviceCase: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
}

export type TasksPrismaMock = ReturnType<typeof makeTasksPrismaMock>;

export function createTasksServiceHarness(prisma: TasksPrismaMock = makeTasksPrismaMock()) {
  const activityLog = { log: jest.fn().mockResolvedValue({}) };
  const linkedObjectResolver = { resolveForTask: jest.fn().mockResolvedValue([]) };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  const svc = new TasksService(prisma as any, activityLog as any, linkedObjectResolver as any);
  return { svc, prisma, activityLog, linkedObjectResolver };
}

/** Stages prisma mocks for a successful status transition + getTaskById reload. */
export function mockTaskTransition(
  prisma: TasksPrismaMock,
  from: TaskStatus,
  to: TaskStatus,
  extra: Record<string, unknown> = {},
) {
  const targetRow = baseTask({
    status: to,
    ...(to === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
    ...(to === 'DONE' ? { completionMode: 'MANUAL', completedAt: new Date() } : {}),
    ...(to === 'CANCELLED' ? { completionMode: 'MANUAL', cancelledAt: new Date() } : {}),
    ...extra,
  });
  prisma.orgTask.findFirst
    .mockResolvedValueOnce(baseTask({ status: from, ...extra }))
    .mockResolvedValue({
      ...targetRow,
      checklistItems: [],
      comments: [],
      attachments: [],
      events: [],
    });
  prisma.orgTask.update.mockResolvedValue(targetRow);
  prisma.taskChecklistItem.findMany.mockResolvedValue([]);
  prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1', role: 'ORG_ADMIN' });
}
