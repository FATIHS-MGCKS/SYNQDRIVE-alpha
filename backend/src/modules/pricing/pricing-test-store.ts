/**
 * In-memory Prisma stand-in for pricing publish / resolution tests.
 * Deterministic — no external services.
 */
import { grossToNetCents } from './pricing-calculation.util';

const TAX_PERCENT = 19;
const DAILY_GROSS_CENTS = 5900; // Sedan €59.00/day (migration default)
export const SEDAN_DAILY_NET_CENTS = grossToNetCents(DAILY_GROSS_CENTS, TAX_PERCENT);
export const SEDAN_DEPOSIT_ACTIVE_CENTS = DAILY_GROSS_CENTS * 3; // 17700 — migration formula
export const SEDAN_DEPOSIT_DRAFT_CENTS = 50000; // €500.00

export interface PricingTestIds {
  orgId: string;
  priceBookId: string;
  groupId: string;
  activeVersionId: string;
  vehicleId: string;
  assignmentId: string;
}

export function createSedanPricingFixtures(): PricingTestIds {
  return {
    orgId: 'org-sedan-test',
    priceBookId: 'book-eur-1',
    groupId: 'group-sedan',
    activeVersionId: 'version-active-v1',
    vehicleId: 'vehicle-sedan-1',
    assignmentId: 'assignment-sedan-1',
  };
}

type VersionRow = {
  id: string;
  organizationId: string;
  priceBookId: string;
  tariffGroupId: string;
  versionNumber: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type RateRow = {
  id: string;
  organizationId: string;
  tariffVersionId: string;
  dailyRateCents: number;
  weeklyRateCents: number;
  monthlyRateCents: number;
  includedKmPerDay: number;
  extraKmPriceCents: number;
  depositAmountCents: number;
  minimumRentalDays: number | null;
};

type GroupRow = {
  id: string;
  organizationId: string;
  priceBookId: string;
  name: string;
  category: string;
  isActive: boolean;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tariffGroupId: string;
  priceBookId: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
};

type SnapshotRow = {
  id: string;
  organizationId: string;
  bookingId: string;
  priceBookId: string | null;
  tariffGroupId: string | null;
  tariffVersionId: string | null;
  currency: string;
  depositAmountCents: number;
  lineItems: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export function createPricingTestStore(
  ids: PricingTestIds,
  options?: { currency?: string },
) {
  const now = new Date('2026-07-15T10:00:00.000Z');
  const pickupAt = new Date('2026-08-01T10:00:00.000Z');
  const bookCurrency = options?.currency ?? 'EUR';

  const priceBooks = [
    {
      id: ids.priceBookId,
      organizationId: ids.orgId,
      name: 'Standard Preisbuch',
      currency: bookCurrency,
      taxRatePercent: TAX_PERCENT,
      isActive: true,
      createdAt: now,
    },
  ];

  const groups: GroupRow[] = [
    {
      id: ids.groupId,
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      name: 'Sedan',
      category: 'Sedan',
      isActive: true,
    },
  ];

  const versions: VersionRow[] = [
    {
      id: ids.activeVersionId,
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      tariffGroupId: ids.groupId,
      versionNumber: 1,
      status: 'ACTIVE',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const rates: RateRow[] = [
    {
      id: 'rate-active-v1',
      organizationId: ids.orgId,
      tariffVersionId: ids.activeVersionId,
      dailyRateCents: SEDAN_DAILY_NET_CENTS,
      weeklyRateCents: grossToNetCents(Math.round(DAILY_GROSS_CENTS * 5.5), TAX_PERCENT),
      monthlyRateCents: grossToNetCents(DAILY_GROSS_CENTS * 20, TAX_PERCENT),
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: SEDAN_DEPOSIT_ACTIVE_CENTS,
      minimumRentalDays: null,
    },
  ];

  const assignments: AssignmentRow[] = [
    {
      id: ids.assignmentId,
      organizationId: ids.orgId,
      vehicleId: ids.vehicleId,
      tariffGroupId: ids.groupId,
      priceBookId: ids.priceBookId,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
      isActive: true,
    },
  ];

  const vehicles = [
    {
      id: ids.vehicleId,
      organizationId: ids.orgId,
      make: 'VW',
      model: 'Passat',
    },
  ];

  const snapshots: SnapshotRow[] = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;
  const hooks = {
    simulatePublishConflict: false,
    simulateArchiveFailure: false,
  };

  const includeVersion = (version: VersionRow) => {
    const rate = rates.find((r) => r.tariffVersionId === version.id) ?? null;
    const priceBook = priceBooks.find((b) => b.id === version.priceBookId)!;
    const tariffGroup = groups.find((g) => g.id === version.tariffGroupId)!;
    return {
      ...version,
      rate,
      mileagePackages: [],
      insuranceOptions: [],
      extraOptions: [],
      priceBook,
      tariffGroup,
    };
  };

  const matchVersionWhere = (row: VersionRow, where: Record<string, unknown>): boolean => {
    if (where.organizationId && row.organizationId !== where.organizationId) return false;
    if (where.tariffGroupId && row.tariffGroupId !== where.tariffGroupId) return false;
    if (where.status && row.status !== where.status) return false;
    if (where.id) {
      if (typeof where.id === 'string') {
        if (row.id !== where.id) return false;
      } else if (typeof where.id === 'object' && where.id !== null && 'not' in where.id) {
        if (row.id === (where.id as { not: string }).not) return false;
      }
    }
    if (where.validFrom && typeof where.validFrom === 'object' && where.validFrom !== null) {
      const lte = (where.validFrom as { lte?: Date }).lte;
      if (lte && row.validFrom > lte) return false;
    }
    if (where.OR && Array.isArray(where.OR)) {
      const ok = (where.OR as Array<Record<string, unknown>>).some((clause) => {
        if ('validTo' in clause && clause.validTo === null) return row.validTo === null;
        if (
          clause.validTo &&
          typeof clause.validTo === 'object' &&
          'gte' in clause.validTo &&
          row.validTo
        ) {
          return row.validTo >= (clause.validTo as { gte: Date }).gte;
        }
        return false;
      });
      if (!ok) return false;
    }
    return true;
  };

  const prisma: Record<string, unknown> = {
    priceBook: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        priceBooks.find(
          (b) =>
            b.organizationId === where.organizationId &&
            (where.isActive === undefined || b.isActive === where.isActive),
        ) ?? null,
      ),
    },
    priceTariffGroup: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        groups.find(
          (g) => g.id === where.id && g.organizationId === where.organizationId,
        ) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<GroupRow> }) => {
        const g = groups.find((row) => row.id === where.id);
        if (!g) throw new Error('group not found');
        Object.assign(g, data);
        return g;
      }),
    },
    priceTariffVersion: {
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Record<string, unknown>;
          orderBy?: { versionNumber?: 'desc' | 'asc'; validFrom?: 'desc' };
        }) => {
          const matched = versions.filter((v) => matchVersionWhere(v, where));
          if (orderBy?.versionNumber === 'desc') {
            matched.sort((a, b) => b.versionNumber - a.versionNumber);
          }
          if (orderBy?.validFrom === 'desc') {
            matched.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
          }
          const row = matched[0];
          if (!row) return null;
          if (where.status === 'ACTIVE' || where.tariffGroupId) {
            return includeVersion(row);
          }
          const rate = rates.find((r) => r.tariffVersionId === row.id);
          return { ...row, rate: rate ?? null };
        },
      ),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        versions.filter((v) => matchVersionWhere(v, where)),
      ),
      aggregate: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const matched = versions.filter((v) => matchVersionWhere(v, where));
        const max = matched.reduce((m, v) => Math.max(m, v.versionNumber), 0);
        return { _max: { versionNumber: max || null } };
      }),
      create: jest.fn(async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
        const id = nextId('version');
        const row: VersionRow = {
          id,
          organizationId: data.organizationId as string,
          priceBookId: data.priceBookId as string,
          tariffGroupId: data.tariffGroupId as string,
          versionNumber: data.versionNumber as number,
          status: (data.status as VersionRow['status']) ?? 'DRAFT',
          validFrom: data.validFrom as Date,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        };
        versions.push(row);
        const rateCreate = (data.rate as { create?: Record<string, unknown> })?.create;
        if (rateCreate) {
          rates.push({
            id: nextId('rate'),
            organizationId: rateCreate.organizationId as string,
            tariffVersionId: id,
            dailyRateCents: rateCreate.dailyRateCents as number,
            weeklyRateCents: (rateCreate.weeklyRateCents as number) ?? 0,
            monthlyRateCents: (rateCreate.monthlyRateCents as number) ?? 0,
            includedKmPerDay: (rateCreate.includedKmPerDay as number) ?? 200,
            extraKmPriceCents: (rateCreate.extraKmPriceCents as number) ?? 0,
            depositAmountCents: (rateCreate.depositAmountCents as number) ?? 0,
            minimumRentalDays: (rateCreate.minimumRentalDays as number | null) ?? null,
          });
        }
        if (include) return includeVersion(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<VersionRow>;
        }) => {
          if (hooks.simulateArchiveFailure && data.status === 'ARCHIVED') {
            throw new Error('simulated archive failure');
          }
          const row = versions.find((v) => v.id === where.id);
          if (!row) throw new Error('version not found');
          Object.assign(row, data, { updatedAt: now });
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<VersionRow>;
        }) => {
          if (hooks.simulatePublishConflict) {
            return { count: 0 };
          }
          let count = 0;
          for (const row of versions) {
            if (!matchVersionWhere(row, where)) continue;
            Object.assign(row, data, { updatedAt: now });
            count += 1;
          }
          return { count };
        },
      ),
      findUniqueOrThrow: jest.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
        const row = versions.find((v) => v.id === where.id);
        if (!row) throw new Error('version not found');
        return include ? includeVersion(row) : row;
      }),
    },
    tariffRate: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { tariffVersionId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = rates.find((r) => r.tariffVersionId === where.tariffVersionId);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row: RateRow = {
            id: nextId('rate'),
            organizationId: create.organizationId as string,
            tariffVersionId: where.tariffVersionId,
            dailyRateCents: create.dailyRateCents as number,
            weeklyRateCents: (create.weeklyRateCents as number) ?? 0,
            monthlyRateCents: (create.monthlyRateCents as number) ?? 0,
            includedKmPerDay: (create.includedKmPerDay as number) ?? 200,
            extraKmPriceCents: (create.extraKmPriceCents as number) ?? 0,
            depositAmountCents: (create.depositAmountCents as number) ?? 0,
            minimumRentalDays: (create.minimumRentalDays as number | null) ?? null,
          };
          rates.push(row);
          return row;
        },
      ),
    },
    vehicle: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        vehicles.find(
          (v) => v.id === where.id && v.organizationId === where.organizationId,
        ) ?? null,
      ),
    },
    vehicleTariffAssignment: {
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Record<string, unknown>;
          orderBy?: { validFrom: 'desc' };
        }) => {
          const matched = assignments.filter((a) => {
            if (where.organizationId && a.organizationId !== where.organizationId) return false;
            if (where.vehicleId && a.vehicleId !== where.vehicleId) return false;
            if (where.isActive !== undefined && a.isActive !== where.isActive) return false;
            if (where.validFrom && typeof where.validFrom === 'object' && 'lte' in where.validFrom) {
              if (a.validFrom > (where.validFrom as { lte: Date }).lte) return false;
            }
            if (where.OR && Array.isArray(where.OR)) {
              const ok = (where.OR as Array<Record<string, unknown>>).some((clause) => {
                if ('validTo' in clause && clause.validTo === null) return a.validTo === null;
                if (
                  clause.validTo &&
                  typeof clause.validTo === 'object' &&
                  'gte' in clause.validTo &&
                  a.validTo
                ) {
                  return a.validTo >= (clause.validTo as { gte: Date }).gte;
                }
                return false;
              });
              if (!ok) return false;
            }
            return true;
          });
          if (orderBy?.validFrom === 'desc') {
            matched.sort((x, y) => y.validFrom.getTime() - x.validFrom.getTime());
          }
          return matched[0] ?? null;
        },
      ),
    },
    bookingPriceSnapshot: {
      deleteMany: jest.fn(async ({ where }: { where: { bookingId: string } }) => {
        const before = snapshots.length;
        const kept = snapshots.filter((s) => s.bookingId !== where.bookingId);
        snapshots.length = 0;
        snapshots.push(...kept);
        return { count: before - snapshots.length };
      }),
      create: jest.fn(async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
        const row: SnapshotRow = {
          id: nextId('snapshot'),
          organizationId: data.organizationId as string,
          bookingId: data.bookingId as string,
          priceBookId: (data.priceBookId as string) ?? null,
          tariffGroupId: (data.tariffGroupId as string) ?? null,
          tariffVersionId: (data.tariffVersionId as string) ?? null,
          currency: data.currency as string,
          depositAmountCents: data.depositAmountCents as number,
          lineItems: [],
          ...data,
        };
        if (data.lineItems && typeof data.lineItems === 'object' && 'create' in data.lineItems) {
          row.lineItems = (data.lineItems as { create: Array<Record<string, unknown>> }).create;
        }
        snapshots.push(row);
        return include ? { ...row, lineItems: row.lineItems } : row;
      }),
    },
    mileagePackage: { deleteMany: jest.fn(), createMany: jest.fn() },
    tariffInsuranceOption: { deleteMany: jest.fn(), createMany: jest.fn() },
    tariffExtraOption: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(
      async (
        fn: (tx: Record<string, unknown>) => Promise<unknown>,
        _options?: { isolationLevel?: unknown },
      ) => {
        const snapshot = {
          versions: versions.map((v) => ({ ...v })),
          rates: rates.map((r) => ({ ...r })),
        };
        try {
          return await fn(prisma);
        } catch (error) {
          versions.length = 0;
          versions.push(...snapshot.versions);
          rates.length = 0;
          rates.push(...snapshot.rates);
          throw error;
        }
      },
    ),
  };

  const baseRatePayload = {
    dailyRateCents: SEDAN_DAILY_NET_CENTS,
    weeklyRateCents: grossToNetCents(Math.round(DAILY_GROSS_CENTS * 5.5), TAX_PERCENT),
    monthlyRateCents: grossToNetCents(DAILY_GROSS_CENTS * 20, TAX_PERCENT),
    includedKmPerDay: 200,
    extraKmPriceCents: 22,
  };

  return {
    prisma,
    ids,
    pickupAt,
    returnAt: new Date('2026-08-04T10:00:00.000Z'),
    versions,
    rates,
    groups,
    snapshots,
    baseRatePayload,
    setGroupInactive: () => {
      const g = groups.find((row) => row.id === ids.groupId);
      if (g) g.isActive = false;
    },
    hooks,
    countActiveVersions: (groupId: string) =>
      versions.filter((v) => v.tariffGroupId === groupId && v.status === 'ACTIVE').length,
  };
}
