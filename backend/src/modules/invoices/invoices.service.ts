import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoicePaymentMethod,
  OrgInvoiceStatus,
  OrgInvoiceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CreateInvoiceDto, RecordInvoicePaymentDto, UpdateInvoiceDto } from './dto';
import {
  canCancelInvoice,
  canRecordPayment,
  defaultStatusForCreate,
  derivePaymentStatus,
  displayInvoiceNumber,
  EXPENSE_EXCLUDED_STATUSES,
  isEditableStatus,
  isIncomingInvoiceType,
  isOutgoingInvoiceType,
  NON_OPEN_INCOMING_STATUSES,
  NON_OPEN_OUTGOING_STATUSES,
  REVENUE_EXCLUDED_STATUSES,
} from './invoice-domain.util';
import {
  computeInvoiceTotals,
  InvoiceLineItemInput,
  normalizeTaxRate,
  parseLegacyLineItems,
} from './invoice-line-items.util';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { invoiceBookingRef } from './utils/invoice-booking-ref.util';
import { userDisplayName } from './invoice-documents.labels';
import { presentInvoicePayment } from './invoice-payments.presentation';

export type CreateInvoiceFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  vendorInvoiceNumber: string;
  vendorName?: string | null;
  vendorId?: string | null;
  title: string;
  description?: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency: string;
  lineItems?: InvoiceLineItemInput[];
  totalCents: number;
  isCreditNote: boolean;
  draftOnly: boolean;
  imageUrl?: string | null;
  extractedData?: Record<string, unknown>;
  notes?: string | null;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceNumbers: InvoiceNumberService,
    private readonly invoicePaymentTasks: InvoicePaymentTaskService,
  ) {}

  private format(inv: Record<string, unknown>) {
    const status = inv.status as OrgInvoiceStatus;
    const paidCents = (inv.paidCents as number) ?? 0;
    const totalCents = (inv.totalCents as number) ?? 0;
    const outstandingCents =
      (inv.outstandingCents as number) ??
      Math.max(0, totalCents - paidCents);

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber ?? null,
      legacyInvoiceNumber: inv.legacyInvoiceNumber ?? inv.invoiceNumber ?? null,
      invoiceNumberDisplay: displayInvoiceNumber({
        invoiceNumberDisplay: inv.invoiceNumberDisplay as string | null,
        legacyInvoiceNumber: (inv.legacyInvoiceNumber ?? inv.invoiceNumber) as number | null,
        invoiceNumber: inv.invoiceNumber as number | null,
        sequenceYear: inv.sequenceYear as number | null,
        sequenceNumber: inv.sequenceNumber as number | null,
        status,
      }),
      sequenceYear: inv.sequenceYear ?? null,
      sequenceNumber: inv.sequenceNumber ?? null,
      type: inv.type,
      customerId: inv.customerId || null,
      vendorId: inv.vendorId || null,
      vendorName:
        inv.vendorName ||
        (inv.vendor as { name?: string } | undefined)?.name ||
        null,
      bookingId: inv.bookingId || null,
      vehicleId: inv.vehicleId || null,
      title: inv.title,
      description: inv.description || '',
      lineItems: inv.lineItems || null,
      subtotalCents: inv.subtotalCents,
      taxCents: inv.taxCents,
      totalCents,
      paidCents,
      outstandingCents,
      currency: inv.currency,
      invoiceDate: (inv.invoiceDate as Date)?.toISOString?.() || '',
      dueDate: (inv.dueDate as Date)?.toISOString?.() || null,
      status,
      templateId: inv.templateId || null,
      imageUrl: inv.imageUrl || null,
      extractedData: inv.extractedData || null,
      documentExtractionId: inv.documentExtractionId || null,
      generatedDocumentId: inv.generatedDocumentId || null,
      notes: inv.notes || '',
      paidAt: (inv.paidAt as Date)?.toISOString?.() || null,
      issuedAt: (inv.issuedAt as Date)?.toISOString?.() || null,
      sentAt: (inv.sentAt as Date)?.toISOString?.() || null,
      cancelledAt: (inv.cancelledAt as Date)?.toISOString?.() || null,
      voidedAt: (inv.voidedAt as Date)?.toISOString?.() || null,
      creditedAt: (inv.creditedAt as Date)?.toISOString?.() || null,
      createdAt: (inv.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (inv.updatedAt as Date)?.toISOString?.() || '',
      tasks: undefined as unknown,
      payments: undefined as unknown,
    };
  }

  async findByOrg(
    orgId: string,
    params?: { type?: string; status?: string; direction?: string; includeVoid?: boolean },
  ) {
    const where: Prisma.OrgInvoiceWhereInput = { organizationId: orgId };
    if (params?.type) where.type = params.type as OrgInvoiceType;
    if (params?.status) where.status = params.status as OrgInvoiceStatus;
    if (!params?.includeVoid && !params?.status) {
      where.status = { notIn: ['VOID', 'CANCELLED', 'CREDITED'] };
    }
    if (params?.direction === 'outgoing') {
      where.type = { in: ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'] };
    } else if (params?.direction === 'incoming') {
      where.type = { in: ['INCOMING_VENDOR', 'INCOMING_UPLOADED'] };
    }

    const invoices = await this.prisma.orgInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tasks: true,
        vendor: { select: { id: true, name: true } },
        payments: { orderBy: { paidAt: 'desc' }, take: 5 },
      },
    });

    const allPayments = invoices.flatMap((inv) => inv.payments ?? []);
    const userIds = [
      ...new Set(allPayments.map((p) => p.createdByUserId).filter(Boolean)),
    ] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return invoices.map((inv) => {
      const formatted = this.format(inv as unknown as Record<string, unknown>);
      formatted.tasks = (inv.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      }));
      formatted.payments = (inv.payments || []).map((payment) =>
        presentInvoicePayment(
          payment as Parameters<typeof presentInvoicePayment>[0],
          payment.createdByUserId ? userDisplayName(userMap.get(payment.createdByUserId)) : null,
        ),
      );
      return formatted;
    });
  }

  async findByCustomer(orgId: string, customerId: string) {
    const invoices = await this.prisma.orgInvoice.findMany({
      where: { organizationId: orgId, customerId },
      orderBy: { invoiceDate: 'desc' },
      include: { vendor: { select: { id: true, name: true } } },
    });
    return invoices.map((inv) => this.format(inv as unknown as Record<string, unknown>));
  }

  async findById(id: string, orgId: string) {
    const inv = await this.prisma.orgInvoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        tasks: true,
        vendor: { select: { id: true, name: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    const formatted = this.format(inv as unknown as Record<string, unknown>);
    formatted.tasks = (inv.tasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
    }));
    formatted.payments = await this.presentPayments(orgId, inv.payments || []);
    return formatted;
  }

  async findByDocumentExtractionId(orgId: string, documentExtractionId: string) {
    return this.prisma.orgInvoice.findUnique({
      where: {
        organizationId_documentExtractionId: {
          organizationId: orgId,
          documentExtractionId,
        },
      },
    });
  }

  async findDuplicateByVendorInvoiceNumber(
    orgId: string,
    vendorId: string,
    vendorInvoiceNumber: string,
    excludeDocumentExtractionId?: string | null,
  ) {
    return this.prisma.orgInvoice.findFirst({
      where: {
        organizationId: orgId,
        vendorId,
        invoiceNumberDisplay: vendorInvoiceNumber,
        ...(excludeDocumentExtractionId
          ? { documentExtractionId: { not: excludeDocumentExtractionId } }
          : {}),
      },
      select: { id: true },
    });
  }

  async resolveVendorIdByName(orgId: string, vendorName: string | null | undefined) {
    if (!vendorName?.trim()) return null;
    const match = await this.prisma.vendor.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: vendorName.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    return match?.id ?? null;
  }

  async createFromDocumentExtraction(input: CreateInvoiceFromDocumentExtractionInput) {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }
    if (!input.vendorInvoiceNumber?.trim()) {
      throw new BadRequestException('vendorInvoiceNumber is required for extraction apply');
    }
    if (!input.currency?.trim()) {
      throw new BadRequestException('currency is required for extraction apply');
    }

    const existing = await this.findByDocumentExtractionId(
      input.organizationId,
      input.documentExtractionId,
    );
    if (existing) {
      await this.syncExtractionPaymentTask(input.organizationId, existing.id, input);
      return this.findById(existing.id, input.organizationId);
    }

    const vendorId =
      input.vendorId ?? (await this.resolveVendorIdByName(input.organizationId, input.vendorName));
    if (vendorId) {
      const duplicate = await this.findDuplicateByVendorInvoiceNumber(
        input.organizationId,
        vendorId,
        input.vendorInvoiceNumber,
        input.documentExtractionId,
      );
      if (duplicate) {
        throw new BadRequestException({
          message: 'Invoice number already exists for this vendor',
          code: 'INVOICE_DUPLICATE_VENDOR_NUMBER',
          existingInvoiceId: duplicate.id,
        });
      }
    }

    const lineInputs: InvoiceLineItemInput[] = (input.lineItems ?? []).map((item) => ({
      ...item,
      taxRate: item.taxRate,
    }));
    let totals = computeInvoiceTotals(lineInputs, input.totalCents);
    if (input.isCreditNote && totals.totalCents > 0) {
      totals = {
        ...totals,
        subtotalCents: -Math.abs(totals.subtotalCents),
        taxCents: -Math.abs(totals.taxCents),
        totalCents: -Math.abs(totals.totalCents),
      };
    }

    const status: OrgInvoiceStatus = input.draftOnly ? 'DRAFT' : 'NEEDS_REVIEW';
    const vendorName = await this.resolveVendorName(
      input.organizationId,
      vendorId ?? undefined,
      input.vendorName ?? undefined,
    );

    try {
      const invoice = await this.prisma.orgInvoice.create({
        data: {
          organizationId: input.organizationId,
          type: 'INCOMING_UPLOADED',
          vehicleId: input.vehicleId,
          vendorId: vendorId ?? undefined,
          vendorName,
          title: input.title,
          description: input.description,
          invoiceNumberDisplay: input.vendorInvoiceNumber,
          lineItems: totals.lineItems.length
            ? (totals.lineItems as unknown as Prisma.InputJsonValue)
            : undefined,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          paidCents: 0,
          outstandingCents: totals.totalCents,
          currency: input.currency,
          invoiceDate: new Date(input.invoiceDate),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status,
          imageUrl: input.imageUrl ?? undefined,
          extractedData: {
            ...(input.extractedData ?? {}),
            documentExtractionId: input.documentExtractionId,
            documentActionIdempotencyKey: input.documentActionIdempotencyKey ?? null,
            isCreditNote: input.isCreditNote,
            draftOnly: input.draftOnly,
          } as Prisma.InputJsonValue,
          documentExtractionId: input.documentExtractionId,
          notes: input.notes ?? undefined,
        },
      });

      await this.syncExtractionPaymentTask(input.organizationId, invoice.id, input, {
        status,
        totalCents: totals.totalCents,
      });
      return this.findById(invoice.id, input.organizationId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findByDocumentExtractionId(
          input.organizationId,
          input.documentExtractionId,
        );
        if (raced) {
          await this.syncExtractionPaymentTask(input.organizationId, raced.id, input);
          return this.findById(raced.id, input.organizationId);
        }
      }
      throw error;
    }
  }

  private async syncExtractionPaymentTask(
    orgId: string,
    invoiceId: string,
    input: CreateInvoiceFromDocumentExtractionInput,
    created?: {
      status: OrgInvoiceStatus;
      totalCents: number;
    },
  ): Promise<void> {
    const inv = created
      ? null
      : await this.prisma.orgInvoice.findFirst({
          where: { id: invoiceId, organizationId: orgId },
        });

    const status = created?.status ?? inv?.status;
    if (!status || status === 'DRAFT') {
      return;
    }

    const type = (inv?.type ?? 'INCOMING_UPLOADED') as OrgInvoiceType;
    if (
      !isIncomingInvoiceType(type) ||
      !['NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'SENT'].includes(status)
    ) {
      return;
    }

    const totalCents = created?.totalCents ?? inv?.totalCents ?? input.totalCents;
    const paidCents = inv?.paidCents ?? 0;

    await this.invoicePaymentTasks.syncPaymentCheckTask(orgId, {
      id: invoiceId,
      organizationId: orgId,
      type,
      status,
      title: inv?.title ?? input.title,
      invoiceNumberDisplay: inv?.invoiceNumberDisplay ?? input.vendorInvoiceNumber,
      totalCents,
      paidCents,
      outstandingCents: Math.max(0, totalCents - paidCents),
      currency: inv?.currency ?? input.currency,
      invoiceDate: inv?.invoiceDate ?? new Date(input.invoiceDate),
      dueDate: inv?.dueDate ?? (input.dueDate ? new Date(input.dueDate) : null),
      bookingId: inv?.bookingId ?? null,
      customerId: inv?.customerId ?? null,
      vehicleId: inv?.vehicleId ?? input.vehicleId,
    });
  }

  async create(orgId: string, data: CreateInvoiceDto & { extractedData?: Record<string, unknown>; fromExtraction?: boolean }) {
    await this.assertRelations(orgId, data);

    const lineInputs: InvoiceLineItemInput[] = (data.lineItems ?? []).map((item) => ({
      ...item,
      taxRate: normalizeTaxRate(item.taxRate),
    }));

    const totals = computeInvoiceTotals(lineInputs, data.totalCents);
    if (totals.totalCents <= 0 && !data.fromExtraction) {
      throw new BadRequestException('Invoice total must be greater than zero');
    }

    const status = defaultStatusForCreate(
      data.type,
      Boolean(data.fromExtraction || data.documentExtractionId),
    );
    const vendorName = await this.resolveVendorName(orgId, data.vendorId, data.vendorName);

    const invoice = await this.prisma.orgInvoice.create({
      data: {
        organizationId: orgId,
        type: data.type,
        customerId: data.customerId,
        vendorId: data.vendorId,
        vendorName,
        bookingId: data.bookingId,
        vehicleId: data.vehicleId,
        title: data.title,
        description: data.description,
        lineItems: totals.lineItems.length
          ? (totals.lineItems as unknown as Prisma.InputJsonValue)
          : undefined,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents: 0,
        outstandingCents: totals.totalCents,
        currency: data.currency || 'EUR',
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status,
        templateId: data.templateId,
        imageUrl: data.imageUrl,
        extractedData: data.extractedData
          ? (data.extractedData as Prisma.InputJsonValue)
          : undefined,
        documentExtractionId: data.documentExtractionId,
        notes: data.notes,
      },
    });

    if (isOutgoingInvoiceType(data.type) && status === 'DRAFT') {
      // no unpaid task until issued
    } else if (isIncomingInvoiceType(data.type) && ['NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'SENT'].includes(status)) {
      await this.invoicePaymentTasks.syncPaymentCheckTask(orgId, {
        id: invoice.id,
        organizationId: orgId,
        type: data.type,
        status,
        title: data.title,
        invoiceNumberDisplay: null,
        totalCents: totals.totalCents,
        paidCents: 0,
        outstandingCents: totals.totalCents,
        currency: data.currency || 'EUR',
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        bookingId: data.bookingId ?? null,
        customerId: data.customerId ?? null,
        vehicleId: data.vehicleId ?? null,
      });
    }

    return this.findById(invoice.id, orgId);
  }

  async update(id: string, data: UpdateInvoiceDto, orgId: string) {
    const existing = await this.requireInvoice(id, orgId);
    if (!isEditableStatus(existing.status)) {
      throw new BadRequestException(`Invoice in status ${existing.status} cannot be edited`);
    }

    if (data.customerId || data.vendorId) {
      await this.assertRelations(orgId, {
        ...data,
        type: existing.type,
        title: existing.title,
      } as CreateInvoiceDto);
    }

    const lineInputs: InvoiceLineItemInput[] =
      data.lineItems !== undefined
        ? data.lineItems.map((item) => ({
            ...item,
            taxRate: normalizeTaxRate(item.taxRate),
          }))
        : parseLegacyLineItems(existing.lineItems);

    const totals = computeInvoiceTotals(
      lineInputs,
      data.totalCents ?? existing.totalCents,
    );

    const updateData: Prisma.OrgInvoiceUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.templateId !== undefined) updateData.templateId = data.templateId;
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.vendorId !== undefined) {
      if (data.vendorId === null) {
        updateData.vendor = { disconnect: true };
        updateData.vendorName = null;
      } else if (orgId) {
        updateData.vendor = { connect: { id: data.vendorId } };
        updateData.vendorName = await this.resolveVendorName(orgId, data.vendorId, data.vendorName);
      }
    } else if (data.vendorName !== undefined) {
      updateData.vendorName = data.vendorName;
    }

    if (data.lineItems !== undefined || data.totalCents !== undefined) {
      updateData.lineItems = totals.lineItems.length
        ? (totals.lineItems as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      updateData.subtotalCents = totals.subtotalCents;
      updateData.taxCents = totals.taxCents;
      updateData.totalCents = totals.totalCents;
      updateData.outstandingCents = Math.max(0, totals.totalCents - existing.paidCents);
    }

    await this.prisma.orgInvoice.update({ where: { id }, data: updateData });
    if (data.dueDate !== undefined) {
      await this.invoicePaymentTasks.syncPaymentCheckTaskById(orgId, id);
    }
    return this.findById(id, orgId);
  }

  async issue(id: string, orgId: string) {
    const inv = await this.requireInvoice(id, orgId);
    if (!isOutgoingInvoiceType(inv.type)) {
      throw new BadRequestException('Only outgoing invoices can be issued');
    }
    if (inv.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be issued');
    }
    if (inv.sequenceNumber != null) {
      throw new BadRequestException('Invoice already has a number assigned');
    }

    const year = new Date(inv.invoiceDate).getFullYear();
    const allocated = await this.invoiceNumbers.allocate(orgId, year);

    await this.prisma.orgInvoice.update({
      where: { id },
      data: {
        ...allocated,
        status: 'ISSUED',
        issuedAt: new Date(),
        outstandingCents: Math.max(0, inv.totalCents - inv.paidCents),
      },
    });

    const issued = await this.requireInvoice(id, orgId);
    await this.invoicePaymentTasks.syncPaymentCheckTask(orgId, {
      id: issued.id,
      organizationId: orgId,
      type: issued.type,
      status: 'ISSUED',
      title: issued.title,
      invoiceNumberDisplay: displayInvoiceNumber({
        invoiceNumberDisplay: issued.invoiceNumberDisplay,
        legacyInvoiceNumber: issued.legacyInvoiceNumber,
        invoiceNumber: issued.invoiceNumber,
        sequenceYear: issued.sequenceYear,
        sequenceNumber: issued.sequenceNumber,
        status: 'ISSUED',
      }),
      invoiceNumber: issued.invoiceNumber,
      legacyInvoiceNumber: issued.legacyInvoiceNumber,
      sequenceYear: issued.sequenceYear,
      sequenceNumber: issued.sequenceNumber,
      totalCents: issued.totalCents,
      paidCents: issued.paidCents,
      outstandingCents: Math.max(0, issued.totalCents - issued.paidCents),
      currency: issued.currency,
      invoiceDate: issued.invoiceDate,
      dueDate: issued.dueDate,
      bookingId: issued.bookingId,
      customerId: issued.customerId,
      vehicleId: issued.vehicleId,
    });

    return this.findById(id, orgId);
  }

  async cancel(id: string, orgId: string) {
    const inv = await this.requireInvoice(id, orgId);
    if (!canCancelInvoice(inv.status, inv.paidCents, inv.totalCents)) {
      throw new BadRequestException('Rechnung kann in diesem Status nicht storniert werden');
    }

    const nextStatus = inv.type === 'INCOMING_VENDOR' || inv.type === 'INCOMING_UPLOADED'
      ? 'REJECTED'
      : 'CANCELLED';

    await this.prisma.orgInvoice.update({
      where: { id },
      data: {
        status: nextStatus,
        cancelledAt: new Date(),
        outstandingCents: 0,
      },
    });

    await this.invoicePaymentTasks.closeOnTerminalInvoiceStatus(orgId, id, nextStatus);
    return this.findById(id, orgId);
  }

  async markSent(id: string, orgId: string) {
    const inv = await this.requireInvoice(id, orgId);
    if (!isOutgoingInvoiceType(inv.type)) {
      throw new BadRequestException('Only outgoing invoices can be marked as sent');
    }
    if (!['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status)) {
      throw new BadRequestException('Invoice must be issued before marking as sent');
    }
    if (!inv.sequenceNumber) {
      throw new BadRequestException('Issue the invoice before marking as sent');
    }

    await this.prisma.orgInvoice.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    return this.findById(id, orgId);
  }

  async recordPayment(id: string, orgId: string, dto: RecordInvoicePaymentDto, createdByUserId?: string) {
    const inv = await this.requireInvoice(id, orgId);
    if (!canRecordPayment(inv.status)) {
      throw new BadRequestException('Zahlung für diesen Rechnungsstatus nicht möglich');
    }

    if (!Number.isInteger(dto.amountCents) || dto.amountCents < 1) {
      throw new BadRequestException('Ungültiger Betrag');
    }

    const outstanding = Math.max(0, inv.totalCents - inv.paidCents);
    if (dto.amountCents > outstanding) {
      throw new BadRequestException('Betrag übersteigt den offenen Restbetrag');
    }

    const reference = dto.reference?.trim() || null;
    if (reference) {
      const duplicateRef = await this.prisma.orgInvoicePayment.findFirst({
        where: { organizationId: orgId, invoiceId: id, reference },
      });
      if (duplicateRef) {
        throw new BadRequestException('Diese Referenz wurde bereits verbucht');
      }
    }

    if (dto.method === InvoicePaymentMethod.STRIPE && reference) {
      const duplicateProvider = await this.prisma.orgInvoicePayment.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { stripePaymentIntentId: reference },
            { stripeChargeId: reference },
            { reference },
          ],
        },
      });
      if (duplicateProvider) {
        throw new BadRequestException('Diese Anbieterzahlung wurde bereits verbucht');
      }
    }

    await this.prisma.orgInvoicePayment.create({
      data: {
        organizationId: orgId,
        invoiceId: id,
        amountCents: dto.amountCents,
        method: dto.method,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        reference,
        note: dto.note?.trim() || null,
        createdByUserId,
      },
    });

    const newPaid = inv.paidCents + dto.amountCents;
    const newOutstanding = Math.max(0, inv.totalCents - newPaid);
    const newStatus = derivePaymentStatus(newPaid, inv.totalCents, inv.status, isOutgoingInvoiceType(inv.type));

    await this.prisma.orgInvoice.update({
      where: { id },
      data: {
        paidCents: newPaid,
        outstandingCents: newOutstanding,
        status: newStatus,
        paidAt: newOutstanding === 0 ? new Date() : inv.paidAt,
      },
    });

    if (newOutstanding === 0) {
      await this.invoicePaymentTasks.resolveOnFullPayment(orgId, id);
    } else {
      await this.invoicePaymentTasks.syncPaymentCheckTaskById(orgId, id);
    }

    return this.findById(id, orgId);
  }

  async markPaid(id: string, orgId: string) {
    const inv = await this.requireInvoice(id, orgId);
    const outstanding = Math.max(0, inv.totalCents - inv.paidCents);
    if (outstanding <= 0) {
      return this.findById(id, orgId);
    }
    return this.recordPayment(
      id,
      orgId,
      { amountCents: outstanding, method: InvoicePaymentMethod.BANK_TRANSFER },
    );
  }

  async bootstrapBookingInvoice(
    orgId: string,
    booking: {
      id: string;
      customerId: string;
      vehicleId: string;
      totalPriceCents?: number | null;
      dailyRateCents?: number | null;
      startDate: Date;
      endDate: Date;
      currency?: string;
      kmIncluded?: number | null;
    },
  ) {
    try {
      return await this.createBookingInvoice(orgId, booking);
    } catch (err) {
      this.logger.error(
        `Booking invoice bootstrap failed for booking ${booking.id} (org ${orgId})`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async createBookingInvoice(orgId: string, booking: {
    id: string;
    customerId: string;
    vehicleId: string;
    totalPriceCents?: number | null;
    dailyRateCents?: number | null;
    startDate: Date;
    endDate: Date;
    currency?: string;
    kmIncluded?: number | null;
  }) {
    const existing = await this.prisma.orgInvoice.findFirst({
      where: {
        organizationId: orgId,
        bookingId: booking.id,
        type: 'OUTGOING_BOOKING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.findById(existing.id, orgId);
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { bookingId: booking.id, organizationId: orgId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    let lineItems: InvoiceLineItemInput[];
    let totalCents: number;
    let currency = booking.currency || 'EUR';

    if (snapshot?.lineItems?.length) {
      // Source of truth: BookingPriceSnapshot (+ line items). Legacy booking
      // price fields are compatibility mirrors only.
      currency = snapshot.currency || currency;
      totalCents = snapshot.totalGrossCents;
      lineItems = snapshot.lineItems
        .filter((li) => li.type !== 'DEPOSIT' && li.type !== 'TAX')
        .map((li) => ({
          description: li.label,
          quantity: Math.max(1, li.quantity),
          unitPriceNetCents: Math.round(li.totalNetCents / Math.max(1, li.quantity)),
          taxRate: li.taxRatePercent,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
        }));
      if (lineItems.length === 0) {
        lineItems = [{
          description: `Fahrzeugmiete (${snapshot.rentalDays} Tage)`,
          quantity: snapshot.rentalDays,
          unitPriceNetCents: Math.round(snapshot.subtotalNetCents / Math.max(1, snapshot.rentalDays)),
          taxRate: snapshot.taxRatePercent,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
        }];
      }
    } else {
      // Defensive fallback when snapshot missing (e.g. legacy bookings).
      const days = Math.max(1, Math.ceil((booking.endDate.getTime() - booking.startDate.getTime()) / 86400000));
      totalCents = booking.totalPriceCents || (booking.dailyRateCents || 0) * days;
      if (totalCents <= 0) return null;
      const unitNet = Math.round((booking.dailyRateCents || Math.round(totalCents / days)) / 1.19);
      lineItems = [
        {
          description: `Fahrzeugmiete (${days} Tage)`,
          quantity: days,
          unitPriceNetCents: unitNet,
          taxRate: 19,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
        },
      ];
    }

    if (totalCents <= 0) return null;

    const dueDate = new Date(booking.startDate);
    dueDate.setDate(dueDate.getDate() + 14);

    return this.create(orgId, {
      type: 'OUTGOING_BOOKING',
      customerId: booking.customerId,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      title: `Buchungsrechnung ${invoiceBookingRef(booking.id)}`,
      description: `Mietrechnung für Buchungszeitraum ${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}`,
      lineItems,
      totalCents,
      currency,
      invoiceDate: new Date().toISOString(),
      dueDate: dueDate.toISOString(),
    });
  }

  async getStats(orgId: string) {
    const now = new Date();
    const outgoingTypes: OrgInvoiceType[] = ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'];
    const incomingTypes: OrgInvoiceType[] = ['INCOMING_VENDOR', 'INCOMING_UPLOADED'];

    const [
      total,
      outgoing,
      incoming,
      draftCount,
      reviewCount,
      invoices,
      statusGroups,
    ] = await Promise.all([
      this.prisma.orgInvoice.count({ where: { organizationId: orgId } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, type: { in: outgoingTypes } } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, type: { in: incomingTypes } } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, status: 'DRAFT' } }),
      this.prisma.orgInvoice.count({
        where: { organizationId: orgId, status: { in: ['UPLOADED', 'NEEDS_REVIEW'] } },
      }),
      this.prisma.orgInvoice.findMany({
        where: { organizationId: orgId },
        select: {
          type: true,
          status: true,
          totalCents: true,
          paidCents: true,
          outstandingCents: true,
          dueDate: true,
        },
      }),
      this.prisma.orgInvoice.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);

    let totalRevenueCents = 0;
    let finalInvoiceRevenueCents = 0;
    let paidRevenueCents = 0;
    let unpaid = 0;
    let overdue = 0;
    let totalExpensesCents = 0;
    let paid = 0;

    for (const inv of invoices) {
      const isOut = isOutgoingInvoiceType(inv.type);
      const isIn = isIncomingInvoiceType(inv.type);

      if (isOut && !REVENUE_EXCLUDED_STATUSES.includes(inv.status)) {
        totalRevenueCents += inv.totalCents;
        if (inv.type === 'OUTGOING_FINAL') finalInvoiceRevenueCents += inv.totalCents;
        paidRevenueCents += inv.paidCents;
      }

      if (isIn && !EXPENSE_EXCLUDED_STATUSES.includes(inv.status)) {
        totalExpensesCents += inv.totalCents;
      }

      const openExcluded: OrgInvoiceStatus[] = [
        'DRAFT',
        'CANCELLED',
        'VOID',
        'CREDITED',
        'REJECTED',
        'UPLOADED',
        'NEEDS_REVIEW',
      ];

      const outstanding =
        inv.outstandingCents ?? Math.max(0, inv.totalCents - inv.paidCents);

      if (outstanding > 0 && !openExcluded.includes(inv.status)) {
        unpaid += 1;
        if (
          inv.dueDate &&
          inv.dueDate < now &&
          !['PAID', 'CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(inv.status)
        ) {
          overdue += 1;
        }
      }

      if (inv.status === 'PAID' || inv.paidCents >= inv.totalCents) paid += 1;
    }

    const statusCounts = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    ) as Record<string, number>;

    return {
      total,
      outgoing,
      incoming,
      paid,
      unpaid,
      overdue,
      draftCount,
      reviewCount,
      statusCounts,
      totalRevenueCents,
      finalInvoiceRevenueCents,
      paidRevenueCents,
      totalExpensesCents,
    };
  }

  private async requireInvoice(id: string, orgId: string) {
    const inv = await this.prisma.orgInvoice.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  private async assertRelations(orgId: string, data: Partial<CreateInvoiceDto>) {
    if (data.customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: data.customerId, organizationId: orgId },
      });
      if (!c) throw new NotFoundException('Customer not found in organization');
    }
    if (data.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId: orgId },
      });
      if (!v) throw new NotFoundException('Vehicle not found in organization');
    }
    if (data.bookingId) {
      const b = await this.prisma.booking.findFirst({
        where: { id: data.bookingId, organizationId: orgId },
      });
      if (!b) throw new NotFoundException('Booking not found in organization');
    }
    if (data.vendorId) {
      await this.resolveVendorName(orgId, data.vendorId, data.vendorName);
    }
  }

  private async resolveVendorName(
    orgId: string,
    vendorId?: string | null,
    vendorName?: string,
  ): Promise<string | undefined> {
    if (!vendorId) return vendorName;
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId: orgId },
      select: { name: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this organization');
    return vendorName ?? vendor.name;
  }

  private async presentPayments(
    orgId: string,
    payments: Array<{
      id: string;
      amountCents: number;
      method: InvoicePaymentMethod;
      paidAt: Date;
      reference: string | null;
      note: string | null;
      createdByUserId: string | null;
      stripePaymentIntentId: string | null;
      stripeChargeId: string | null;
      bookingPaymentRequestId: string | null;
    }>,
  ) {
    const userIds = [...new Set(payments.map((p) => p.createdByUserId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return payments.map((payment) =>
      presentInvoicePayment(
        payment as Parameters<typeof presentInvoicePayment>[0],
        payment.createdByUserId ? userDisplayName(userMap.get(payment.createdByUserId)) : null,
      ),
    );
  }
}
