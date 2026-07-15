/**
 * Harness for invoice payment-check task automation (real TasksService + in-memory store).
 */
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskLinkedObjectResolverService } from '@modules/tasks/task-linked-object-resolver.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { createInvoiceTestStore, type InvoiceTestStore } from './invoices-test-store';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { InvoicesService } from './invoices.service';
import { invoicePaymentCheckDedupKey } from './invoice-payment-task.util';

export interface InvoicePaymentTaskHarness {
  store: InvoiceTestStore;
  invoices: InvoicesService;
  invoicePaymentTasks: InvoicePaymentTaskService;
  tasks: TasksService;
}

export function createInvoicePaymentTaskHarness(): InvoicePaymentTaskHarness {
  const store = createInvoiceTestStore();
  const prisma = store.prisma as unknown as PrismaService;

  const activityLog = { log: jest.fn() } as unknown as ActivityLogService;
  const linkedObjectResolver = {
    resolveForTask: jest.fn().mockResolvedValue([]),
  } as unknown as TaskLinkedObjectResolverService;

  const tasks = new TasksService(prisma, activityLog, linkedObjectResolver);
  const invoicePaymentTasks = new InvoicePaymentTaskService(prisma, tasks);
  const invoiceNumbers = new InvoiceNumberService(prisma);
  const invoices = new InvoicesService(prisma, invoiceNumbers, invoicePaymentTasks);

  return { store, invoices, invoicePaymentTasks, tasks };
}

export function paymentTaskForInvoice(store: InvoiceTestStore, orgId: string, invoiceId: string) {
  return store.tables.orgTasks.filter(
    (t) =>
      t.organizationId === orgId &&
      t.invoiceId === invoiceId &&
      t.dedupKey === invoicePaymentCheckDedupKey(invoiceId),
  );
}
