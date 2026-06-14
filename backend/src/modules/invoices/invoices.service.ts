import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  private format(inv: Record<string, unknown>) {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      customerId: inv.customerId || null,
      vendorId: inv.vendorId || null,
      // vendorName is a snapshot/backward-compat field; fall back to the linked
      // vendor's current name when the snapshot is empty.
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
      totalCents: inv.totalCents,
      currency: inv.currency,
      invoiceDate: (inv.invoiceDate as Date)?.toISOString?.() || '',
      dueDate: (inv.dueDate as Date)?.toISOString?.() || null,
      status: inv.status,
      templateId: inv.templateId || null,
      imageUrl: inv.imageUrl || null,
      extractedData: inv.extractedData || null,
      notes: inv.notes || '',
      paidAt: (inv.paidAt as Date)?.toISOString?.() || null,
      createdAt: (inv.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (inv.updatedAt as Date)?.toISOString?.() || '',
      tasks: undefined as unknown,
    };
  }

  async findByOrg(orgId: string, params?: { type?: string; status?: string }) {
    const where: Prisma.OrgInvoiceWhereInput = { organizationId: orgId };
    if (params?.type) where.type = params.type as any;
    if (params?.status) where.status = params.status as any;

    const invoices = await this.prisma.orgInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { tasks: true, vendor: { select: { id: true, name: true } } },
    });
    return invoices.map((inv) => {
      const formatted = this.format(inv as unknown as Record<string, unknown>);
      formatted.tasks = (inv.tasks || []).map((t) => ({
        id: t.id, title: t.title, status: t.status,
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
    // When orgId is provided we require the invoice to belong to that org to
    // prevent cross-tenant reads via a guessed / leaked id.
    const inv = orgId
      ? await this.prisma.orgInvoice.findFirst({
          where: { id, organizationId: orgId },
          include: { tasks: true, vendor: { select: { id: true, name: true } } },
        })
      : await this.prisma.orgInvoice.findUnique({
          where: { id },
          include: { tasks: true, vendor: { select: { id: true, name: true } } },
        });
    if (!inv) throw new NotFoundException('Invoice not found');
    const formatted = this.format(inv as unknown as Record<string, unknown>);
    formatted.tasks = (inv.tasks || []).map((t) => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, description: t.description,
    }));
    return formatted;
  }

  async create(orgId: string, data: {
    type: 'OUTGOING_BOOKING' | 'OUTGOING_MANUAL' | 'OUTGOING_FINAL' | 'INCOMING_VENDOR' | 'INCOMING_UPLOADED';
    customerId?: string;
    vendorId?: string;
    vendorName?: string;
    bookingId?: string;
    vehicleId?: string;
    title: string;
    description?: string;
    lineItems?: any;
    subtotalCents?: number;
    taxCents?: number;
    totalCents: number;
    currency?: string;
    invoiceDate?: string;
    dueDate?: string;
    status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
    templateId?: string;
    imageUrl?: string;
    extractedData?: Record<string, unknown>;
    notes?: string;
  }) {
    // Snapshot the vendor name when a vendor relation is set (tenant-checked).
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
        lineItems: data.lineItems ? (data.lineItems as Prisma.InputJsonValue) : undefined,
        subtotalCents: data.subtotalCents || data.totalCents,
        taxCents: data.taxCents || 0,
        totalCents: data.totalCents,
        currency: data.currency || 'EUR',
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status || 'DRAFT',
        templateId: data.templateId,
        imageUrl: data.imageUrl,
        extractedData: data.extractedData ? (data.extractedData as Prisma.InputJsonValue) : undefined,
        notes: data.notes,
        paidAt: data.status === 'PAID' ? new Date() : null,
      },
    });

    if (data.status !== 'PAID') {
      await this.createUnpaidTask(orgId, invoice.id, data.title, data.totalCents, data.currency || 'EUR', data.type, data.dueDate);
    }

    return this.findById(invoice.id);
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    lineItems?: any;
    subtotalCents?: number;
    taxCents?: number;
    totalCents?: number;
    dueDate?: string;
    status?: string;
    vendorId?: string | null;
    vendorName?: string;
    customerId?: string;
    notes?: string;
    templateId?: string;
  }, orgId?: string) {
    if (orgId) {
      // Tenant-scoped check: verify the invoice belongs to the caller's org
      // before applying an update.
      const existing = await this.prisma.orgInvoice.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Invoice not found');
    }
    // Validate vendor tenancy + refresh the name snapshot when (re)assigning.
    if (data.vendorId && orgId) {
      const resolvedName = await this.resolveVendorName(orgId, data.vendorId, data.vendorName);
      if (resolvedName && data.vendorName === undefined) data.vendorName = resolvedName;
    }
    const updateData: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val === undefined) continue;
      if (key === 'dueDate') {
        updateData[key] = val ? new Date(val as string) : null;
      } else if (key === 'lineItems') {
        updateData[key] = val as Prisma.InputJsonValue;
      } else {
        updateData[key] = val;
      }
    }

    if (data.status === 'PAID') {
      updateData.paidAt = new Date();
    }

    await this.prisma.orgInvoice.update({ where: { id }, data: updateData });

    if (data.status === 'PAID') {
      await this.closeLinkedTasks(id);
    }

    return this.findById(id, orgId);
  }

  async markPaid(id: string, orgId?: string) {
    if (orgId) {
      const existing = await this.prisma.orgInvoice.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Invoice not found');
    }
    await this.prisma.orgInvoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await this.closeLinkedTasks(id);
    return this.findById(id, orgId);
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

    const taxRate = 0.19;
    const subtotalCents = Math.round(totalCents / (1 + taxRate));
    const taxCents = totalCents - subtotalCents;
    const dueDate = new Date(booking.startDate);
    dueDate.setDate(dueDate.getDate() + 14);

    const lineItems = [
      {
        description: `Fahrzeugmiete (${days} Tage)`,
        quantity: days,
        unitPriceCents: booking.dailyRateCents || Math.round(totalCents / days),
        totalCents,
      },
    ];

    return this.create(orgId, {
      type: 'OUTGOING_BOOKING',
      customerId: booking.customerId,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      title: `Buchungsrechnung #${booking.id.slice(0, 8)}`,
      description: `Mietrechnung für Buchungszeitraum ${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}`,
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      currency: booking.currency || 'EUR',
      invoiceDate: new Date().toISOString(),
      dueDate: dueDate.toISOString(),
      status: 'SENT',
    });
  }

  async getStats(orgId: string) {
    const [total, outgoing, incoming, paid, unpaid, totalRevenue, totalExpenses] = await Promise.all([
      this.prisma.orgInvoice.count({ where: { organizationId: orgId } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, type: { in: ['OUTGOING_BOOKING', 'OUTGOING_MANUAL'] } } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, type: { in: ['INCOMING_VENDOR', 'INCOMING_UPLOADED'] } } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, status: 'PAID' } }),
      this.prisma.orgInvoice.count({ where: { organizationId: orgId, status: { not: 'PAID' } } }),
      this.prisma.orgInvoice.aggregate({
        where: { organizationId: orgId, type: { in: ['OUTGOING_BOOKING', 'OUTGOING_MANUAL'] } },
        _sum: { totalCents: true },
      }),
      this.prisma.orgInvoice.aggregate({
        where: { organizationId: orgId, type: { in: ['INCOMING_VENDOR', 'INCOMING_UPLOADED'] } },
        _sum: { totalCents: true },
      }),
    ]);
    return {
      total, outgoing, incoming, paid, unpaid,
      totalRevenueCents: totalRevenue._sum.totalCents || 0,
      totalExpensesCents: totalExpenses._sum.totalCents || 0,
    };
  }

  /**
   * Validates that a vendorId (if supplied) belongs to the org and returns the
   * vendor-name snapshot to persist. Prefers an explicit vendorName; otherwise
   * falls back to the linked vendor's current name. Throws on cross-tenant ids.
   */
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
    orgId: string, invoiceId: string, title: string,
    totalCents: number, currency: string, type: string, dueDate?: string,
  ) {
    const isIncoming = type.startsWith('INCOMING');
    await this.tasksService.create(orgId, {
      title: isIncoming
        ? `Eingangsrechnung bezahlen: ${title}`
        : `Zahlungseingang prüfen: ${title}`,
      description: `Rechnung "${title}" (${(totalCents / 100).toFixed(2)} ${currency}) ist noch unbezahlt.`,
      category: 'invoice',
      type: 'INVOICE_REQUIRED',
      source: 'INVOICE',
      sourceType: 'SYSTEM',
      priority: totalCents >= 50000 ? 'HIGH' : 'MEDIUM',
      invoiceId,
      dueDate,
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
