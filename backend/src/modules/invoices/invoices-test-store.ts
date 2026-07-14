/**
 * In-memory Prisma stand-in for invoice pipeline integration tests.
 * Relational state + transactions — no external DB (project convention).
 */
import {
  FIXED_NOW,
  createInvoicePipelineFixtures,
  type InvoicePipelineFixtureIds,
} from './__fixtures__/invoice-pipeline.fixtures';

type Row = Record<string, unknown>;

function clone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (Array.isArray(v)) return v.map((item) => clone(item)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    out[key] = clone(val);
  }
  return out as T;
}

function matchesScalar(field: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null) return field === null || field === undefined;
  if (typeof expected === 'object' && expected !== null) {
    const obj = expected as Record<string, unknown>;
    if ('in' in obj && Array.isArray(obj.in)) {
      return (obj.in as unknown[]).includes(field);
    }
    if ('notIn' in obj && Array.isArray(obj.notIn)) {
      return !(obj.notIn as unknown[]).includes(field);
    }
    if ('not' in obj) {
      if (typeof obj.not === 'object' && obj.not !== null && 'in' in (obj.not as object)) {
        return !(obj.not as { in: unknown[] }).in.includes(field);
      }
      return field !== obj.not;
    }
    if ('gte' in obj) return (field as Date) >= (obj.gte as Date);
    if ('lte' in obj) return (field as Date) <= (obj.lte as Date);
    if ('lt' in obj) return (field as Date) < (obj.lt as Date);
  }
  return field === expected;
}

function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(expected)) {
      if (!(expected as Record<string, unknown>[]).every((w) => matchesWhere(row, w))) return false;
      continue;
    }
    if (key === 'OR' && Array.isArray(expected)) {
      if (!(expected as Record<string, unknown>[]).some((w) => matchesWhere(row, w))) return false;
      continue;
    }
    if (key === 'NOT' && expected && typeof expected === 'object') {
      if (matchesWhere(row, expected as Record<string, unknown>)) return false;
      continue;
    }
    const field = row[key];
    if (!matchesScalar(field, expected)) return false;
  }
  return true;
}

function sortRows(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>): Row[] {
  const clauses = orderBy
    ? Array.isArray(orderBy)
      ? orderBy
      : [orderBy]
    : [];
  if (clauses.length === 0) return [...rows];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const key = Object.keys(clause)[0];
      const dir = clause[key];
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      const cmp = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : String(av).localeCompare(String(bv));
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export interface InvoiceTestStoreOptions {
  now?: () => Date;
  ids?: InvoicePipelineFixtureIds;
}

export function createInvoiceTestStore(options?: InvoiceTestStoreOptions) {
  const ids = options?.ids ?? createInvoicePipelineFixtures();
  const nowFn = options?.now ?? (() => FIXED_NOW);
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  const organizations: Row[] = [
    {
      id: ids.orgA,
      companyName: 'Test Fleet GmbH',
      shortCode: 'TFL',
      emailSignature: 'Mit freundlichen Grüßen',
      timezone: 'Europe/Berlin',
    },
    { id: ids.orgB, companyName: 'Other Org', shortCode: 'OTH', emailSignature: null, timezone: 'Europe/Berlin' },
  ];

  const customers: Row[] = [
    {
      id: ids.customerPrivate,
      organizationId: ids.orgA,
      firstName: 'Max',
      lastName: 'Muster',
      company: null,
      email: 'max@example.com',
    },
    {
      id: ids.customerCompany,
      organizationId: ids.orgA,
      firstName: 'Erika',
      lastName: 'Firma',
      company: 'Firma AG',
      email: 'billing@firma-ag.de',
    },
    {
      id: ids.customerOtherOrg,
      organizationId: ids.orgB,
      firstName: 'Fremd',
      lastName: 'Kunde',
      company: null,
      email: 'fremd@other.org',
    },
  ];

  const vehicles: Row[] = [
    {
      id: ids.vehicleA,
      organizationId: ids.orgA,
      make: 'VW',
      model: 'Golf',
      licensePlate: 'KS-T 100',
    },
    {
      id: ids.vehicleOtherOrg,
      organizationId: ids.orgB,
      make: 'BMW',
      model: 'X1',
      licensePlate: 'B-XY 9',
    },
  ];

  const vendors: Row[] = [{ id: ids.vendorA, organizationId: ids.orgA, name: 'Werkstatt Nord' }];

  const bookings: Row[] = [
    {
      id: ids.bookingWizard,
      organizationId: ids.orgA,
      customerId: ids.customerPrivate,
      vehicleId: ids.vehicleA,
      status: 'CONFIRMED',
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-05T10:00:00.000Z'),
      totalPriceCents: 10000,
      dailyRateCents: 2500,
      currency: 'EUR',
    },
    {
      id: ids.bookingForm,
      organizationId: ids.orgA,
      customerId: ids.customerCompany,
      vehicleId: ids.vehicleA,
      status: 'CONFIRMED',
      startDate: new Date('2026-08-10T10:00:00.000Z'),
      endDate: new Date('2026-08-12T10:00:00.000Z'),
      totalPriceCents: 12000,
      dailyRateCents: 4000,
      currency: 'EUR',
    },
  ];

  const bookingPriceSnapshots: Row[] = [
    {
      id: 'snap-wizard',
      organizationId: ids.orgA,
      bookingId: ids.bookingWizard,
      currency: 'EUR',
      totalGrossCents: 10000,
      subtotalNetCents: 8403,
      taxRatePercent: 19,
      rentalDays: 4,
      lineItems: [
        {
          id: 'li-1',
          label: 'Miete',
          quantity: 4,
          totalNetCents: 8403,
          taxRatePercent: 19,
          type: 'RENTAL',
          sortOrder: 0,
        },
      ],
    },
    {
      id: 'snap-form',
      organizationId: ids.orgA,
      bookingId: ids.bookingForm,
      currency: 'EUR',
      totalGrossCents: 12000,
      subtotalNetCents: 10084,
      taxRatePercent: 19,
      rentalDays: 2,
      lineItems: [
        {
          id: 'li-2',
          label: 'Miete Firma',
          quantity: 2,
          totalNetCents: 10084,
          taxRatePercent: 19,
          type: 'RENTAL',
          sortOrder: 0,
        },
      ],
    },
  ];

  const users: Row[] = [
    {
      id: ids.userAdmin,
      name: 'Admin User',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
  ];

  const orgInvoices: Row[] = [];
  const orgInvoicePayments: Row[] = [];
  const orgInvoiceSequences: Row[] = [];
  const generatedDocuments: Row[] = [];
  const outboundEmails: Row[] = [];
  const outboundEmailAttachments: Row[] = [];
  const outboundEmailEvents: Row[] = [];
  const orgTasks: Row[] = [];

  const tableFor = (model: string): Row[] => {
    switch (model) {
      case 'organization':
        return organizations;
      case 'customer':
        return customers;
      case 'vehicle':
        return vehicles;
      case 'vendor':
        return vendors;
      case 'booking':
        return bookings;
      case 'bookingPriceSnapshot':
        return bookingPriceSnapshots;
      case 'user':
        return users;
      case 'orgInvoice':
        return orgInvoices;
      case 'orgInvoicePayment':
        return orgInvoicePayments;
      case 'orgInvoiceSequence':
        return orgInvoiceSequences;
      case 'generatedDocument':
        return generatedDocuments;
      case 'outboundEmail':
        return outboundEmails;
      case 'outboundEmailAttachment':
        return outboundEmailAttachments;
      case 'outboundEmailEvent':
        return outboundEmailEvents;
      case 'orgTask':
        return orgTasks;
      default:
        throw new Error(`Unknown model ${model}`);
    }
  };

  const applyInclude = (row: Row, model: string, include?: Record<string, unknown>): Row => {
    if (!include) return clone(row);
    const out = clone(row);
    if (model === 'orgInvoice') {
      if (include.vendor) {
        out.vendor = vendors.find((v) => v.id === row.vendorId) ?? null;
      }
      if (include.tasks) {
        out.tasks = orgTasks.filter((t) => t.invoiceId === row.id);
      }
      if (include.payments) {
        let payments = orgInvoicePayments.filter((p) => p.invoiceId === row.id);
        const orderBy = include.payments as { orderBy?: Record<string, string>; take?: number };
        if (orderBy?.orderBy?.paidAt) {
          payments = sortRows(payments, { paidAt: orderBy.orderBy.paidAt as 'asc' | 'desc' });
        }
        if (orderBy?.take) payments = payments.slice(0, orderBy.take);
        out.payments = payments;
      }
    }
    if (model === 'bookingPriceSnapshot' && include.lineItems) {
      const orderBy = (include.lineItems as { orderBy?: Record<string, string> })?.orderBy;
      let items = [...((row.lineItems as Row[]) ?? [])];
      if (orderBy?.sortOrder) {
        items = sortRows(items, { sortOrder: orderBy.sortOrder as 'asc' | 'desc' });
      }
      out.lineItems = items;
    }
    if (model === 'outboundEmail') {
      if (include.attachments) out.attachments = outboundEmailAttachments.filter((a) => a.outboundEmailId === row.id);
      if (include.events) {
        let events = outboundEmailEvents.filter((e) => e.outboundEmailId === row.id);
        const orderBy = (include.events as { orderBy?: Record<string, string> })?.orderBy;
        if (orderBy?.occurredAt) events = sortRows(events, { occurredAt: orderBy.occurredAt as 'asc' | 'desc' });
        out.events = events;
      }
    }
    if (model === 'organization' && include.orgEmailSettings) {
      out.orgEmailSettings = { signatureHtml: '<p>Org Sig</p>' };
    }
    return out;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelApi = (model: string): any => ({
    findFirst: async (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
      select?: Record<string, boolean>;
    } = {}) => {
      const rows = sortRows(
        tableFor(model).filter((r) => matchesWhere(r, args.where)),
        args.orderBy,
      );
      const row = rows[0];
      if (!row) return null;
      if (args.select) {
        const picked: Row = {};
        for (const key of Object.keys(args.select)) {
          if (args.select[key]) picked[key] = row[key];
        }
        return picked;
      }
      return applyInclude(row, model, args.include);
    },
    findFirstOrThrow: async (args: Parameters<ReturnType<typeof modelApi>['findFirst']>[0]) => {
      const row = await modelApi(model).findFirst(args);
      if (!row) throw new Error(`${model} not found`);
      return row;
    },
    findUnique: async (args: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
      const where = args.where;
      const id = where.id as string | undefined;
      const composite = where.organizationId_sequenceYear as { organizationId: string; sequenceYear: number } | undefined;
      let row: Row | undefined;
      if (id) row = tableFor(model).find((r) => r.id === id);
      if (composite && model === 'orgInvoiceSequence') {
        row = orgInvoiceSequences.find(
          (s) => s.organizationId === composite.organizationId && s.sequenceYear === composite.sequenceYear,
        );
      }
      if (!row) return null;
      return applyInclude(row, model, args.include);
    },
    findUniqueOrThrow: async (args: Parameters<ReturnType<typeof modelApi>['findUnique']>[0]) => {
      const row = await modelApi(model).findUnique(args);
      if (!row) throw new Error(`${model} not found`);
      return row;
    },
    findMany: async (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
      skip?: number;
    } = {}) => {
      let rows = sortRows(
        tableFor(model).filter((r) => matchesWhere(r, args.where)),
        args.orderBy,
      );
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take != null) rows = rows.slice(0, args.take);
      return rows.map((r) => applyInclude(r, model, args.include));
    },
    count: async (args: { where?: Record<string, unknown> } = {}) =>
      tableFor(model).filter((r) => matchesWhere(r, args.where)).length,
    create: async (args: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
      const data = { ...args.data };
      const row: Row = {
        id: (data.id as string) ?? nextId(model),
        createdAt: data.createdAt ?? nowFn(),
        updatedAt: data.updatedAt ?? nowFn(),
        occurredAt: data.occurredAt ?? (model === 'outboundEmailEvent' ? nowFn() : undefined),
        ...data,
      };
      delete row.attachments;
      delete row.events;
      tableFor(model).push(row);

      if (model === 'outboundEmail') {
        const attCreates = (args.data.attachments as { create?: Row[] })?.create ?? [];
        for (const att of attCreates) {
          outboundEmailAttachments.push({
            id: nextId('att'),
            outboundEmailId: row.id,
            createdAt: nowFn(),
            ...att,
          });
        }
        const evCreate = (args.data.events as { create?: Row | Row[] })?.create;
        const evRows = evCreate ? (Array.isArray(evCreate) ? evCreate : [evCreate]) : [];
        for (const ev of evRows) {
          outboundEmailEvents.push({
            id: nextId('evt'),
            outboundEmailId: row.id,
            occurredAt: nowFn(),
            ...ev,
          });
        }
      }

      return applyInclude(row, model, args.include);
    },
    update: async (args: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => {
      const rows = tableFor(model);
      const idx = rows.findIndex((r) => r.id === args.where.id);
      if (idx < 0) throw new Error(`${model} update not found`);
      rows[idx] = { ...rows[idx], ...args.data, updatedAt: nowFn() };
      return applyInclude(rows[idx], model, args.include);
    },
    updateMany: async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of tableFor(model)) {
        if (matchesWhere(row, args.where)) {
          Object.assign(row, args.data, { updatedAt: nowFn() });
          count += 1;
        }
      }
      return { count };
    },
    groupBy: async (args: { by: string[]; where?: Record<string, unknown>; _count?: { _all?: boolean } }) => {
      const key = args.by[0];
      const groups = new Map<string, number>();
      for (const row of tableFor(model).filter((r) => matchesWhere(r, args.where))) {
        const k = String(row[key]);
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
      return [...groups.entries()].map(([status, count]) => ({
        [key]: status,
        _count: { _all: count },
      }));
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    organization: modelApi('organization'),
    customer: modelApi('customer'),
    vehicle: modelApi('vehicle'),
    vendor: modelApi('vendor'),
    booking: modelApi('booking'),
    bookingPriceSnapshot: modelApi('bookingPriceSnapshot'),
    user: modelApi('user'),
    orgInvoice: modelApi('orgInvoice'),
    orgInvoicePayment: modelApi('orgInvoicePayment'),
    orgInvoiceSequence: modelApi('orgInvoiceSequence'),
    generatedDocument: modelApi('generatedDocument'),
    outboundEmail: modelApi('outboundEmail'),
    outboundEmailEvent: modelApi('outboundEmailEvent'),
    outboundEmailAttachment: modelApi('outboundEmailAttachment'),
    orgTask: modelApi('orgTask'),
    $transaction: async <T>(
      arg: ((tx: typeof prisma) => Promise<T> | T) | Array<Promise<unknown>>,
    ): Promise<T> => {
      if (Array.isArray(arg)) {
        const results = [];
        for (const op of arg) {
          results.push(await op);
        }
        return results as T;
      }
      return arg(prisma);
    },
  };

  return {
    ids,
    prisma,
    tables: {
      orgInvoices,
      generatedDocuments,
      outboundEmails,
      orgTasks,
      orgInvoicePayments,
    },
    seedDocument: (doc: Partial<Row> & { organizationId: string }) => {
      const row: Row = {
        id: doc.id ?? nextId('doc'),
        documentType: 'BOOKING_INVOICE',
        origin: 'GENERATED',
        status: 'GENERATED',
        title: 'Rechnung',
        fileName: 'rechnung.pdf',
        mimeType: 'application/pdf',
        objectKey: `key-${doc.id ?? 'new'}`,
        sizeBytes: 100,
        bookingId: null,
        invoiceId: null,
        generatedAt: nowFn(),
        createdAt: nowFn(),
        ...doc,
      };
      generatedDocuments.push(row);
      return row;
    },
    seedInvoice: (inv: Partial<Row> & { organizationId: string; type: string; title: string }) => {
      const row: Row = {
        id: inv.id ?? nextId('inv'),
        status: 'DRAFT',
        currency: 'EUR',
        subtotalCents: 8403,
        taxCents: 1597,
        totalCents: 10000,
        paidCents: 0,
        outstandingCents: 10000,
        invoiceDate: nowFn(),
        dueDate: null,
        createdAt: nowFn(),
        updatedAt: nowFn(),
        ...inv,
      };
      orgInvoices.push(row);
      return row;
    },
    seedTask: (task: Partial<Row> & { organizationId: string; invoiceId: string }) => {
      const row: Row = {
        id: task.id ?? nextId('task'),
        title: 'Offene Zahlung',
        status: 'OPEN',
        dedupKey: `invoice:unpaid:${task.invoiceId}`,
        ...task,
      };
      orgTasks.push(row);
      return row;
    },
  };
}

export type InvoiceTestStore = ReturnType<typeof createInvoiceTestStore>;
