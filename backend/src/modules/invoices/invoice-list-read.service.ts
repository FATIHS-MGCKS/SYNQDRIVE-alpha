import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import type { InvoiceListItemDto } from './dto/invoice-list-item.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { mapInvoiceListItem } from './invoice-list-item.mapper';
import {
  applyInvoiceListAuxiliaryFilters,
  buildInvoiceListBaseWhere,
  buildInvoiceListOrderBy,
  InvoiceListSearchScope,
  parseInvoiceListPagination,
  resolveInvoiceListSort,
} from './invoice-list-query.util';

const INVOICE_LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  title: true,
  customerId: true,
  vendorId: true,
  vendorName: true,
  bookingId: true,
  vehicleId: true,
  totalCents: true,
  paidCents: true,
  outstandingCents: true,
  currency: true,
  invoiceDate: true,
  dueDate: true,
  generatedDocumentId: true,
  documentExtractionId: true,
  invoiceNumberDisplay: true,
  legacyInvoiceNumber: true,
  invoiceNumber: true,
  sequenceYear: true,
  sequenceNumber: true,
} satisfies Prisma.OrgInvoiceSelect;

type InvoiceListRecord = Prisma.OrgInvoiceGetPayload<{ select: typeof INVOICE_LIST_SELECT }>;

@Injectable()
export class InvoiceListReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListInvoicesQueryDto,
  ): Promise<PaginatedResult<InvoiceListItemDto>> {
    const pagination = parseInvoiceListPagination(query);
    const { sortBy, sortOrder } = resolveInvoiceListSort(query);

    const [
      searchScope,
      stationBookingIds,
      sendStatusInvoiceIds,
      documentInvoiceIds,
    ] = await Promise.all([
      query.search?.trim()
        ? this.resolveSearchScope(orgId, query.search.trim())
        : Promise.resolve(undefined),
      query.stationId ? this.resolveStationBookingIds(orgId, query.stationId) : Promise.resolve(undefined),
      query.sendStatus ? this.resolveSendStatusInvoiceIds(orgId, query.sendStatus) : Promise.resolve(undefined),
      query.documentStatus === 'failed'
        ? this.resolveDocumentInvoiceIds(orgId, 'failed')
        : Promise.resolve(undefined),
    ]);

    const where = applyInvoiceListAuxiliaryFilters(buildInvoiceListBaseWhere(orgId, query), {
      search: query.search,
      searchScope,
      stationBookingIds,
      sendStatusInvoiceIds,
      documentInvoiceIds,
      documentStatus: query.documentStatus,
    });

    const orderBy = buildInvoiceListOrderBy(sortBy, sortOrder);

    const [invoices, total] = await Promise.all([
      this.prisma.orgInvoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        select: INVOICE_LIST_SELECT,
      }),
      this.prisma.orgInvoice.count({ where }),
    ]);

    const items = await this.enrichListItems(orgId, invoices);
    return buildPaginatedResult(items, total, pagination);
  }

  private async resolveSearchScope(orgId: string, search: string): Promise<InvoiceListSearchScope> {
    const q = search.trim();

    const [customers, vendors, vehicles, documents, bookingIds] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { fullNameNormalized: { contains: q.toLowerCase(), mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 200,
      }),
      this.prisma.vendor.findMany({
        where: {
          organizationId: orgId,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true },
        take: 200,
      }),
      this.prisma.vehicle.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { licensePlate: { contains: q, mode: 'insensitive' } },
            { vin: { contains: q, mode: 'insensitive' } },
            { make: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { vehicleName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 200,
      }),
      this.prisma.generatedDocument.findMany({
        where: {
          organizationId: orgId,
          invoiceId: { not: null },
          OR: [
            { documentNumber: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { invoiceId: true },
        take: 200,
      }),
      this.resolveBookingSearchIds(orgId, q),
    ]);

    return {
      customerIds: customers.map((c) => c.id),
      vendorIds: vendors.map((v) => v.id),
      bookingIds,
      vehicleIds: vehicles.map((v) => v.id),
      documentInvoiceIds: documents
        .map((d) => d.invoiceId)
        .filter((id): id is string => Boolean(id)),
    };
  }

  private async resolveBookingSearchIds(orgId: string, search: string): Promise<string[]> {
    const q = search.trim();
    const suffix = q.toUpperCase().replace(/^BK-/, '');
    if (suffix.length < 4) return [];

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM bookings
      WHERE organization_id = ${orgId}
        AND (
          UPPER(RIGHT(REPLACE(id::text, '-', ''), 6)) LIKE ${`%${suffix}%`}
          OR id::text ILIKE ${`%${q}%`}
        )
      LIMIT 200
    `;
    return rows.map((row) => row.id);
  }

  private async resolveStationBookingIds(orgId: string, stationId: string): Promise<string[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        OR: [{ pickupStationId: stationId }, { returnStationId: stationId }],
      },
      select: { id: true },
    });
    return bookings.map((b) => b.id);
  }

  private async resolveSendStatusInvoiceIds(
    orgId: string,
    status: Prisma.EnumOutboundEmailStatusFilter['equals'],
  ): Promise<string[]> {
    const emails = await this.prisma.outboundEmail.findMany({
      where: {
        organizationId: orgId,
        invoiceId: { not: null },
        status: status as never,
      },
      select: { invoiceId: true },
      distinct: ['invoiceId'],
      take: 5000,
    });
    return emails.map((e) => e.invoiceId!).filter(Boolean);
  }

  private async resolveDocumentInvoiceIds(
    orgId: string,
    filter: 'present' | 'failed',
  ): Promise<string[]> {
    const docs = await this.prisma.generatedDocument.findMany({
      where: {
        organizationId: orgId,
        invoiceId: { not: null },
        ...(filter === 'failed' ? { status: 'FAILED' } : { status: { not: 'FAILED' } }),
      },
      select: { invoiceId: true },
      take: 5000,
    });
    return docs.map((d) => d.invoiceId!).filter(Boolean);
  }

  private async enrichListItems(
    orgId: string,
    invoices: InvoiceListRecord[],
  ): Promise<InvoiceListItemDto[]> {
    if (!invoices.length) return [];

    const customerIds = [...new Set(invoices.map((i) => i.customerId).filter(Boolean))] as string[];
    const vendorIds = [...new Set(invoices.map((i) => i.vendorId).filter(Boolean))] as string[];
    const vehicleIds = [...new Set(invoices.map((i) => i.vehicleId).filter(Boolean))] as string[];
    const documentIds = [
      ...new Set(invoices.map((i) => i.generatedDocumentId).filter(Boolean)),
    ] as string[];
    const invoiceIds = invoices.map((i) => i.id);

    const [customers, vendors, vehicles, documents, emails, tasks] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { organizationId: orgId, id: { in: customerIds } },
          })
        : Promise.resolve([]),
      vendorIds.length
        ? this.prisma.vendor.findMany({
            where: { organizationId: orgId, id: { in: vendorIds } },
          })
        : Promise.resolve([]),
      vehicleIds.length
        ? this.prisma.vehicle.findMany({
            where: { organizationId: orgId, id: { in: vehicleIds } },
          })
        : Promise.resolve([]),
      documentIds.length
        ? this.prisma.generatedDocument.findMany({
            where: { organizationId: orgId, id: { in: documentIds } },
          })
        : Promise.resolve([]),
      invoiceIds.length
        ? this.prisma.outboundEmail.findMany({
            where: { organizationId: orgId, invoiceId: { in: invoiceIds } },
            orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
      invoiceIds.length
        ? this.prisma.orgTask.findMany({
            where: { organizationId: orgId, invoiceId: { in: invoiceIds } },
          })
        : Promise.resolve([]),
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const documentMap = new Map(documents.map((d) => [d.id, d]));
    const lastEmailMap = new Map<string, (typeof emails)[number]>();
    for (const email of emails) {
      if (!email.invoiceId || lastEmailMap.has(email.invoiceId)) continue;
      lastEmailMap.set(email.invoiceId, email);
    }
    const tasksByInvoice = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.invoiceId) continue;
      const list = tasksByInvoice.get(task.invoiceId) ?? [];
      list.push(task);
      tasksByInvoice.set(task.invoiceId, list);
    }

    const now = new Date();
    return invoices.map((invoice) =>
      mapInvoiceListItem({
        invoice,
        customer: invoice.customerId ? customerMap.get(invoice.customerId) ?? null : null,
        vendor: invoice.vendorId ? vendorMap.get(invoice.vendorId) ?? null : null,
        vehicle: invoice.vehicleId ? vehicleMap.get(invoice.vehicleId) ?? null : null,
        document: invoice.generatedDocumentId
          ? documentMap.get(invoice.generatedDocumentId) ?? null
          : null,
        lastEmail: lastEmailMap.get(invoice.id) ?? null,
        openTasks: tasksByInvoice.get(invoice.id) ?? [],
        now,
      }),
    );
  }
}
