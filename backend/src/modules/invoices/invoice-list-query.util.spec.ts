import { OrgInvoiceStatus } from '@prisma/client';
import {
  applyInvoiceListAuxiliaryFilters,
  buildInvoiceListBaseWhere,
  buildInvoiceListOrderBy,
  buildInvoiceSearchOrClauses,
  isInvoiceOverdue,
  parseInvoiceListPagination,
  resolveInvoiceListSort,
} from './invoice-list-query.util';
import type { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';

describe('invoice-list-query.util', () => {
  const orgId = 'org-1';

  it('caps pagination limit at 100', () => {
    expect(parseInvoiceListPagination({ page: 2, limit: 500 })).toEqual({
      page: 2,
      limit: 100,
      skip: 100,
      take: 100,
    });
  });

  it('builds stable sort with id tie-breaker', () => {
    expect(buildInvoiceListOrderBy('invoiceDate', 'desc')).toEqual([
      { invoiceDate: 'desc' },
      { id: 'desc' },
    ]);
    expect(buildInvoiceListOrderBy('invoiceNumber', 'asc')).toEqual([
      { sequenceYear: { sort: 'asc', nulls: 'last' } },
      { sequenceNumber: { sort: 'asc', nulls: 'last' } },
      { legacyInvoiceNumber: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('excludes void invoices by default', () => {
    const where = buildInvoiceListBaseWhere(orgId, {});
    expect(where).toMatchObject({
      organizationId: orgId,
      status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
    });
  });

  it('filters outgoing direction', () => {
    const where = buildInvoiceListBaseWhere(orgId, { direction: 'outgoing' });
    expect(where.type).toEqual({
      in: ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'],
    });
  });

  it('filters overdue invoices', () => {
    const where = buildInvoiceListBaseWhere(orgId, { overdue: true });
    expect(where.outstandingCents).toEqual({ gt: 0 });
    expect(where.dueDate).toMatchObject({ lt: expect.any(Date) });
    expect(where.status).toEqual({
      notIn: expect.arrayContaining(['PAID', 'DRAFT']),
    });
  });

  it('builds search OR clauses across relations', () => {
    const clauses = buildInvoiceSearchOrClauses('ACME', {
      customerIds: ['cust-1'],
      vendorIds: ['ven-1'],
      bookingIds: ['book-1'],
      vehicleIds: ['veh-1'],
      documentInvoiceIds: ['inv-doc-1'],
    });
    expect(clauses).toEqual(
      expect.arrayContaining([
        { customerId: { in: ['cust-1'] } },
        { vendorId: { in: ['ven-1'] } },
        { bookingId: { in: ['book-1'] } },
        { vehicleId: { in: ['veh-1'] } },
        { id: { in: ['inv-doc-1'] } },
      ]),
    );
  });

  it('applies document missing filter', () => {
    const where = applyInvoiceListAuxiliaryFilters(
      { organizationId: orgId },
      { documentStatus: 'missing' },
    );
    expect(where).toEqual({
      AND: [{ organizationId: orgId }, { generatedDocumentId: null }],
    });
  });

  it('detects overdue from due date and outstanding amount', () => {
    const now = new Date('2026-07-15T00:00:00Z');
    expect(
      isInvoiceOverdue({
        dueDate: new Date('2026-07-01T00:00:00Z'),
        outstandingCents: 1000,
        status: OrgInvoiceStatus.ISSUED,
        now,
      }),
    ).toBe(true);
    expect(
      isInvoiceOverdue({
        dueDate: new Date('2026-07-01T00:00:00Z'),
        outstandingCents: 0,
        status: OrgInvoiceStatus.PAID,
        now,
      }),
    ).toBe(false);
  });

  it('defaults sort to invoiceDate desc', () => {
    expect(resolveInvoiceListSort({} as ListInvoicesQueryDto)).toEqual({
      sortBy: 'invoiceDate',
      sortOrder: 'desc',
    });
  });
});
