import { createTaskBucketContext, classifyPrimaryTaskBucket } from '@modules/tasks/task-bucket.util';
import {
  computeInvoicePaymentTaskTiming,
  invoicePaymentCheckDedupKey,
  resolveInvoicePaymentDueDate,
} from './invoice-payment-task.util';

describe('invoice-payment-task.util', () => {
  const timeZone = 'Europe/Berlin';

  it('builds stable dedup keys per invoice', () => {
    expect(invoicePaymentCheckDedupKey('inv-1')).toBe('invoice:payment-check:inv-1');
  });

  it('uses invoice due date for future payment target (PLANNED until due day)', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const dueDate = new Date('2026-07-25T00:00:00.000Z');
    const timing = computeInvoicePaymentTaskTiming(dueDate, now, timeZone);

    expect(timing.isPlanned).toBe(true);
    expect(timing.priority).toBe('NORMAL');
    expect(timing.activatesAt.getTime()).toBeGreaterThan(now.getTime());

    const bucket = classifyPrimaryTaskBucket(
      {
        status: 'OPEN',
        priority: timing.priority,
        dueDate: timing.dueDate,
        activatesAt: timing.activatesAt,
        createdAt: now,
        assignedUserId: null,
      },
      createTaskBucketContext(now, timeZone),
    );
    expect(bucket).toBe('PLANNED');
  });

  it('activates on due day with NORMAL priority before calendar-day overdue', () => {
    const dueDate = new Date('2026-07-15T10:00:00.000Z');
    const now = new Date('2026-07-15T14:00:00.000Z');
    const timing = computeInvoicePaymentTaskTiming(dueDate, now, timeZone);

    expect(timing.isPlanned).toBe(false);
    expect(timing.isOverdue).toBe(false);
    expect(timing.priority).toBe('NORMAL');
  });

  it('escalates priority only after the due calendar day has passed', () => {
    const dueDate = new Date('2026-07-10T10:00:00.000Z');
    const now = new Date('2026-07-12T12:00:00.000Z');
    const timing = computeInvoicePaymentTaskTiming(dueDate, now, timeZone);

    expect(timing.isOverdue).toBe(true);
    expect(timing.priority).toBe('HIGH');
  });

  it('escalates to CRITICAL only after prolonged overdue period', () => {
    const dueDate = new Date('2026-07-01T10:00:00.000Z');
    const now = new Date('2026-07-15T12:00:00.000Z');
    const timing = computeInvoicePaymentTaskTiming(dueDate, now, timeZone);

    expect(timing.priority).toBe('CRITICAL');
  });

  it('falls back to invoice date + 14 days when due date is missing', () => {
    const invoiceDate = new Date('2026-07-01T00:00:00.000Z');
    const due = resolveInvoicePaymentDueDate({ dueDate: null, invoiceDate });
    expect(due.toISOString().slice(0, 10)).toBe('2026-07-15');
  });
});
