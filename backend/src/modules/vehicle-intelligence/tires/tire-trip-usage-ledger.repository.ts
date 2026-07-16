import { Prisma, type TireTripUsageLedger } from '@prisma/client';
import {
  computeTripUsageSourceFingerprint,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  type TireTripUsageLedgerUpsertAction,
  type TripUsageLedgerEntryInput,
} from './tire-trip-usage-ledger';

export interface TireTripUsageTenantContext {
  organizationId: string;
  vehicleId: string;
  vehicleOrganizationId: string;
  tireSetupId: string;
  setupVehicleId: string;
  setupOrganizationId: string | null;
  tripId: string;
  tripVehicleId: string;
}

export interface TireTripUsageLedgerUpsertResult {
  action: TireTripUsageLedgerUpsertAction;
  entry: TireTripUsageLedger;
  sourceFingerprint: string;
}

export class TireTripUsageLedgerTenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TireTripUsageLedgerTenantMismatchError';
  }
}

/**
 * Validates org / vehicle / setup / trip alignment before any ledger write.
 * Enforces multi-tenant isolation at the application layer (DB trigger mirrors this).
 */
export function assertTireTripUsageTenantContext(ctx: TireTripUsageTenantContext): void {
  if (ctx.vehicleOrganizationId !== ctx.organizationId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Vehicle ${ctx.vehicleId} does not belong to organization ${ctx.organizationId}.`,
    );
  }
  if (ctx.setupVehicleId !== ctx.vehicleId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Tire setup ${ctx.tireSetupId} does not belong to vehicle ${ctx.vehicleId}.`,
    );
  }
  if (ctx.setupOrganizationId && ctx.setupOrganizationId !== ctx.organizationId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Tire setup ${ctx.tireSetupId} organization mismatch.`,
    );
  }
  if (ctx.tripVehicleId !== ctx.vehicleId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Trip ${ctx.tripId} does not belong to vehicle ${ctx.vehicleId}.`,
    );
  }
}

export function buildTireTripUsageLedgerWriteData(
  input: TripUsageLedgerEntryInput,
  sourceFingerprint: string,
): Prisma.TireTripUsageLedgerUncheckedCreateInput {
  const processedAt = input.processedAt ?? new Date();
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    tireSetupId: input.tireSetupId,
    tripStartedAt: new Date(input.tripStartedAt),
    tripEndedAt: input.tripEndedAt ? new Date(input.tripEndedAt) : null,
    distanceKm: input.distanceKm,
    cityKm: input.cityKm,
    ruralKm: input.ruralKm,
    highwayKm: input.highwayKm,
    harshAccelerationCount: input.harshAccelerationCount,
    harshBrakingCount: input.harshBrakingCount,
    harshCorneringCount: input.harshCorneringCount,
    drivingImpactSummary:
      input.drivingImpactSummary != null
        ? (input.drivingImpactSummary as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    sourceVersion: input.sourceVersion ?? TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
    sourceFingerprint,
    processedAt,
  };
}

type LedgerClient = {
  tireTripUsageLedger: {
    findUnique: (args: {
      where: { tripId_tireSetupId: { tripId: string; tireSetupId: string } };
    }) => Promise<TireTripUsageLedger | null>;
    create: (args: {
      data: Prisma.TireTripUsageLedgerUncheckedCreateInput;
    }) => Promise<TireTripUsageLedger>;
    update: (args: {
      where: { id: string };
      data: Prisma.TireTripUsageLedgerUncheckedUpdateInput;
    }) => Promise<TireTripUsageLedger>;
  };
};

/**
 * Idempotent upsert for attributed trip usage.
 * - Creates when (tripId, tireSetupId) is new
 * - Updates only when sourceFingerprint changed (trip reprocessing, late segments, etc.)
 * - Skips write when fingerprint unchanged
 */
export async function upsertTireTripUsageLedgerEntry(
  prisma: LedgerClient,
  input: TripUsageLedgerEntryInput,
  tenant: TireTripUsageTenantContext,
): Promise<TireTripUsageLedgerUpsertResult> {
  assertTireTripUsageTenantContext(tenant);

  if (
    input.organizationId !== tenant.organizationId ||
    input.vehicleId !== tenant.vehicleId ||
    input.tripId !== tenant.tripId ||
    input.tireSetupId !== tenant.tireSetupId
  ) {
    throw new TireTripUsageLedgerTenantMismatchError(
      'Ledger input identifiers do not match tenant context.',
    );
  }

  const fingerprintInput = {
    ...input,
    sourceVersion: input.sourceVersion ?? TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  };
  const sourceFingerprint = computeTripUsageSourceFingerprint(fingerprintInput);
  const writeData = buildTireTripUsageLedgerWriteData(input, sourceFingerprint);

  const existing = await prisma.tireTripUsageLedger.findUnique({
    where: {
      tripId_tireSetupId: {
        tripId: input.tripId,
        tireSetupId: input.tireSetupId,
      },
    },
  });

  if (!existing) {
    const entry = await prisma.tireTripUsageLedger.create({
      data: writeData,
    });
    return { action: 'CREATED', entry, sourceFingerprint };
  }

  if (existing.organizationId !== input.organizationId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Existing ledger row for trip ${input.tripId} belongs to another organization.`,
    );
  }

  if (existing.sourceFingerprint === sourceFingerprint) {
    return { action: 'UNCHANGED', entry: existing, sourceFingerprint };
  }

  const entry = await prisma.tireTripUsageLedger.update({
    where: { id: existing.id },
    data: {
      ...writeData,
      updatedAt: new Date(),
    },
  });
  return { action: 'UPDATED', entry, sourceFingerprint };
}

/**
 * List ledger rows for a tire setup within an organization (tenant-scoped read).
 */
export async function listTireTripUsageLedgerForSetup(
  prisma: {
    tireTripUsageLedger: {
      findMany: (args: Prisma.TireTripUsageLedgerFindManyArgs) => Promise<TireTripUsageLedger[]>;
    };
  },
  args: {
    organizationId: string;
    tireSetupId: string;
    from?: Date;
    to?: Date;
  },
): Promise<TireTripUsageLedger[]> {
  return prisma.tireTripUsageLedger.findMany({
    where: {
      organizationId: args.organizationId,
      tireSetupId: args.tireSetupId,
      ...(args.from || args.to
        ? {
            tripStartedAt: {
              ...(args.from ? { gte: args.from } : {}),
              ...(args.to ? { lte: args.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { tripStartedAt: 'asc' },
  });
}
