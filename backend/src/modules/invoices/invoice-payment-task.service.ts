import { Injectable, Logger } from '@nestjs/common';
import {
  OrgInvoiceStatus,
  OrgInvoiceType,
  Prisma,
  TaskPriority,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule, applyTimingOffsets } from '@modules/tasks/automation/task-automation-effective-rule.util';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import {
  automationOutboxIdentity,
  buildAutomationMetadataBlock,
  getAutomationRuleByCatalogKey,
  requireAutomationRuleById,
} from '@modules/tasks/automation/task-automation-rule.util';
import {
  canRecordPayment,
  displayInvoiceNumber,
  isIncomingInvoiceType,
  isOutgoingInvoiceType,
} from './invoice-domain.util';
import {
  buildIncomingPaymentCheckTitle,
  buildOutgoingPaymentCheckTitle,
  computeInvoicePaymentTaskTiming,
  invoicePaymentCheckDedupKey,
  legacyInvoiceUnpaidDedupKey,
  resolveInvoicePaymentDueDate,
} from './invoice-payment-task.util';

const invoicePaymentRule = getAutomationRuleByCatalogKey('INVOICE_PAYMENT_CHECK');

const OPEN_PAYMENT_CHECK_STATUSES: OrgInvoiceStatus[] = [
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'OVERDUE',
  'NEEDS_REVIEW',
  'APPROVED',
];

const TERMINAL_SUPERSEDE_STATUSES: OrgInvoiceStatus[] = ['CANCELLED', 'VOID', 'CREDITED'];

export interface InvoicePaymentTaskSnapshot {
  id: string;
  organizationId: string;
  type: OrgInvoiceType;
  status: OrgInvoiceStatus;
  title: string;
  invoiceNumberDisplay?: string | null;
  invoiceNumber?: number | null;
  legacyInvoiceNumber?: number | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  currency: string;
  invoiceDate: Date;
  dueDate: Date | null;
  bookingId?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
}

@Injectable()
export class InvoicePaymentTaskService {
  private readonly logger = new Logger(InvoicePaymentTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
  ) {}

  private async handleAutomationFailure(
    orgId: string,
    invoiceId: string,
    err: unknown,
  ): Promise<void> {
    if (this.outboxContext.fromOutbox) {
      throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
    }
    await this.outboxEnqueue.enqueueFailure(
      buildOutboxMeta({
        organizationId: orgId,
        ...automationOutboxIdentity(invoicePaymentRule),
        entityType: 'INVOICE',
        entityId: invoiceId,
        operation: 'SYNC_INVOICE_PAYMENT_CHECK',
        payload: { invoiceId },
      }),
      err,
    );
    this.logger.warn(`syncPaymentCheckTask(${invoiceId}) failed: ${sanitizeAutomationError(err)}`);
  }

  /** Materialises or refreshes the canonical payment-check task for an open invoice. */
  async syncPaymentCheckTask(
    orgId: string,
    invoice: InvoicePaymentTaskSnapshot,
    options?: { now?: Date },
  ): Promise<void> {
    try {
      const now = options?.now ?? new Date();

      if (invoice.status === 'PAID' || invoice.outstandingCents <= 0) {
        await this.resolveOnFullPayment(orgId, invoice.id);
        return;
      }

      if (TERMINAL_SUPERSEDE_STATUSES.includes(invoice.status)) {
        await this.closeOnTerminalInvoiceStatus(orgId, invoice.id, invoice.status);
        return;
      }

      if (!this.shouldMaterialisePaymentCheck(invoice)) {
        return;
      }

      const resolved = await this.ruleResolver.resolveTaskAutomationRule(
        orgId,
        invoicePaymentRule.ruleId,
      );
      if (!shouldMaterializeFromResolvedRule(resolved)) {
        return;
      }

      await this.tasks.supersedeLegacyInvoicePaymentCheckTasks(orgId, invoice.id);

      const timeZone = await this.resolveOrgTimezone(orgId);
      const dueDate = resolveInvoicePaymentDueDate({
        dueDate: invoice.dueDate,
        invoiceDate: invoice.invoiceDate,
      });
      const timing = computeInvoicePaymentTaskTiming(dueDate, now, timeZone);
      const adjustedTiming = applyTimingOffsets({
        activatesAt: timing.activatesAt,
        dueDate: timing.dueDate,
        activationOffsetMinutes: resolved.effective.activationOffsetMinutes,
        dueOffsetMinutes: resolved.effective.dueOffsetMinutes,
      });
      const dedupKey = invoicePaymentCheckDedupKey(invoice.id);
      const title = this.buildTaskTitle(invoice);
      const metadata = this.buildTaskMetadata(dedupKey, invoice, timing);

      await this.tasks.upsertByDedup(orgId, dedupKey, {
        title,
        description: this.buildTaskDescription(invoice),
        category: invoicePaymentRule.category,
        type: invoicePaymentRule.taskType!,
        source: invoicePaymentRule.source,
        sourceType: invoicePaymentRule.sourceType,
        priority: timing.priority === 'CRITICAL' ? timing.priority : resolved.effective.priority,
        invoiceId: invoice.id,
        bookingId: invoice.bookingId ?? null,
        customerId: invoice.customerId ?? null,
        vehicleId: this.optionalVehicleLink(invoice),
        dueDate: adjustedTiming.dueDate,
        activatesAt: adjustedTiming.activatesAt,
        metadata,
      });

      const existing = await this.prisma.orgTask.findFirst({
        where: { organizationId: orgId, dedupKey },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      });

      if (existing && ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(existing.status)) {
        await this.tasks.updateTaskTiming(
          orgId,
          existing.id,
          {
            activatesAt: timing.activatesAt,
            dueDate: timing.dueDate,
            priority: timing.priority,
          },
          {
            ruleId: invoicePaymentRule.ruleId,
            bookingId: invoice.bookingId ?? undefined,
          },
        );
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(orgId, invoice.id, err);
    }
  }

  async syncPaymentCheckTaskById(orgId: string, invoiceId: string, options?: { now?: Date }): Promise<void> {
    const invoice = await this.loadInvoiceSnapshot(orgId, invoiceId);
    if (!invoice) return;
    await this.syncPaymentCheckTask(orgId, invoice, options);
  }

  /** Auto-resolves payment-check tasks when an invoice is fully paid. */
  async resolveOnFullPayment(orgId: string, invoiceId: string): Promise<number> {
    const invoice = await this.loadInvoiceSnapshot(orgId, invoiceId);
    if (!invoice || invoice.outstandingCents > 0) return 0;
    return this.tasks.autoResolveInvoicePaymentCheckTasks(orgId, invoiceId, {
      resolutionCode: 'PAYMENT_RECEIVED',
      reason: `Invoice ${invoiceId} fully paid`,
      metadata: {
        ruleId: requireAutomationRuleById('invoice.payment.received').ruleId,
        invoiceId,
      },
    });
  }

  /** Closes payment-check tasks when an invoice leaves the open-payment pipeline. */
  async closeOnTerminalInvoiceStatus(
    orgId: string,
    invoiceId: string,
    status: OrgInvoiceStatus,
  ): Promise<number> {
    const resolutionCode = this.terminalResolutionCode(status);
    if (!resolutionCode) return 0;

    const terminalRule = requireAutomationRuleById('invoice.payment.terminal');
    const reason = `Invoice ${invoiceId} is ${status}`;
    if (status === 'CANCELLED' || status === 'VOID') {
      return this.tasks.supersedeInvoicePaymentCheckTasks(orgId, invoiceId, {
        resolutionCode,
        reason,
        metadata: {
          ruleId: terminalRule.ruleId,
          invoiceId,
          invoiceStatus: status,
        },
      });
    }

    return this.tasks.autoResolveInvoicePaymentCheckTasks(orgId, invoiceId, {
      resolutionCode,
      reason,
      metadata: {
        ruleId: terminalRule.ruleId,
        invoiceId,
        invoiceStatus: status,
      },
    });
  }

  /** Refreshes timing/priority for open invoices that became overdue. */
  async refreshOpenPaymentCheckTasks(options?: { now?: Date }): Promise<number> {
    const now = options?.now ?? new Date();
    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        outstandingCents: { gt: 0 },
        dueDate: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        type: true,
        status: true,
        title: true,
        invoiceNumber: true,
        legacyInvoiceNumber: true,
        invoiceNumberDisplay: true,
        sequenceYear: true,
        sequenceNumber: true,
        totalCents: true,
        paidCents: true,
        outstandingCents: true,
        currency: true,
        invoiceDate: true,
        dueDate: true,
        bookingId: true,
        customerId: true,
        vehicleId: true,
      },
    });

    let refreshed = 0;
    for (const row of invoices) {
      await this.syncPaymentCheckTask(
        row.organizationId,
        {
          ...row,
          outstandingCents: row.outstandingCents ?? Math.max(0, row.totalCents - row.paidCents),
        },
        { now },
      );
      refreshed += 1;
    }
    return refreshed;
  }

  private shouldMaterialisePaymentCheck(invoice: InvoicePaymentTaskSnapshot): boolean {
    if (!OPEN_PAYMENT_CHECK_STATUSES.includes(invoice.status)) return false;
    if (invoice.outstandingCents <= 0) return false;
    if (isOutgoingInvoiceType(invoice.type)) {
      return ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);
    }
    if (isIncomingInvoiceType(invoice.type)) {
      return ['NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(
        invoice.status,
      );
    }
    return canRecordPayment(invoice.status);
  }

  private buildTaskTitle(invoice: InvoicePaymentTaskSnapshot): string {
    if (isIncomingInvoiceType(invoice.type)) {
      return buildIncomingPaymentCheckTitle(invoice.title);
    }
    const label =
      invoice.invoiceNumberDisplay?.trim() ||
      displayInvoiceNumber({
        invoiceNumberDisplay: invoice.invoiceNumberDisplay ?? null,
        legacyInvoiceNumber: invoice.legacyInvoiceNumber ?? null,
        invoiceNumber: invoice.invoiceNumber ?? null,
        sequenceYear: invoice.sequenceYear ?? null,
        sequenceNumber: invoice.sequenceNumber ?? null,
        status: invoice.status,
      });
    return buildOutgoingPaymentCheckTitle(label);
  }

  private buildTaskDescription(invoice: InvoicePaymentTaskSnapshot): string {
    const amount = (invoice.outstandingCents / 100).toFixed(2);
    return `Offener Betrag ${amount} ${invoice.currency} — Zahlungseingang prüfen oder verbuchen.`;
  }

  private optionalVehicleLink(invoice: InvoicePaymentTaskSnapshot): string | null {
    if (!invoice.vehicleId) return null;
    if (invoice.bookingId) return invoice.vehicleId;
    return invoice.vehicleId;
  }

  private buildTaskMetadata(
    dedupKey: string,
    invoice: InvoicePaymentTaskSnapshot,
    timing: ReturnType<typeof computeInvoicePaymentTaskTiming>,
  ): Prisma.InputJsonValue {
    return {
      generatedKey: dedupKey,
      automation: buildAutomationMetadataBlock(invoicePaymentRule),
      invoicePaymentCheck: {
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        outstandingCents: invoice.outstandingCents,
        dueDate: timing.dueDate.toISOString(),
        activatesAt: timing.activatesAt.toISOString(),
        timeZone: timing.timeZone,
        isPlanned: timing.isPlanned,
        isOverdue: timing.isOverdue,
        legacyDedupKey: legacyInvoiceUnpaidDedupKey(invoice.id),
      },
    };
  }

  private terminalResolutionCode(status: OrgInvoiceStatus): string | null {
    switch (status) {
      case 'CANCELLED':
        return 'INVOICE_CANCELLED';
      case 'VOID':
        return 'INVOICE_VOIDED';
      case 'CREDITED':
        return 'INVOICE_CREDITED';
      default:
        return null;
    }
  }

  private async resolveOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  private async loadInvoiceSnapshot(
    orgId: string,
    invoiceId: string,
  ): Promise<InvoicePaymentTaskSnapshot | null> {
    const row = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        type: true,
        status: true,
        title: true,
        invoiceNumber: true,
        legacyInvoiceNumber: true,
        invoiceNumberDisplay: true,
        sequenceYear: true,
        sequenceNumber: true,
        totalCents: true,
        paidCents: true,
        outstandingCents: true,
        currency: true,
        invoiceDate: true,
        dueDate: true,
        bookingId: true,
        customerId: true,
        vehicleId: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      outstandingCents: row.outstandingCents ?? Math.max(0, row.totalCents - row.paidCents),
    };
  }
}
