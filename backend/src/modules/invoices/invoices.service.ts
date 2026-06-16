import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoicePaymentMethod,
  OrgInvoiceStatus,
  OrgInvoiceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { CreateInvoiceDto, RecordInvoicePaymentDto, UpdateInvoiceDto } from './dto';
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
} from './invoice-line-items.util';
import { InvoiceNumberService } from './invoice-number.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly invoiceNumbers: InvoiceNumberService,
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
    params?: { type?: string; status?: string; direction?: string },
  ) {
    const where: Prisma.OrgInvoiceWhereInput = { organizationId: orgId };
    if (params?.type) where.type = params.type as OrgInvoiceType;
    if (params?.status) where.status = params.status as OrgInvoiceStatus;
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
    return invoices.map((inv) => {
      const formatted = this.format(inv as unknown as Record<string, unknown>);
      formatted.tasks = (inv.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      }));
      formatted.payments = (inv.payments || []).map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        note: p.note,
      }));
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
    const formatted = this.format(inv as unknown as Record<string, unknown>);
    formatted.tasks = (inv.tasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
    }));
    formatted.payments = (inv.payments || []).map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      reference: p.reference,
      note: p.note,
    }));
    return formatted;
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
      await this.createUnpaidTask(
        orgId,
        invoice.id,
        data.title,
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

    await this.createUnpaidTask(
      orgId,
      id,
      inv.title,
      inv.totalCents,
      inv.currency,
      inv.type,
      inv.dueDate?.toISOString(),
    );

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
    const days = Math.max(1, Math.ceil((booking.endDate.getTime() - booking.startDate.getTime()) / 86400000));
    const totalCents = booking.totalPriceCents || (booking.dailyRateCents || 0) * days;
    if (totalCents <= 0) return null;

    const unitNet = Math.round((booking.dailyRateCents || Math.round(totalCents / days)) / 1.19);
    const lineItems: InvoiceLineItemInput[] = [
      {
        description: `Fahrzeugmiete (${days} Tage)`,
        quantity: days,
        unitPriceNetCents: unitNet,
        taxRate: 19,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
      },
    ];

    const dueDate = new Date(booking.startDate);
    dueDate.setDate(dueDate.getDate() + 14);

    return this.create(orgId, {
      type: 'OUTGOING_BOOKING',
      customerId: booking.customerId,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      title: `Buchungsrechnung #${booking.id.slice(0, 8)}`,
      description: `Mietrechnung für Buchungszeitraum ${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}`,
      lineItems,
      totalCents,
      currency: booking.currency || 'EUR',
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

  private async createUnpaidTask(
    orgId: string,
    invoiceId: string,
    title: string,
    totalCents: number,
    currency: string,
    type: string,
    dueDate?: string,
  ) {
    const isIncoming = type.startsWith('INCOMING');
    await this.tasksService.upsertByDedup(orgId, `invoice:unpaid:${invoiceId}`, {
      title: isIncoming
        ? `Eingangsrechnung bezahlen: ${title}`
        : `Zahlungseingang prüfen: ${title}`,
      description: `Rechnung "${title}" (${(totalCents / 100).toFixed(2)} ${currency}) ist noch unbezahlt.`,
      category: 'invoice',
      type: 'INVOICE_REQUIRED',
      source: 'INVOICE',
      sourceType: 'SYSTEM',
      priority: totalCents >= 50000 ? 'HIGH' : 'NORMAL',
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
