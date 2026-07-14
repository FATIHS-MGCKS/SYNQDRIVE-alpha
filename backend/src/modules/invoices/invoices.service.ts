import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceDueDateBase,
  InvoicePaymentMethod,
  OrgInvoiceStatus,
  OrgInvoiceType,
  Prisma,
  TaskPriority,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { CreateInvoiceDto, RecordInvoicePaymentDto, UpdateInvoiceDto } from './dto';
import { validateRecordExternalSend } from './invoice-status.transitions';
import {
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
  resolveDefaultTaxRateForInvoice,
} from './invoice-line-items.util';
import {
  resolveDueDateForCreate,
  resolveDueDateOnIssue,
  resolveOrgTimezone,
  type OrgDueDateSettings,
} from './invoice-due-date.util';
import {
  netCentsFromGrossCents,
  resolveOrgDefaultTaxRate,
  type OrgTaxSettings,
} from './invoice-tax.util';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import type { InvoiceProvenanceWriteInput } from './invoice-provenance.util';
import {
  provenanceForBookingWizardInvoice,
  provenanceForDocumentExtractionInvoice,
  provenanceForManualUiInvoice,
  provenanceForApiInvoice,
  provenanceForBundlePipelineInvoice,
  provenanceToPrismaFields,
} from './invoice-provenance-write.util';
import {
  buildBookingInvoiceTitle,
  buildFinalInvoiceDescription,
  buildFinalInvoiceTitle,
  buildUnpaidIncomingTaskTitle,
  buildUnpaidOutgoingTaskTitle,
  buildUnpaidTaskDescription,
  type InvoiceReferenceInput,
} from './invoice-display-reference.util';

export interface InvoiceCreateContext {
  userId?: string | null;
  correlationId?: string | null;
  provenance?: InvoiceProvenanceWriteInput;
  /** When set, use API provenance preset for manual creates without explicit provenance. */
  viaApi?: boolean;
}

export interface CreateBookingInvoiceContext {
  userId?: string | null;
  correlationId?: string | null;
  provenance?: InvoiceProvenanceWriteInput;
}

export interface CreateFinalInvoiceContext {
  userId?: string | null;
  correlationId?: string | null;
  originalInvoiceId?: string | null;
  totalCents: number;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly invoiceNumbers: InvoiceNumberService,
    private readonly invoiceDocuments: InvoiceDocumentsReadService,
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

    const documentsByInvoice = await this.invoiceDocuments.getDocumentsForInvoicesBatch(
      orgId,
      invoices.map((inv) => ({
        id: inv.id,
        type: inv.type,
        generatedDocumentId: inv.generatedDocumentId,
      })),
    );

    return invoices.map((inv) => {
      const documentsView = documentsByInvoice.get(inv.id);
      const formatted = this.format(inv as unknown as Record<string, unknown>);
      return {
        ...formatted,
        generatedDocumentId:
          documentsView?.activeDocumentId ?? inv.generatedDocumentId ?? null,
        activeDocumentId: documentsView?.activeDocumentId ?? null,
        tasks: (inv.tasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        })),
        payments: (inv.payments || []).map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          paidAt: p.paidAt.toISOString(),
          reference: p.reference,
          note: p.note,
        })),
      };
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

  async findById(id: string, orgId?: string) {
    const inv = orgId
      ? await this.prisma.orgInvoice.findFirst({
          where: { id, organizationId: orgId },
          include: {
            tasks: true,
            vendor: { select: { id: true, name: true } },
            payments: { orderBy: { paidAt: 'desc' } },
          },
        })
      : await this.prisma.orgInvoice.findUnique({
          where: { id },
          include: {
            tasks: true,
            vendor: { select: { id: true, name: true } },
            payments: { orderBy: { paidAt: 'desc' } },
          },
        });
    if (!inv) throw new NotFoundException('Invoice not found');

    const documentsView = await this.invoiceDocuments.getDocumentsForInvoice({
      organizationId: inv.organizationId,
      invoiceId: inv.id,
      invoiceType: inv.type,
      cacheDocumentId: inv.generatedDocumentId,
    });

    const formatted = this.format(inv as unknown as Record<string, unknown>);
    return {
      ...formatted,
      generatedDocumentId:
        documentsView.activeDocumentId ?? inv.generatedDocumentId ?? null,
      activeDocumentId: documentsView.activeDocumentId,
      documentCacheMismatch: documentsView.cacheMismatch,
      documents: documentsView.documents,
      tasks: (inv.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        description: t.description,
      })),
      payments: (inv.payments || []).map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        note: p.note,
      })),
    };
  }

  async create(
    orgId: string,
    data: CreateInvoiceDto & { extractedData?: Record<string, unknown>; fromExtraction?: boolean },
    context?: InvoiceCreateContext,
  ) {
    await this.assertRelations(orgId, data);

    const orgPolicies = await this.loadOrgInvoicePolicies(orgId);
    const defaultTaxRate = resolveOrgDefaultTaxRate(orgPolicies);
    const taxOptions = { orgTax: orgPolicies, defaultTaxRate };

    const lineInputs: InvoiceLineItemInput[] = (data.lineItems ?? []).map((item) => ({
      ...item,
      taxRate: normalizeTaxRate(item.taxRate, defaultTaxRate),
    }));

    const totals = computeInvoiceTotals(lineInputs, data.totalCents, taxOptions);
    if (totals.taxMeta) {
      this.logger.warn(
        `Invoice tax fallback org=${orgId}: ${totals.taxMeta.reason} (rate=${totals.taxMeta.assumedTaxRatePercent}%)`,
      );
    }
    if (totals.totalCents <= 0 && !data.fromExtraction) {
      throw new BadRequestException('Invoice total must be greater than zero');
    }

    const status = defaultStatusForCreate(
      data.type,
      Boolean(data.fromExtraction || data.documentExtractionId),
    );
    const vendorName = await this.resolveVendorName(orgId, data.vendorId, data.vendorName);
    const provenance = await this.resolveCreateProvenance(orgId, data, context);
    const createdByUserId = await this.resolveOrgScopedUserId(orgId, provenance.createdByUserId);

    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const bookingStartDate = await this.resolveBookingStartDate(
      orgId,
      data.bookingId,
      data.dueDateBase,
    );
    const dueResolved = resolveDueDateForCreate({
      explicitDueDate: data.dueDate,
      dueDateBase: data.dueDateBase,
      invoiceDate,
      bookingStartDate,
      paymentTermsDays: orgPolicies.paymentTermsDays,
      timezone: resolveOrgTimezone(orgPolicies.timezone),
      isOutgoing: isOutgoingInvoiceType(data.type),
    });

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
        invoiceDate,
        dueDate: dueResolved.dueDate,
        dueDateBase: dueResolved.dueDateBase,
        paymentTermsDaysAtCreate: dueResolved.paymentTermsDaysAtCreate,
        status,
        templateId: data.templateId,
        imageUrl: data.imageUrl,
        extractedData: data.extractedData
          ? (data.extractedData as Prisma.InputJsonValue)
          : undefined,
        documentExtractionId: data.documentExtractionId,
        notes: data.notes,
        ...provenanceToPrismaFields({
          ...provenance,
          createdByUserId,
        }),
      },
    });

    if (isOutgoingInvoiceType(data.type) && status === 'DRAFT') {
      // no unpaid task until issued
    } else if (isIncomingInvoiceType(data.type) && ['NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'SENT'].includes(status)) {
      await this.createUnpaidTask(
        orgId,
        invoice.id,
        {
          title: data.title,
          bookingId: data.bookingId,
          type: data.type,
          vendorName: vendorName ?? undefined,
          status,
        },
        totals.totalCents,
        data.currency || 'EUR',
        data.type,
        data.dueDate,
      );
    }

    return this.findById(invoice.id, orgId);
  }

  async update(id: string, data: UpdateInvoiceDto, orgId?: string) {
    const existing = await this.requireInvoice(id, orgId);
    if (!isEditableStatus(existing.status)) {
      throw new BadRequestException(`Invoice in status ${existing.status} cannot be edited`);
    }

    if (data.customerId || data.vendorId) {
      await this.assertRelations(orgId!, {
        ...data,
        type: existing.type,
        title: existing.title,
      } as CreateInvoiceDto);
    }

    const orgPolicies = await this.loadOrgInvoicePolicies(orgId!);
    const taxOptions = { orgTax: orgPolicies };

    const lineInputs: InvoiceLineItemInput[] =
      data.lineItems !== undefined
        ? data.lineItems.map((item) => ({
            ...item,
            taxRate: normalizeTaxRate(item.taxRate, resolveOrgDefaultTaxRate(orgPolicies)),
          }))
        : parseLegacyLineItems(existing.lineItems, taxOptions);

    const totals = computeInvoiceTotals(
      lineInputs,
      data.totalCents ?? existing.totalCents,
      taxOptions,
    );

    const updateData: Prisma.OrgInvoiceUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.templateId !== undefined) updateData.templateId = data.templateId;
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (data.dueDate) {
        updateData.dueDateBase = InvoiceDueDateBase.CUSTOM;
        updateData.paymentTermsDaysAtCreate = null;
      }
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
    const issuedAt = new Date();
    const orgPolicies = await this.loadOrgInvoicePolicies(orgId);
    const dueDate = resolveDueDateOnIssue({
      dueDateBase: inv.dueDateBase,
      currentDueDate: inv.dueDate,
      issuedAt,
      paymentTermsDaysAtCreate: inv.paymentTermsDaysAtCreate,
      paymentTermsDays: orgPolicies.paymentTermsDays,
      timezone: resolveOrgTimezone(orgPolicies.timezone),
    });

    const issuedReference: InvoiceReferenceInput = {
      ...allocated,
      status: 'ISSUED',
      bookingId: inv.bookingId,
      type: inv.type,
      vendorName: inv.vendorName,
      title: inv.title,
    };
    const issuedTitle =
      inv.type === 'OUTGOING_BOOKING' && inv.bookingId
        ? buildBookingInvoiceTitle({ bookingId: inv.bookingId, ...allocated, status: 'ISSUED' })
        : inv.type === 'OUTGOING_FINAL' && inv.bookingId
          ? buildFinalInvoiceTitle({ bookingId: inv.bookingId, ...allocated, status: 'ISSUED' })
          : inv.title;

    await this.prisma.orgInvoice.update({
      where: { id },
      data: {
        ...allocated,
        title: issuedTitle,
        status: 'ISSUED',
        issuedAt,
        dueDate,
        outstandingCents: Math.max(0, inv.totalCents - inv.paidCents),
      },
    });

    await this.createUnpaidTask(
      orgId,
      id,
      issuedReference,
      inv.totalCents,
      inv.currency,
      inv.type,
      dueDate?.toISOString(),
    );

    return this.findById(id, orgId);
  }

  /** @deprecated Delegates to InvoiceExternalSendService via controller. */
  async markSent(id: string, orgId: string, userId?: string | null) {
    void userId;
    const inv = await this.requireInvoice(id, orgId);
    const validation = validateRecordExternalSend({
      type: inv.type,
      status: inv.status,
      sequenceNumber: inv.sequenceNumber,
      issuedAt: inv.issuedAt,
      sentAt: new Date(),
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }

    await this.prisma.orgInvoice.update({
      where: { id },
      data: { status: 'SENT', sentAt: validation.sentAt },
    });
    return this.findById(id, orgId);
  }

  async recordPayment(id: string, orgId: string, dto: RecordInvoicePaymentDto, createdByUserId?: string) {
    const inv = await this.requireInvoice(id, orgId);
    if (!canRecordPayment(inv.status)) {
      throw new BadRequestException(`Cannot record payment for status ${inv.status}`);
    }

    const outstanding = Math.max(0, inv.totalCents - inv.paidCents);
    if (dto.amountCents > outstanding) {
      throw new BadRequestException('Payment exceeds outstanding amount');
    }

    await this.prisma.orgInvoicePayment.create({
      data: {
        organizationId: orgId,
        invoiceId: id,
        amountCents: dto.amountCents,
        method: dto.method ?? InvoicePaymentMethod.BANK_TRANSFER,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        reference: dto.reference,
        note: dto.note,
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
      await this.closeLinkedTasks(id);
    }

    return this.findById(id, orgId);
  }

  async markPaid(id: string, orgId?: string) {
    const inv = await this.requireInvoice(id, orgId);
    const outstanding = Math.max(0, inv.totalCents - inv.paidCents);
    if (outstanding <= 0) {
      return this.findById(id, orgId);
    }
    return this.recordPayment(
      id,
      orgId!,
      { amountCents: outstanding, method: InvoicePaymentMethod.BANK_TRANSFER },
    );
  }

  async createBookingInvoice(
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
    context?: CreateBookingInvoiceContext,
  ) {
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
      const orgPolicies = await this.loadOrgInvoicePolicies(orgId);
      const defaultTaxRate = resolveOrgDefaultTaxRate(orgPolicies);
      const days = Math.max(1, Math.ceil((booking.endDate.getTime() - booking.startDate.getTime()) / 86400000));
      totalCents = booking.totalPriceCents || (booking.dailyRateCents || 0) * days;
      if (totalCents <= 0) return null;
      const grossPerDay = booking.dailyRateCents || Math.round(totalCents / days);
      const unitNet = netCentsFromGrossCents(grossPerDay, defaultTaxRate);
      this.logger.warn(
        `Booking invoice tax fallback org=${orgId} booking=${booking.id}: legacy gross split (rate=${defaultTaxRate}%)`,
      );
      lineItems = [
        {
          description: `Fahrzeugmiete (${days} Tage)`,
          quantity: days,
          unitPriceNetCents: unitNet,
          taxRate: defaultTaxRate,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
        },
      ];
    }

    if (totalCents <= 0) return null;

    return this.create(
      orgId,
      {
        type: 'OUTGOING_BOOKING',
        customerId: booking.customerId,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        title: buildBookingInvoiceTitle({ bookingId: booking.id }),
        description: `Mietrechnung für Buchungszeitraum ${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}`,
        lineItems,
        totalCents,
        currency,
        invoiceDate: new Date().toISOString(),
      },
      {
        userId: context?.userId,
        correlationId: context?.correlationId,
        provenance:
          context?.provenance ??
          provenanceForBookingWizardInvoice({
            bookingId: booking.id,
            userId: context?.userId,
            correlationId: context?.correlationId,
          }),
      },
    );
  }

  async createFinalInvoice(
    orgId: string,
    booking: {
      id: string;
      customerId: string;
      vehicleId: string;
      currency?: string | null;
    },
    context: CreateFinalInvoiceContext,
  ) {
    const existing = await this.prisma.orgInvoice.findFirst({
      where: { organizationId: orgId, bookingId: booking.id, type: 'OUTGOING_FINAL' },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    const orgPolicies = await this.loadOrgInvoicePolicies(orgId);
    const totalCents = context.totalCents;
    const totals = computeInvoiceTotals([], totalCents, { orgTax: orgPolicies });
    if (totals.taxMeta) {
      this.logger.warn(
        `Final invoice tax fallback org=${orgId} booking=${booking.id}: ${totals.taxMeta.reason}`,
      );
    }
    const invoiceDate = new Date();
    const dueResolved = resolveDueDateForCreate({
      invoiceDate,
      paymentTermsDays: orgPolicies.paymentTermsDays,
      timezone: resolveOrgTimezone(orgPolicies.timezone),
      isOutgoing: true,
    });
    const provenance = provenanceForBundlePipelineInvoice({
      bookingId: booking.id,
      userId: context.userId,
      correlationId: context.correlationId ?? booking.id,
      variant: 'FINAL_INVOICE',
    });
    const createdByUserId = await this.resolveOrgScopedUserId(orgId, provenance.createdByUserId);

    let originalInvoiceRef: {
      invoiceNumberDisplay?: string | null;
      sequenceYear?: number | null;
      sequenceNumber?: number | null;
    } | null = null;
    if (context.originalInvoiceId) {
      originalInvoiceRef = await this.prisma.orgInvoice.findFirst({
        where: { id: context.originalInvoiceId, organizationId: orgId },
        select: {
          invoiceNumberDisplay: true,
          sequenceYear: true,
          sequenceNumber: true,
        },
      });
    }

    return this.prisma.orgInvoice.create({
      data: {
        organizationId: orgId,
        type: 'OUTGOING_FINAL',
        customerId: booking.customerId,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        title: buildFinalInvoiceTitle({ bookingId: booking.id }),
        description: buildFinalInvoiceDescription({
          bookingId: booking.id,
          originalInvoiceId: context.originalInvoiceId,
          originalInvoiceNumberDisplay: originalInvoiceRef?.invoiceNumberDisplay,
          originalSequenceYear: originalInvoiceRef?.sequenceYear,
          originalSequenceNumber: originalInvoiceRef?.sequenceNumber,
        }),
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        outstandingCents: totals.totalCents,
        currency: (booking.currency || 'EUR').toUpperCase(),
        invoiceDate,
        dueDate: dueResolved.dueDate,
        dueDateBase: dueResolved.dueDateBase,
        paymentTermsDaysAtCreate: dueResolved.paymentTermsDaysAtCreate,
        status: 'DRAFT',
        ...provenanceToPrismaFields({ ...provenance, createdByUserId }),
      },
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

    return {
      total,
      outgoing,
      incoming,
      paid,
      unpaid,
      overdue,
      draftCount,
      reviewCount,
      totalRevenueCents,
      finalInvoiceRevenueCents,
      paidRevenueCents,
      totalExpensesCents,
    };
  }

  private async loadOrgInvoicePolicies(
    orgId: string,
  ): Promise<OrgDueDateSettings & OrgTaxSettings> {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: {
        paymentTermsDays: true,
        timezone: true,
        defaultVatRate: true,
        isSmallBusiness: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      paymentTermsDays: org.paymentTermsDays,
      timezone: org.timezone,
      defaultVatRate: org.defaultVatRate,
      isSmallBusiness: org.isSmallBusiness,
    };
  }

  private async resolveBookingStartDate(
    orgId: string,
    bookingId?: string | null,
    dueDateBase?: InvoiceDueDateBase | null,
  ): Promise<Date | null> {
    if (!bookingId || dueDateBase !== InvoiceDueDateBase.BOOKING_START) {
      return null;
    }
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { startDate: true },
    });
    return booking?.startDate ?? null;
  }

  private async resolveOrgScopedUserId(
    orgId: string,
    userId?: string | null,
  ): Promise<string | null> {
    if (!userId) return null;
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
      select: { userId: true },
    });
    return membership ? userId : null;
  }

  private async resolveCreateProvenance(
    orgId: string,
    data: CreateInvoiceDto & { fromExtraction?: boolean },
    context?: InvoiceCreateContext,
  ): Promise<InvoiceProvenanceWriteInput> {
    if (context?.provenance) return context.provenance;

    if (data.fromExtraction || data.documentExtractionId) {
      return provenanceForDocumentExtractionInvoice({
        extractionId: data.documentExtractionId!,
        userId: context?.userId,
        correlationId: context?.correlationId ?? data.documentExtractionId ?? null,
      });
    }

    if (context?.viaApi) {
      return provenanceForApiInvoice({
        userId: context.userId,
        bookingId: data.bookingId,
        vehicleId: data.vehicleId,
        correlationId: context.correlationId,
      });
    }

    return provenanceForManualUiInvoice({
      userId: context?.userId,
      bookingId: data.bookingId,
      vehicleId: data.vehicleId,
      correlationId: context?.correlationId,
    });
  }

  private async requireInvoice(id: string, orgId?: string) {
    const inv = orgId
      ? await this.prisma.orgInvoice.findFirst({ where: { id, organizationId: orgId } })
      : await this.prisma.orgInvoice.findUnique({ where: { id } });
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

  private resolveUnpaidTaskPriority(totalCents: number, dueDate?: string): TaskPriority {
    const dueMs = dueDate ? new Date(dueDate).getTime() : NaN;
    const isOverdue = Number.isFinite(dueMs) && dueMs < Date.now();
    if (isOverdue) return totalCents >= 50000 ? 'CRITICAL' : 'HIGH';
    return totalCents >= 50000 ? 'HIGH' : 'NORMAL';
  }

  private async createUnpaidTask(
    orgId: string,
    invoiceId: string,
    reference: InvoiceReferenceInput,
    totalCents: number,
    currency: string,
    type: string,
    dueDate?: string,
  ) {
    const isIncoming = type.startsWith('INCOMING');
    await this.tasksService.upsertByDedup(orgId, `invoice:unpaid:${invoiceId}`, {
      title: isIncoming
        ? buildUnpaidIncomingTaskTitle(reference)
        : buildUnpaidOutgoingTaskTitle(reference),
      description: buildUnpaidTaskDescription(reference, totalCents, currency),
      category: 'invoice',
      type: 'INVOICE_REQUIRED',
      source: 'INVOICE',
      sourceType: 'SYSTEM',
      priority: this.resolveUnpaidTaskPriority(totalCents, dueDate),
      invoiceId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
  }

  private async closeLinkedTasks(invoiceId: string) {
    const tasks = await this.prisma.orgTask.findMany({
      where: { invoiceId, status: { not: 'DONE' } },
    });
    for (const task of tasks) {
      await this.prisma.orgTask.update({
        where: { id: task.id },
        data: { status: 'DONE', completedAt: new Date() },
      });
    }
  }
}
