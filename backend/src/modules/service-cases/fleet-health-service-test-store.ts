/**
 * In-memory store extension for Fleet Health Service domain integration tests.
 * Builds on booking-task-test-store (org, vehicles, tasks, memberships).
 */
import { createBookingTaskTestStore } from '@modules/tasks/booking-task-test-store';
import {
  createFleetHealthServicePipelineFixtures,
  FHS_PIPELINE_FIXED_NOW,
  type FleetHealthServicePipelineFixtureIds,
} from './__fixtures__/fleet-health-service-pipeline.fixtures';

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
    if ('in' in obj && Array.isArray(obj.in)) return (obj.in as unknown[]).includes(field);
    if ('contains' in obj) {
      return typeof field === 'string' && field.includes(obj.contains as string);
    }
    if ('gte' in obj) return (field as Date) >= (obj.gte as Date);
    if ('lte' in obj) return (field as Date) <= (obj.lte as Date);
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
    const field = row[key];
    if (key === 'vehicle' && expected && typeof expected === 'object') {
      const nested = expected as { organizationId?: string };
      if (nested.organizationId && row.organizationId !== nested.organizationId) return false;
      continue;
    }
    if (!matchesScalar(field, expected)) return false;
  }
  return true;
}

function sortRows(
  rows: Row[],
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>,
): Row[] {
  const clauses = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  if (clauses.length === 0) return [...rows];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const key = Object.keys(clause)[0];
      const dir = clause[key];
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      const cmp =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : String(av).localeCompare(String(bv));
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export interface FleetHealthServiceTestStoreOptions {
  ids?: FleetHealthServicePipelineFixtureIds;
  now?: () => Date;
}

export function createFleetHealthServiceTestStore(options?: FleetHealthServiceTestStoreOptions) {
  const ids = options?.ids ?? createFleetHealthServicePipelineFixtures();
  const nowFn = options?.now ?? (() => FHS_PIPELINE_FIXED_NOW);
  const base = createBookingTaskTestStore({
    ids: {
      ...ids,
      bookingA: 'booking-fhs-a',
      bookingB: 'booking-fhs-b',
      customerA: 'customer-fhs-a',
      customerB: 'customer-fhs-b',
    },
    now: nowFn,
  });

  const serviceCases: Row[] = [];
  const serviceCaseComments: Row[] = [];
  const serviceCaseAttachments: Row[] = [];
  const vehicleComplaints: Row[] = [];
  const vendors: Row[] = [];
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  const taskRows = () => base.tables.orgTasks as Row[];

  const applyServiceCaseInclude = (row: Row, include?: Record<string, unknown>): Row => {
    if (!include) return clone(row);
    const out = clone(row);
    if (include.tasks) {
      const linked = sortRows(
        taskRows().filter((t) => t.serviceCaseId === row.id),
        (include.tasks as { orderBy?: Record<string, string> })?.orderBy
          ? { createdAt: ((include.tasks as { orderBy: Record<string, string> }).orderBy.createdAt as 'asc' | 'desc') }
          : undefined,
      );
      const select = (include.tasks as { select?: Record<string, boolean> })?.select;
      out.tasks = select
        ? linked.map((task) => {
            const picked: Row = {};
            for (const key of Object.keys(select)) {
              if (select[key]) picked[key] = task[key];
            }
            return picked;
          })
        : linked;
    }
    if (include.comments) {
      out.comments = sortRows(
        serviceCaseComments.filter((c) => c.serviceCaseId === row.id),
        { createdAt: 'asc' },
      );
    }
    if (include.attachments) {
      out.attachments = sortRows(
        serviceCaseAttachments.filter((a) => a.serviceCaseId === row.id),
        { createdAt: 'asc' },
      );
    }
    return out;
  };

  const tableFor = (model: string): Row[] => {
    switch (model) {
      case 'serviceCase':
        return serviceCases;
      case 'serviceCaseComment':
        return serviceCaseComments;
      case 'serviceCaseAttachment':
        return serviceCaseAttachments;
      case 'vehicleComplaint':
        return vehicleComplaints;
      case 'vendor':
        return vendors;
      default:
        throw new Error(`Unknown extended model ${model}`);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelApi = (model: string): any => ({
    findFirst: (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      select?: Record<string, boolean>;
    } = {}) => {
      const rows = sortRows(
        tableFor(model).filter((r) => matchesWhere(r, args.where)),
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
      return model === 'serviceCase' ? applyServiceCaseInclude(row, args.include) : clone(row);
    },
    findMany: (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
    } = {}) => {
      const rows = sortRows(
        tableFor(model).filter((r) => matchesWhere(r, args.where)),
        args.orderBy,
      );
      return rows.map((r) =>
        model === 'serviceCase' ? applyServiceCaseInclude(r, args.include) : clone(r),
      );
    },
    count: (args: { where?: Record<string, unknown> } = {}) =>
      tableFor(model).filter((r) => matchesWhere(r, args.where)).length,
    groupBy: (args: { by: string[]; where?: Record<string, unknown> }) => {
      const groups = new Map<string, { _count: number } & Row>();
      for (const row of tableFor(model).filter((r) => matchesWhere(r, args.where))) {
        const key = args.by.map((b) => String(row[b])).join('|');
        const existing = groups.get(key);
        if (existing) existing._count += 1;
        else {
          const entry: Row = { _count: 1 };
          for (const b of args.by) entry[b] = row[b];
          groups.set(key, entry as { _count: number } & Row);
        }
      }
      return [...groups.values()];
    },
    create: (args: { data: Record<string, unknown> }) => {
      const data = { ...args.data };
      const row: Row = {
        id: (data.id as string) ?? nextId(model),
        createdAt: data.createdAt ?? nowFn(),
        updatedAt: data.updatedAt ?? nowFn(),
        ...data,
      };
      if (model === 'serviceCase') {
        row.openedAt = data.openedAt ?? nowFn();
        row.status = data.status ?? (data.scheduledAt ? 'SCHEDULED' : 'OPEN');
        row.priority = data.priority ?? 'NORMAL';
        row.source = data.source ?? 'MANUAL';
        row.blocksRental = data.blocksRental ?? false;
        row.tasks = [];
        row.comments = [];
        row.attachments = [];
      }
      tableFor(model).push(row);
      return clone(row);
    },
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const rows = tableFor(model);
      const idx = rows.findIndex((r) => r.id === args.where.id);
      if (idx < 0) throw new Error(`${model} update not found`);
      rows[idx] = { ...rows[idx], ...args.data, updatedAt: nowFn() };
      return clone(rows[idx]);
    },
  });

  const prisma = {
    ...base.prisma,
    serviceCase: modelApi('serviceCase'),
    serviceCaseComment: modelApi('serviceCaseComment'),
    serviceCaseAttachment: modelApi('serviceCaseAttachment'),
    vehicleComplaint: modelApi('vehicleComplaint'),
    vendor: modelApi('vendor'),
  };

  const seedVendor = (input: { id?: string; organizationId: string; name: string }) => {
    const row: Row = {
      id: input.id ?? nextId('vendor'),
      organizationId: input.organizationId,
      name: input.name,
      category: 'WORKSHOP',
      sourceType: 'MANUAL',
      source: 'MANUAL',
      isActive: true,
      createdAt: nowFn(),
      updatedAt: nowFn(),
      vendorVehicles: [],
      _count: { invoices: 0 },
    };
    vendors.push(row);
    return row;
  };

  const seedObservation = (
    orgId: string,
    vehicleId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const row: Row = {
      id: nextId('obs'),
      organizationId: orgId,
      vehicleId,
      createdByUserId: ids.operatorA,
      createdByWorkerId: null,
      title: 'Finding',
      description: 'Test finding',
      urgency: 'MEDIUM',
      region: null,
      category: null,
      affectedArea: null,
      status: 'ACTIVE',
      source: 'MANUAL',
      impact: null,
      blocksRental: false,
      bookingId: null,
      customerId: null,
      driverId: null,
      handoverProtocolId: null,
      stationId: null,
      locationContext: null,
      resolvedAt: null,
      resolvedByUserId: null,
      dismissedAt: null,
      dismissedByUserId: null,
      convertedToTaskId: null,
      linkedDamageId: null,
      linkedServiceEventId: null,
      linkedServiceTaskId: null,
      linkedServiceCaseId: null,
      notes: null,
      createdAt: nowFn(),
      updatedAt: nowFn(),
      ...overrides,
    };
    vehicleComplaints.push(row);
    return row;
  };

  return {
    ids,
    prisma,
    nowFn,
    base,
    tables: {
      ...base.tables,
      serviceCases,
      serviceCaseComments,
      serviceCaseAttachments,
      vehicleComplaints,
      vendors,
    },
    seedVendor,
    seedObservation,
  };
}

export type FleetHealthServiceTestStore = ReturnType<typeof createFleetHealthServiceTestStore>;
