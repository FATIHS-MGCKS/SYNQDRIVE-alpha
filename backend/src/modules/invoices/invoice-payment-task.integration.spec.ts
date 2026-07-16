import { TaskCompletionMode } from '@prisma/client';
import { FIXED_NOW } from './__fixtures__/invoice-pipeline.fixtures';
import { LINE_ITEM_NET } from './__fixtures__/invoice-pipeline.fixtures';
import {
  createInvoicePaymentTaskHarness,
  paymentTaskForInvoice,
} from './invoice-payment-task.harness';
import { invoicePaymentCheckDedupKey } from './invoice-payment-task.util';
import { classifyPrimaryTaskBucket, createTaskBucketContext } from '@modules/tasks/task-bucket.util';
import { InvoicePaymentMethod } from '@prisma/client';

describe('Invoice payment-check task automation', () => {
  async function issueOutgoing(
    h: ReturnType<typeof createInvoicePaymentTaskHarness>,
    opts?: { dueDate?: string; bookingId?: string; vehicleId?: string; orgId?: string },
  ) {
    const orgId = opts?.orgId ?? h.store.ids.orgA;
    const inv = await h.invoices.create(orgId, {
      type: 'OUTGOING_MANUAL',
      customerId: h.store.ids.customerPrivate,
      vehicleId: opts?.vehicleId,
      bookingId: opts?.bookingId,
      title: 'Mietrechnung',
      lineItems: [LINE_ITEM_NET],
      totalCents: 10000,
      currency: 'EUR',
      invoiceDate: FIXED_NOW.toISOString(),
      dueDate: opts?.dueDate,
    });
    await h.invoices.issue(String(inv.id), orgId);
    await h.invoicePaymentTasks.syncPaymentCheckTaskById(orgId, String(inv.id), {
      now: FIXED_NOW,
    });
    return { orgId, invoiceId: String(inv.id) };
  }

  it('materialises a PLANNED payment-check task for a future due date', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, {
      dueDate: '2026-08-01T00:00:00.000Z',
    });

    const rows = paymentTaskForInvoice(h.store, orgId, invoiceId);
    expect(rows).toHaveLength(1);
    const task = rows[0]!;
    expect(task.type).toBe('INVOICE_REQUIRED');
    expect(task.title).toMatch(/Zahlungseingang prüfen: Rechnung/);
    expect((task.activatesAt as Date).getTime()).toBeGreaterThan(FIXED_NOW.getTime());

    const bucket = classifyPrimaryTaskBucket(
      {
        status: 'OPEN',
        priority: task.priority as 'NORMAL',
        dueDate: task.dueDate as Date,
        activatesAt: task.activatesAt as Date,
        createdAt: FIXED_NOW,
        assignedUserId: null,
      },
      createTaskBucketContext(FIXED_NOW, 'Europe/Berlin'),
    );
    expect(bucket).toBe('PLANNED');
  });

  it('uses NORMAL priority when due today but not overdue', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, {
      dueDate: '2026-07-15T08:00:00.000Z',
    });
    const task = paymentTaskForInvoice(h.store, orgId, invoiceId)[0]!;
    expect(task.priority).toBe('NORMAL');
  });

  it('escalates to HIGH when overdue', async () => {
    const h = createInvoicePaymentTaskHarness();
    const row = h.store.seedInvoice({
      organizationId: h.store.ids.orgA,
      type: 'OUTGOING_MANUAL',
      status: 'OVERDUE',
      customerId: h.store.ids.customerPrivate,
      title: 'Überfällig',
      totalCents: 10000,
      paidCents: 0,
      outstandingCents: 10000,
      dueDate: new Date('2026-07-14T10:00:00.000Z'),
      invoiceDate: new Date('2026-06-20T10:00:00.000Z'),
      sequenceNumber: 9,
      sequenceYear: 2026,
    });
    await h.invoicePaymentTasks.syncPaymentCheckTaskById(h.store.ids.orgA, row.id as string, {
      now: FIXED_NOW,
    });
    const task = paymentTaskForInvoice(h.store, h.store.ids.orgA, row.id as string)[0]!;
    expect(task.priority).toBe('HIGH');
  });

  it('keeps the task open on partial payment', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-07-20T00:00:00.000Z' });

    await h.invoices.recordPayment(invoiceId, orgId, {
      amountCents: 4000,
      method: InvoicePaymentMethod.BANK_TRANSFER,
    });

    const task = paymentTaskForInvoice(h.store, orgId, invoiceId)[0]!;
    expect(task.status).toBe('OPEN');
  });

  it('auto-resolves with PAYMENT_RECEIVED when fully paid', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-07-20T00:00:00.000Z' });

    await h.invoices.markPaid(invoiceId, orgId);

    const task = paymentTaskForInvoice(h.store, orgId, invoiceId)[0]!;
    expect(task.status).toBe('DONE');
    expect(task.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);
    expect(task.resolutionCode).toBe('PAYMENT_RECEIVED');
    expect(h.store.eventsForTask(task.id as string).some((e) => e.type === 'AUTO_RESOLVED')).toBe(true);
  });

  it('supersedes the payment-check task when invoice is cancelled', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-07-20T00:00:00.000Z' });

    await h.invoicePaymentTasks.closeOnTerminalInvoiceStatus(orgId, invoiceId, 'CANCELLED');

    const task = paymentTaskForInvoice(h.store, orgId, invoiceId)[0]!;
    expect(task.status).toBe('DONE');
    expect(task.completionMode).toBe(TaskCompletionMode.SUPERSEDED);
    expect(task.resolutionCode).toBe('INVOICE_CANCELLED');
  });

  it('is idempotent when payment resolution runs twice (duplicate webhooks)', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-07-20T00:00:00.000Z' });

    await h.invoices.markPaid(invoiceId, orgId);
    await h.invoicePaymentTasks.resolveOnFullPayment(orgId, invoiceId);

    expect(paymentTaskForInvoice(h.store, orgId, invoiceId)).toHaveLength(1);
    expect(paymentTaskForInvoice(h.store, orgId, invoiceId)[0]?.status).toBe('DONE');
  });

  it('deduplicates on repeated issue sync', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-08-01T00:00:00.000Z' });

    await h.invoicePaymentTasks.syncPaymentCheckTaskById(orgId, invoiceId);
    await h.invoicePaymentTasks.syncPaymentCheckTaskById(orgId, invoiceId);

    expect(
      h.store.tables.orgTasks.filter((t) => t.dedupKey === invoicePaymentCheckDedupKey(invoiceId)),
    ).toHaveLength(1);
  });

  it('links invoice without booking using invoiceId and customerId only', async () => {
    const h = createInvoicePaymentTaskHarness();
    const { orgId, invoiceId } = await issueOutgoing(h, { dueDate: '2026-08-01T00:00:00.000Z' });
    const task = paymentTaskForInvoice(h.store, orgId, invoiceId)[0]!;
    expect(task.invoiceId).toBe(invoiceId);
    expect(task.customerId).toBe(h.store.ids.customerPrivate);
    expect(task.bookingId ?? null).toBeNull();
  });

  it('does not cross-link tasks across tenants', async () => {
    const h = createInvoicePaymentTaskHarness();
    const a = await issueOutgoing(h, { dueDate: '2026-08-01T00:00:00.000Z', orgId: h.store.ids.orgA });
    const rowB = h.store.seedInvoice({
      organizationId: h.store.ids.orgB,
      type: 'OUTGOING_MANUAL',
      status: 'ISSUED',
      customerId: h.store.ids.customerOtherOrg,
      title: 'Org B',
      totalCents: 5000,
      paidCents: 0,
      outstandingCents: 5000,
      dueDate: new Date('2026-08-05T00:00:00.000Z'),
      invoiceDate: FIXED_NOW,
      sequenceNumber: 1,
      sequenceYear: 2026,
    });
    await h.invoicePaymentTasks.syncPaymentCheckTaskById(h.store.ids.orgB, rowB.id as string);

    const orgATasks = h.store.tables.orgTasks.filter((t) => t.organizationId === h.store.ids.orgA);
    const orgBTasks = h.store.tables.orgTasks.filter((t) => t.organizationId === h.store.ids.orgB);
    expect(orgATasks.some((t) => t.invoiceId === a.invoiceId)).toBe(true);
    expect(orgATasks.some((t) => t.invoiceId === rowB.id)).toBe(false);
    expect(orgBTasks.some((t) => t.invoiceId === rowB.id)).toBe(true);
  });
});
