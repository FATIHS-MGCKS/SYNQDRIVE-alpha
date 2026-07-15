/**
 * In-memory Prisma stand-in for booking-task pipeline integration tests.
 * Relational state + transactions — no external DB (project convention).
 */
import {
  BOOKING_TASK_FIXED_NOW,
  createBookingTaskPipelineFixtures,
  type BookingTaskPipelineFixtureIds,
} from './__fixtures__/booking-task-pipeline.fixtures';

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
    if ('startsWith' in obj) {
      return typeof field === 'string' && field.startsWith(obj.startsWith as string);
    }
    if ('endsWith' in obj) {
      return typeof field === 'string' && field.endsWith(obj.endsWith as string);
    }
    if ('contains' in obj) {
      return typeof field === 'string' && field.includes(obj.contains as string);
    }
    if ('gte' in obj) return (field as Date) >= (obj.gte as Date);
    if ('lte' in obj) return (field as Date) <= (obj.lte as Date);
    if ('lt' in obj) return (field as Date) < (obj.lt as Date);
    if ('gt' in obj) return (field as Date) > (obj.gt as Date);
    if ('not' in obj) {
      if (typeof obj.not === 'object' && obj.not !== null) {
        return !matchesScalar(field, obj.not);
      }
      return field !== obj.not;
    }
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

export interface BookingTaskTestStoreOptions {
  now?: () => Date;
  ids?: BookingTaskPipelineFixtureIds;
}

export function createBookingTaskTestStore(options?: BookingTaskTestStoreOptions) {
  const ids = options?.ids ?? createBookingTaskPipelineFixtures();
  const nowFn = options?.now ?? (() => BOOKING_TASK_FIXED_NOW);
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  // Serialize orgTask reads/writes so parallel upsertByDedup cannot duplicate rows.
  let orgTaskLock: Promise<unknown> = Promise.resolve();
  const withOrgTaskLock = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = orgTaskLock.then(fn, fn);
    orgTaskLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const organizations: Row[] = [
    { id: ids.orgA, companyName: 'Fleet A', timezone: 'Europe/Berlin' },
    { id: ids.orgB, companyName: 'Fleet B', timezone: 'America/New_York' },
  ];

  const users: Row[] = [
    {
      id: 'operator-1',
      name: 'Operator One',
      firstName: 'Operator',
      lastName: 'One',
      email: 'operator@test.com',
    },
  ];

  const organizationMemberships: Row[] = [
    {
      id: 'membership-operator-1',
      userId: 'operator-1',
      organizationId: ids.orgA,
      status: 'ACTIVE',
      role: 'ADMIN',
      permissions: [],
    },
  ];

  const orgTasks: Row[] = [];
  const taskEvents: Row[] = [];
  const taskChecklistItems: Row[] = [];
  const taskComments: Row[] = [];
  const taskAttachments: Row[] = [];

  const tableFor = (model: string): Row[] => {
    switch (model) {
      case 'organization':
        return organizations;
      case 'orgTask':
        return orgTasks;
      case 'taskEvent':
        return taskEvents;
      case 'taskChecklistItem':
        return taskChecklistItems;
      case 'taskComment':
        return taskComments;
      case 'taskAttachment':
        return taskAttachments;
      case 'user':
        return users;
      case 'organizationMembership':
        return organizationMemberships;
      default:
        throw new Error(`Unknown model ${model}`);
    }
  };

  const applyInclude = (row: Row, model: string, include?: Record<string, unknown>): Row => {
    if (!include) return clone(row);
    const out = clone(row);
    if (model === 'orgTask') {
      if (include.checklistItems) {
        let items = taskChecklistItems.filter((i) => i.taskId === row.id);
        const orderBy = (include.checklistItems as { orderBy?: Record<string, string> })?.orderBy;
        if (orderBy?.sortOrder) {
          items = sortRows(items, { sortOrder: orderBy.sortOrder as 'asc' | 'desc' });
        }
        out.checklistItems = items;
      }
      if (include.comments) {
        out.comments = sortRows(
          taskComments.filter((c) => c.taskId === row.id),
          (include.comments as { orderBy?: Record<string, string> })?.orderBy
            ? { createdAt: ((include.comments as { orderBy: Record<string, string> }).orderBy.createdAt as 'asc' | 'desc') }
            : undefined,
        );
      }
      if (include.attachments) {
        out.attachments = taskAttachments.filter((a) => a.taskId === row.id);
      }
      if (include.events) {
        let events = taskEvents.filter((e) => e.taskId === row.id);
        const orderBy = (include.events as { orderBy?: Record<string, string> })?.orderBy;
        if (orderBy?.createdAt) {
          events = sortRows(events, { createdAt: orderBy.createdAt as 'asc' | 'desc' });
        }
        out.events = events;
      }
    }
    return out;
  };

  const runLocked = <T>(model: string, fn: () => Promise<T> | T): Promise<T> =>
    model === 'orgTask' ? withOrgTaskLock(fn) : Promise.resolve(fn());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelApi = (model: string): any => ({
    findFirst: (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
      select?: Record<string, boolean>;
    } = {}) =>
      runLocked(model, async () => {
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
      }),
    findUnique: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
    }) =>
      runLocked(model, async () => {
        const id = args.where.id as string | undefined;
        const row = id ? tableFor(model).find((r) => r.id === id) : undefined;
        if (!row) return null;
        if (args.select) {
          const picked: Row = {};
          for (const key of Object.keys(args.select)) {
            if (args.select[key]) picked[key] = row[key];
          }
          return picked;
        }
        return applyInclude(row, model, args.include);
      }),
    findMany: (args: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
      select?: Record<string, boolean>;
    } = {}) =>
      runLocked(model, async () => {
        let rows = sortRows(
          tableFor(model).filter((r) => matchesWhere(r, args.where)),
          args.orderBy,
        );
        if (args.select) {
          return rows.map((row) => {
            const picked: Row = {};
            for (const key of Object.keys(args.select!)) {
              if (args.select![key]) picked[key] = row[key];
            }
            return picked;
          });
        }
        return rows.map((r) => applyInclude(r, model, args.include));
      }),
    count: (args: { where?: Record<string, unknown> } = {}) =>
      runLocked(model, async () => tableFor(model).filter((r) => matchesWhere(r, args.where)).length),
    create: (args: { data: Record<string, unknown> }) =>
      runLocked(model, async () => {
        const data = { ...args.data };
        const row: Row = {
          id: (data.id as string) ?? nextId(model),
          createdAt: data.createdAt ?? nowFn(),
          updatedAt: data.updatedAt ?? nowFn(),
          blocksVehicleAvailability: false,
          completionMode: null,
          resolutionCode: null,
          resolutionNote: null,
          completedAt: null,
          completedByUserId: null,
          supersededByTaskId: null,
          ...data,
        };

        if (model === 'orgTask') {
          if (!row.status) row.status = 'OPEN';
          const dedupKey = row.dedupKey as string | undefined;
          const organizationId = row.organizationId as string | undefined;
          if (dedupKey && organizationId) {
            const existingActive = orgTasks.find(
              (t) =>
                t.organizationId === organizationId &&
                t.dedupKey === dedupKey &&
                t.status !== 'DONE' &&
                t.status !== 'CANCELLED',
            );
            if (existingActive) {
              Object.assign(existingActive, {
                ...row,
                id: existingActive.id,
                createdAt: existingActive.createdAt,
                updatedAt: nowFn(),
              });
              return clone(existingActive);
            }
          }
          const checklistCreates =
            (args.data.checklistItems as { create?: Row[] } | undefined)?.create ?? [];
          delete row.checklistItems;
          tableFor(model).push(row);
          for (const item of checklistCreates) {
            taskChecklistItems.push({
              id: nextId('check'),
              taskId: row.id,
              isDone: false,
              completedAt: null,
              completedByUserId: null,
              isRequired: false,
              sortOrder: 0,
              ...item,
            });
          }
          return clone(row);
        }

        if (model === 'taskChecklistItem') {
          if (!row.isRequired) row.isRequired = false;
          if (row.isDone === undefined) row.isDone = false;
          tableFor(model).push(row);
          return clone(row);
        }

        if (model === 'taskEvent') {
          tableFor(model).push(row);
          return clone(row);
        }

        delete row.attachments;
        delete row.events;
        tableFor(model).push(row);
        return clone(row);
      }),
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      runLocked(model, async () => {
        const rows = tableFor(model);
        const idx = rows.findIndex((r) => r.id === args.where.id);
        if (idx < 0) throw new Error(`${model} update not found`);
        rows[idx] = { ...rows[idx], ...args.data, updatedAt: nowFn() };
        return clone(rows[idx]);
      }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    organization: modelApi('organization'),
    orgTask: modelApi('orgTask'),
    taskEvent: modelApi('taskEvent'),
    taskChecklistItem: modelApi('taskChecklistItem'),
    taskComment: modelApi('taskComment'),
    taskAttachment: modelApi('taskAttachment'),
    user: modelApi('user'),
    organizationMembership: modelApi('organizationMembership'),
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
    nowFn,
    tables: { organizations, orgTasks, taskEvents, taskChecklistItems },
    seedLegacyCleanTask: (bookingId: string, vehicleId: string) => {
      const row: Row = {
        id: nextId('task'),
        organizationId: ids.orgA,
        bookingId,
        vehicleId,
        dedupKey: `booking:clean:${bookingId}`,
        type: 'VEHICLE_CLEANING',
        source: 'BOOKING',
        sourceType: 'BOOKING',
        status: 'OPEN',
        title: 'Legacy clean',
        priority: 'NORMAL',
        createdAt: nowFn(),
        updatedAt: nowFn(),
      };
      orgTasks.push(row);
      return row;
    },
    activeTasksForBooking: (orgId: string, bookingId: string) =>
      orgTasks.filter(
        (t) =>
          t.organizationId === orgId &&
          t.bookingId === bookingId &&
          ['OPEN', 'IN_PROGRESS', 'WAITING', 'PLANNED'].includes(String(t.status)),
      ),
    tasksByDedupKey: (orgId: string, dedupKey: string) =>
      orgTasks.filter((t) => t.organizationId === orgId && t.dedupKey === dedupKey),
    eventsForTask: (taskId: string) => taskEvents.filter((e) => e.taskId === taskId),
  };
}

export type BookingTaskTestStore = ReturnType<typeof createBookingTaskTestStore>;
