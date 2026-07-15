import { TaskDataDiagnosticService } from './task-data-diagnostic.service';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-00000001-0000-4000-8000-000000000001',
    organizationId: 'org-1',
    title: 'Test',
    status: 'OPEN',
    type: 'CUSTOM',
    completionMode: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
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

describe('TaskDataDiagnosticService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    orgTask: { findMany: jest.fn() },
    booking: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
  };

  let service: TaskDataDiagnosticService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    service = new TaskDataDiagnosticService(prisma as any);
  });

  it('flags DONE without completedAt and completion event', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({ status: 'DONE', completionMode: 'MANUAL' }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1', sampleLimit: 5 });

    expect(report.summary.byCheck.done_missing_completed_at).toBe(1);
    expect(report.summary.byCheck.done_missing_completion_event).toBe(1);
    expect(report.checks.find((c) => c.checkId === 'done_missing_completed_at')?.sampleTaskIds[0]).toMatch(
      /^task/,
    );
  });

  it('flags DONE with open required checklist items', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        completionMode: 'MANUAL',
        events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
        checklistItems: [{ id: 'c1', isDone: false, isRequired: true }],
      }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1' });
    expect(report.summary.byCheck.done_with_open_required_checklist).toBe(1);
  });

  it('detects active duplicate dedup keys', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({ id: 'task-a', status: 'OPEN', dedupKey: 'booking:prep:b1', type: 'BOOKING_PREPARATION', bookingId: 'b1' }),
      task({ id: 'task-b', status: 'IN_PROGRESS', dedupKey: 'booking:prep:b1', type: 'BOOKING_PREPARATION', bookingId: 'b1' }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1' });
    expect(report.summary.byCheck.active_duplicate_dedup_key).toBe(2);
    expect(report.summary.byCheck.multiple_booking_preparation).toBe(2);
  });

  it('flags missing booking link', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({ bookingId: 'missing-booking' }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1' });
    expect(report.summary.byCheck.missing_link_booking).toBe(1);
  });

  it('flags timing anomalies and legacy-visible future activatesAt', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'OPEN',
        activatesAt: new Date('2026-12-01T10:00:00.000Z'),
        dueDate: new Date('2026-11-01T10:00:00.000Z'),
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(report.summary.byCheck.timing_activates_after_due).toBe(1);
    expect(report.summary.byCheck.timing_future_activates_legacy_visible).toBe(1);
  });

  it('flags AUTO_RESOLVED without event and assignment without ASSIGNED event', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        status: 'DONE',
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        completionMode: 'AUTO_RESOLVED',
        assignedUserId: 'user-1',
        events: [{ type: 'STATUS_CHANGED', oldValue: 'OPEN', newValue: 'DONE', createdAt: new Date() }],
      }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1' });
    expect(report.summary.byCheck.audit_auto_close_without_event).toBe(1);
    expect(report.summary.byCheck.audit_assignment_without_event).toBe(1);
  });

  it('flags legacy dedup key formats', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        type: 'VEHICLE_CLEANING',
        vehicleId: 'veh-1',
        dedupKey: 'booking:clean:b1',
      }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1' });
    expect(report.summary.byCheck.legacy_dedup_key_format).toBe(1);
  });

  it('masks sample task ids in report output', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      task({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        status: 'DONE',
      }),
    ]);

    const report = await service.runDiagnostic({ organizationId: 'org-1', sampleLimit: 3 });
    const sample = report.checks.find((c) => c.checkId === 'done_missing_completed_at')?.sampleTaskIds[0];
    expect(sample).toBe('aaaa…eeee');
  });
});
