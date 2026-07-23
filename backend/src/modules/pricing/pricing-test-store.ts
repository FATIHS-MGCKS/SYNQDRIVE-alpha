/**
 * In-memory Prisma stand-in for pricing publish / resolution tests.
 * Deterministic — no external services.
 */
import type { DepositResolverService } from '@modules/deposit/deposit-resolver.service';
import type { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import type { ResolvedTariffContext } from './pricing-context.types';
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
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ARCHIVED';
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
  sortOrder?: number;
  updatedAt?: Date;
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
  revision: number;
  isCurrent: boolean;
  pricingQuoteId: string | null;
  priceBookId: string | null;
  tariffGroupId: string | null;
  tariffVersionId: string | null;
  currency: string;
  depositAmountCents: number;
  subtotalNetCents?: number;
  taxAmountCents?: number;
  totalGrossCents?: number;
  totalDueNowCents?: number;
  rentalDays?: number;
  taxRatePercent?: number;
  includedKm?: number;
  extraKmPriceCents?: number;
  calculatedAt?: Date;
  engineVersion?: string;
  metadataJson?: Record<string, unknown> | null;
  lineItems: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type MileagePackageRow = {
  id: string;
  organizationId: string;
  tariffVersionId: string;
  label: string;
  includedKm: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
};

type InsuranceOptionRow = {
  id: string;
  organizationId: string;
  tariffVersionId: string;
  label: string;
  description: string | null;
  priceCents: number;
  pricingType: 'PER_DAY' | 'PER_BOOKING';
  deductibleCents: number | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

type ExtraOptionRow = {
  id: string;
  organizationId: string;
  tariffVersionId: string;
  label: string;
  description: string | null;
  priceCents: number;
  pricingType: 'PER_DAY' | 'PER_BOOKING';
  isActive: boolean;
  sortOrder: number;
};

type BookingLineItemRow = {
  id: string;
  organizationId: string;
  bookingPriceSnapshotId: string;
  metadataJson: Record<string, unknown> | null;
};

type QuoteRow = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  tariffVersionId: string;
  currency: string;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  calculatedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByBookingId: string | null;
  pricingContextJson: unknown;
  pricingInputJson: unknown;
  lineItemsJson: unknown;
  totalsJson: unknown;
  integrityHash: string;
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
      sortOrder: 0,
      updatedAt: now,
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
  const quotes: QuoteRow[] = [];
  const mileagePackages: MileagePackageRow[] = [];
  const insuranceOptions: InsuranceOptionRow[] = [];
  const extraOptions: ExtraOptionRow[] = [];
  const bookingLineItems: BookingLineItemRow[] = [];
  const bookings: Array<{
    id: string;
    organizationId: string;
    customerId: string;
    vehicleId: string;
    startDate: Date;
    endDate: Date;
    status: string;
    totalPriceCents: number;
    currency: string;
  }> = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;
  const hooks = {
    simulatePublishConflict: false,
    simulateArchiveFailure: false,
  };

  let txQueue: Promise<unknown> = Promise.resolve();

  const includeVersion = (version: VersionRow) => {
    const rate = rates.find((r) => r.tariffVersionId === version.id) ?? null;
    const priceBook = priceBooks.find((b) => b.id === version.priceBookId)!;
    const tariffGroup = groups.find((g) => g.id === version.tariffGroupId)!;
    const versionMileage = mileagePackages
      .filter((p) => p.tariffVersionId === version.id && p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const versionInsurance = insuranceOptions
      .filter((p) => p.tariffVersionId === version.id && p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const versionExtras = extraOptions
      .filter((p) => p.tariffVersionId === version.id && p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      ...version,
      rate,
      mileagePackages: versionMileage,
      insuranceOptions: versionInsurance,
      extraOptions: versionExtras,
      priceBook,
      tariffGroup,
    };
  };

  const matchVersionWhere = (row: VersionRow, where: Record<string, unknown>): boolean => {
    if (where.organizationId && row.organizationId !== where.organizationId) return false;
    if (where.tariffGroupId && row.tariffGroupId !== where.tariffGroupId) return false;
    if (where.status) {
      if (typeof where.status === 'string') {
        if (row.status !== where.status) return false;
      } else if (
        typeof where.status === 'object' &&
        where.status !== null &&
        'in' in where.status &&
        Array.isArray((where.status as { in: string[] }).in)
      ) {
        if (!(where.status as { in: string[] }).in.includes(row.status)) return false;
      }
    }
    if (where.priceBook && typeof where.priceBook === 'object' && where.priceBook !== null) {
      const book = priceBooks.find((b) => b.id === row.priceBookId);
      const isActive = (where.priceBook as { isActive?: boolean }).isActive;
      if (isActive !== undefined && book?.isActive !== isActive) return false;
    }
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
        if (clause.validTo && typeof clause.validTo === 'object' && clause.validTo !== null) {
          if ('gte' in clause.validTo && row.validTo) {
            return row.validTo >= (clause.validTo as { gte: Date }).gte;
          }
          if ('gt' in clause.validTo) {
            return row.validTo == null || row.validTo > (clause.validTo as { gt: Date }).gt;
          }
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
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        groups.filter(
          (g) =>
            g.organizationId === where.organizationId &&
            (where.priceBookId === undefined || g.priceBookId === where.priceBookId),
        ).length,
      ),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        groups.find(
          (g) =>
            g.organizationId === where.organizationId &&
            (where.id === undefined || g.id === where.id) &&
            (where.category === undefined || g.category === where.category) &&
            (where.priceBookId === undefined || g.priceBookId === where.priceBookId),
        ) ?? null,
      ),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          include,
        }: {
          where: Record<string, unknown>;
          orderBy?: { sortOrder?: 'asc' };
          include?: { versions?: { orderBy?: { versionNumber: 'desc' }; include?: unknown } };
        }) => {
          let matched = groups.filter(
            (g) =>
              g.organizationId === where.organizationId &&
              (where.priceBookId === undefined || g.priceBookId === where.priceBookId) &&
              (where.isActive === undefined || g.isActive === where.isActive),
          );
          if (orderBy?.sortOrder === 'asc') {
            matched = [...matched].sort((a, b) => (a as { sortOrder?: number }).sortOrder! - (b as { sortOrder?: number }).sortOrder!);
          }
          return matched.map((g) => {
            if (!include?.versions) return g;
            let groupVersions = versions.filter((v) => v.tariffGroupId === g.id);
            if (include.versions.orderBy?.versionNumber === 'desc') {
              groupVersions = [...groupVersions].sort((a, b) => b.versionNumber - a.versionNumber);
            }
            return {
              ...g,
              versions: groupVersions.map((v) => includeVersion(v)),
            };
          });
        },
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<GroupRow> }) => {
        const g = groups.find((row) => row.id === where.id);
        if (!g) throw new Error('group not found');
        Object.assign(g, data);
        return g;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = groups.findIndex((row) => row.id === where.id);
        if (idx < 0) throw new Error('group not found');
        const [removed] = groups.splice(idx, 1);
        return removed;
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
      findMany: jest.fn(
        async ({
          where,
          include,
        }: {
          where: Record<string, unknown>;
          include?: unknown;
        }) => {
          const matched = versions.filter((v) => matchVersionWhere(v, where));
          if (include) {
            return matched.map((v) => includeVersion(v));
          }
          return matched;
        },
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
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const idx = versions.findIndex((v) => v.id === where.id);
        if (idx < 0) throw new Error('version not found');
        const [removed] = versions.splice(idx, 1);
        return removed;
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
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const notIn = (where.id as { notIn?: string[] } | undefined)?.notIn ?? [];
        return vehicles.filter(
          (v) =>
            v.organizationId === where.organizationId &&
            (notIn.length === 0 || !notIn.includes(v.id)),
        );
      }),
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
                if (clause.validTo && typeof clause.validTo === 'object' && clause.validTo !== null) {
                  if ('gte' in clause.validTo && a.validTo) {
                    return a.validTo >= (clause.validTo as { gte: Date }).gte;
                  }
                  if ('gt' in clause.validTo) {
                    return a.validTo == null || a.validTo > (clause.validTo as { gt: Date }).gt;
                  }
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
      findMany: jest.fn(
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
                if (clause.validTo && typeof clause.validTo === 'object' && clause.validTo !== null) {
                  if ('gte' in clause.validTo && a.validTo) {
                    return a.validTo >= (clause.validTo as { gte: Date }).gte;
                  }
                  if ('gt' in clause.validTo) {
                    return a.validTo == null || a.validTo > (clause.validTo as { gt: Date }).gt;
                  }
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
          return matched;
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: AssignmentRow = {
          id: nextId('assignment'),
          organizationId: data.organizationId as string,
          vehicleId: data.vehicleId as string,
          tariffGroupId: data.tariffGroupId as string,
          priceBookId: data.priceBookId as string,
          validFrom: data.validFrom as Date,
          validTo: (data.validTo as Date | null) ?? null,
          isActive: (data.isActive as boolean) ?? true,
        };
        assignments.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<AssignmentRow>;
        }) => {
          const row = assignments.find((a) => a.id === where.id);
          if (!row) throw new Error('assignment not found');
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<AssignmentRow>;
        }) => {
          let count = 0;
          for (const row of assignments) {
            if (where.organizationId && row.organizationId !== where.organizationId) continue;
            if (where.tariffGroupId && row.tariffGroupId !== where.tariffGroupId) continue;
            if (where.isActive !== undefined && row.isActive !== where.isActive) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    booking: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          bookings.find(
            (row) =>
              row.id === where.id &&
              (!where.organizationId || row.organizationId === where.organizationId),
          ) ?? null
        );
      }),
      findFirstOrThrow: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = bookings.find(
          (b) =>
            b.id === where.id &&
            (!where.organizationId || b.organizationId === where.organizationId),
        );
        if (!row) throw new Error('booking not found');
        return row;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: (data.id as string) ?? nextId('booking'),
          organizationId: data.organizationId as string,
          customerId: data.customerId as string,
          vehicleId: data.vehicleId as string,
          startDate: data.startDate as Date,
          endDate: data.endDate as Date,
          status: (data.status as string) ?? 'PENDING',
          totalPriceCents: (data.totalPriceCents as number) ?? 0,
          currency: (data.currency as string) ?? 'EUR',
          updatedAt: new Date(),
        };
        bookings.push(row);
        return row;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const row of bookings) {
            if (where.id && row.id !== where.id) continue;
            if (where.organizationId && row.organizationId !== where.organizationId) continue;
            if (
              where.updatedAt &&
              (row as { updatedAt?: Date }).updatedAt !== where.updatedAt
            ) {
              continue;
            }
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    bookingDeposit: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    bookingPaymentRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    bookingPriceSnapshot: {
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
          select,
          include,
        }: {
          where: Record<string, unknown>;
          orderBy?: { revision?: 'asc' | 'desc' };
          select?: Record<string, boolean>;
          include?: unknown;
        }) => {
          let matches = snapshots.filter((row) => {
            if (where.bookingId && row.bookingId !== where.bookingId) return false;
            if (where.organizationId && row.organizationId !== where.organizationId) return false;
            if (where.isCurrent !== undefined && row.isCurrent !== where.isCurrent) return false;
            return true;
          });
          if (orderBy?.revision) {
            matches = [...matches].sort((a, b) =>
              orderBy.revision === 'desc' ? b.revision - a.revision : a.revision - b.revision,
            );
          } else if (where.isCurrent === undefined) {
            const current = matches.filter((row) => row.isCurrent);
            if (current.length > 0) matches = current;
          }
          const row = matches[0] ?? null;
          if (!row) return null;
          if (select) {
            const picked: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              if (select[key]) picked[key] = row[key];
            }
            return picked;
          }
          return include ? { ...row, lineItems: row.lineItems } : row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<SnapshotRow>;
        }) => {
          let count = 0;
          for (const row of snapshots) {
            if (where.organizationId && row.organizationId !== where.organizationId) continue;
            if (where.bookingId && row.bookingId !== where.bookingId) continue;
            if (where.isCurrent !== undefined && row.isCurrent !== where.isCurrent) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SnapshotRow>;
        }) => {
          const row = snapshots.find((s) => s.id === where.id);
          if (!row) throw new Error('snapshot not found');
          Object.assign(row, data);
          return row;
        },
      ),
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
          revision: (data.revision as number) ?? 1,
          isCurrent: (data.isCurrent as boolean) ?? true,
          pricingQuoteId: (data.pricingQuoteId as string | null) ?? null,
          priceBookId: (data.priceBookId as string) ?? null,
          tariffGroupId: (data.tariffGroupId as string) ?? null,
          tariffVersionId: (data.tariffVersionId as string) ?? null,
          currency: data.currency as string,
          depositAmountCents: data.depositAmountCents as number,
          subtotalNetCents: (data.subtotalNetCents as number) ?? 0,
          taxAmountCents: (data.taxAmountCents as number) ?? 0,
          totalGrossCents: (data.totalGrossCents as number) ?? 0,
          totalDueNowCents: (data.totalDueNowCents as number) ?? 0,
          rentalDays: (data.rentalDays as number) ?? 1,
          taxRatePercent: (data.taxRatePercent as number) ?? 19,
          includedKm: (data.includedKm as number) ?? 0,
          extraKmPriceCents: (data.extraKmPriceCents as number) ?? 0,
          calculatedAt: (data.calculatedAt as Date) ?? new Date(),
          engineVersion: (data.engineVersion as string) ?? 'pricing-engine-v1',
          metadataJson: (data.metadataJson as Record<string, unknown>) ?? null,
          pricingInputJson: (data.pricingInputJson as Record<string, unknown>) ?? null,
          lineItems: [],
          ...data,
        };
        if (data.lineItems && typeof data.lineItems === 'object' && 'create' in data.lineItems) {
          row.lineItems = (data.lineItems as { create: Array<Record<string, unknown>> }).create;
          for (const li of row.lineItems) {
            bookingLineItems.push({
              id: nextId('line-item'),
              organizationId: row.organizationId,
              bookingPriceSnapshotId: row.id,
              metadataJson: (li.metadataJson as Record<string, unknown>) ?? null,
            });
          }
        }
        snapshots.push(row);
        return include ? { ...row, lineItems: row.lineItems } : row;
      }),
    },
    mileagePackage: {
      findMany: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          mileagePackages.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.tariffVersionId === where.tariffVersionId,
          ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: MileagePackageRow = {
          id: nextId('mileage'),
          organizationId: data.organizationId as string,
          tariffVersionId: data.tariffVersionId as string,
          label: data.label as string,
          includedKm: data.includedKm as number,
          priceCents: data.priceCents as number,
          isActive: (data.isActive as boolean) ?? true,
          sortOrder: (data.sortOrder as number) ?? 0,
        };
        mileagePackages.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MileagePackageRow>;
        }) => {
          const row = mileagePackages.find((r) => r.id === where.id);
          if (!row) throw new Error('mileage package not found');
          Object.assign(row, data);
          return row;
        },
      ),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    tariffInsuranceOption: {
      findMany: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          insuranceOptions.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.tariffVersionId === where.tariffVersionId,
          ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: InsuranceOptionRow = {
          id: nextId('insurance'),
          organizationId: data.organizationId as string,
          tariffVersionId: data.tariffVersionId as string,
          label: data.label as string,
          description: (data.description as string | null) ?? null,
          priceCents: data.priceCents as number,
          pricingType: (data.pricingType as InsuranceOptionRow['pricingType']) ?? 'PER_DAY',
          deductibleCents: (data.deductibleCents as number | null) ?? null,
          isDefault: (data.isDefault as boolean) ?? false,
          isActive: (data.isActive as boolean) ?? true,
          sortOrder: (data.sortOrder as number) ?? 0,
        };
        insuranceOptions.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<InsuranceOptionRow>;
        }) => {
          const row = insuranceOptions.find((r) => r.id === where.id);
          if (!row) throw new Error('insurance option not found');
          Object.assign(row, data);
          return row;
        },
      ),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    tariffExtraOption: {
      findMany: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          extraOptions.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.tariffVersionId === where.tariffVersionId,
          ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: ExtraOptionRow = {
          id: nextId('extra'),
          organizationId: data.organizationId as string,
          tariffVersionId: data.tariffVersionId as string,
          label: data.label as string,
          description: (data.description as string | null) ?? null,
          priceCents: data.priceCents as number,
          pricingType: (data.pricingType as ExtraOptionRow['pricingType']) ?? 'PER_DAY',
          isActive: (data.isActive as boolean) ?? true,
          sortOrder: (data.sortOrder as number) ?? 0,
        };
        extraOptions.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ExtraOptionRow>;
        }) => {
          const row = extraOptions.find((r) => r.id === where.id);
          if (!row) throw new Error('extra option not found');
          Object.assign(row, data);
          return row;
        },
      ),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    bookingPriceLineItem: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        bookingLineItems.filter((row) => row.organizationId === where.organizationId),
      ),
    },
    pricingQuote: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: QuoteRow = {
          id: nextId('quote'),
          organizationId: data.organizationId as string,
          createdByUserId: (data.createdByUserId as string | null) ?? null,
          vehicleId: data.vehicleId as string,
          pickupAt: data.pickupAt as Date,
          returnAt: data.returnAt as Date,
          tariffVersionId: data.tariffVersionId as string,
          currency: data.currency as string,
          status: (data.status as QuoteRow['status']) ?? 'ACTIVE',
          calculatedAt: data.calculatedAt as Date,
          expiresAt: data.expiresAt as Date,
          consumedAt: (data.consumedAt as Date | null) ?? null,
          consumedByBookingId: (data.consumedByBookingId as string | null) ?? null,
          pricingContextJson: data.pricingContextJson,
          pricingInputJson: data.pricingInputJson,
          lineItemsJson: data.lineItemsJson,
          totalsJson: data.totalsJson,
          integrityHash: data.integrityHash as string,
        };
        quotes.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const match = (row: QuoteRow): boolean => {
          if (where.id && row.id !== where.id) return false;
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        };
        return quotes.find((row) => match(row)) ?? null;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<QuoteRow>;
        }) => {
          const row = quotes.find((q) => q.id === where.id);
          if (!row) throw new Error('quote not found');
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<QuoteRow>;
        }) => {
          let count = 0;
          for (const row of quotes) {
            if (where.id && row.id !== where.id) continue;
            if (where.organizationId && row.organizationId !== where.organizationId) continue;
            if (where.status && row.status !== where.status) continue;
            if (
              where.expiresAt &&
              typeof where.expiresAt === 'object' &&
              where.expiresAt !== null &&
              'lt' in where.expiresAt
            ) {
              if (row.expiresAt >= (where.expiresAt as { lt: Date }).lt) continue;
            }
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const versionIn = (where.tariffVersionId as { in?: string[] } | undefined)?.in;
        const before = quotes.length;
        const kept = quotes.filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return true;
          if (versionIn && versionIn.includes(row.tariffVersionId)) return false;
          if (where.tariffVersionId && row.tariffVersionId === where.tariffVersionId) return false;
          return true;
        });
        quotes.length = 0;
        quotes.push(...kept);
        return { count: before - quotes.length };
      }),
    },
    organization: {
      findFirst: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
    },
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const quoteId = values[0] as string;
      const orgId = values[1] as string;
      const row = quotes.find((q) => q.id === quoteId && q.organizationId === orgId);
      return row ? [row] : [];
    }),
    $transaction: jest.fn(
      async (
        fn: (tx: Record<string, unknown>) => Promise<unknown>,
        _options?: { isolationLevel?: unknown },
      ) => {
        const run = async () => {
          const snapshot = {
            versions: versions.map((v) => ({ ...v })),
            rates: rates.map((r) => ({ ...r })),
            quotes: quotes.map((q) => ({ ...q })),
            bookings: bookings.map((b) => ({ ...b })),
            snapshots: snapshots.map((s) => ({ ...s, lineItems: [...s.lineItems] })),
            bookingLineItems: bookingLineItems.map((li) => ({ ...li })),
          };
          try {
            return await fn(prisma);
          } catch (error) {
            versions.length = 0;
            versions.push(...snapshot.versions);
            rates.length = 0;
            rates.push(...snapshot.rates);

            const snapBookingIds = new Set(snapshot.bookings.map((b) => b.id));
            const newBookingIds = bookings
              .filter((b) => !snapBookingIds.has(b.id))
              .map((b) => b.id);
            for (let i = bookings.length - 1; i >= 0; i -= 1) {
              if (!snapBookingIds.has(bookings[i].id)) {
                bookings.splice(i, 1);
              }
            }

            for (let i = snapshots.length - 1; i >= 0; i -= 1) {
              if (newBookingIds.includes(snapshots[i].bookingId)) {
                snapshots.splice(i, 1);
              }
            }

            const snapLineItemIds = new Set(snapshot.bookingLineItems.map((li) => li.id));
            for (let i = bookingLineItems.length - 1; i >= 0; i -= 1) {
              if (!snapLineItemIds.has(bookingLineItems[i].id)) {
                bookingLineItems.splice(i, 1);
              }
            }

            for (const saved of snapshot.quotes) {
              const idx = quotes.findIndex((q) => q.id === saved.id);
              if (idx < 0) continue;
              const current = quotes[idx];
              if (saved.status === 'ACTIVE' && current.status === 'CONSUMED') {
                const consumedInThisTx =
                  current.consumedByBookingId &&
                  newBookingIds.includes(current.consumedByBookingId);
                if (consumedInThisTx) {
                  Object.assign(quotes[idx], saved);
                }
                continue;
              }
              Object.assign(quotes[idx], saved);
            }
            throw error;
          }
        };
        const chained = txQueue.then(run, run);
        txQueue = chained.catch(() => undefined);
        return chained;
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
    assignments,
    snapshots,
    quotes,
    bookings,
    mileagePackages,
    insuranceOptions,
    extraOptions,
    bookingLineItems,
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

/** Test stub: resolves deposit from tariff only (no rental rules in pricing test store). */
export function createTariffPassthroughDepositResolver(): DepositResolverService {
  return {
    resolveForVehicleTariff: jest.fn(
      async (input: {
        tariffContext: ResolvedTariffContext;
      }) => {
        const tv = input.tariffContext.tariffVersion;
        const amount = Math.max(0, tv.rate.depositAmountCents);
        return {
          amount,
          currency: input.tariffContext.priceBook.currency,
          source: 'TARIFF_RATE',
          ruleRevisionId: tv.rate.id,
          reason: 'From active tariff rate.',
          manualOverride: false,
          calculatedAt: new Date().toISOString(),
          components: {
            rentalRulesFloorCents: null,
            tariffDepositCents: amount,
            effectiveMinimumCents: 0,
            raisedToMinimum: false,
          },
        };
      },
    ),
    resolveDepositEntityIds: jest.fn().mockResolvedValue({
      organizationRulesId: null,
      categoryId: null,
      vehicleOverrideId: null,
    }),
  } as unknown as DepositResolverService;
}

/** Test stub: no-op booking deposit snapshot side effects. */
export function createBookingDepositSnapshotStub(): BookingDepositSnapshotService {
  return {
    buildFrozenDeposit: jest.fn((resolved) =>
      resolved
        ? {
            amountCents: resolved.amount,
            currency: resolved.currency,
            source: resolved.source,
            ruleRevisionId: resolved.ruleRevisionId,
            reason: resolved.reason,
            manualOverride: resolved.manualOverride,
            calculatedAt: resolved.calculatedAt,
            frozenAt: null,
          }
        : null,
    ),
    extractFrozenDepositFromPricingInput: jest.fn(() => null),
    syncBookingDepositFromSnapshot: jest.fn().mockResolvedValue(undefined),
    freezeDepositOnSnapshot: jest.fn().mockResolvedValue(null),
  } as unknown as BookingDepositSnapshotService;
}
