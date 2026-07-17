import { Prisma, type TireTripUsageLedger } from '@prisma/client';
import {
  computeTripUsageSourceFingerprint,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  type TireTripUsageLedgerUpsertAction,
  type TripUsageLedgerEntryInput,
} from './tire-trip-usage-ledger';
import { TireTripUsageReplayConflictError } from './tire-trip-usage-replay';

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
  previousFingerprint: string | null;
}

export class TireTripUsageLedgerTenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TireTripUsageLedgerTenantMismatchError';
  }
}

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
 * Idempotent upsert under advisory lock.
 * UNCHANGED → immediate no-op payload for caller (no writes).
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
    try {
      const entry = await prisma.tireTripUsageLedger.create({
        data: writeData,
      });
      return { action: 'CREATED', entry, sourceFingerprint, previousFingerprint: null };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new TireTripUsageReplayConflictError(
          `Concurrent ledger create for trip ${input.tripId}`,
        );
      }
      throw err;
    }
  }

  if (existing.organizationId !== input.organizationId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Existing ledger row for trip ${input.tripId} belongs to another organization.`,
    );
  }

  if (existing.sourceFingerprint === sourceFingerprint) {
    return {
      action: 'UNCHANGED',
      entry: existing,
      sourceFingerprint,
      previousFingerprint: existing.sourceFingerprint,
    };
  }

  const entry = await prisma.tireTripUsageLedger.update({
    where: { id: existing.id },
    data: {
      ...writeData,
      previousFingerprint: existing.sourceFingerprint,
      revisionNumber: (existing.revisionNumber ?? 1) + 1,
      invalidatedAt: null,
      invalidationReason: null,
      supersededByTripId: null,
      updatedAt: new Date(),
    },
  });
  return {
    action: 'UPDATED',
    entry,
    sourceFingerprint,
    previousFingerprint: existing.sourceFingerprint,
  };
}

export async function invalidateTireTripUsageLedgerEntry(
  prisma: LedgerClient,
  args: {
    tripId: string;
    tireSetupId: string;
    organizationId: string;
    reason: string;
    supersededByTripId?: string | null;
    fingerprintInput: TripUsageLedgerEntryInput;
  },
): Promise<TireTripUsageLedgerUpsertResult | null> {
  const existing = await prisma.tireTripUsageLedger.findUnique({
    where: {
      tripId_tireSetupId: {
        tripId: args.tripId,
        tireSetupId: args.tireSetupId,
      },
    },
  });
  if (!existing || existing.invalidatedAt) {
    return null;
  }
  if (existing.organizationId !== args.organizationId) {
    throw new TireTripUsageLedgerTenantMismatchError(
      `Ledger row for trip ${args.tripId} belongs to another organization.`,
    );
  }

  const sourceFingerprint = computeTripUsageSourceFingerprint({
    ...args.fingerprintInput,
    sourceVersion:
      args.fingerprintInput.sourceVersion ?? TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  });
  const now = new Date();
  const entry = await prisma.tireTripUsageLedger.update({
    where: { id: existing.id },
    data: {
      distanceKm: 0,
      cityKm: 0,
      ruralKm: 0,
      highwayKm: 0,
      harshAccelerationCount: 0,
      harshBrakingCount: 0,
      harshCorneringCount: 0,
      sourceFingerprint,
      previousFingerprint: existing.sourceFingerprint,
      revisionNumber: (existing.revisionNumber ?? 1) + 1,
      invalidatedAt: now,
      invalidationReason: args.reason,
      supersededByTripId: args.supersededByTripId ?? null,
      processedAt: now,
      drivingImpactSummary: {
        invalidated: true,
        invalidationReason: args.reason,
        supersededByTripId: args.supersededByTripId ?? null,
      } as Prisma.InputJsonValue,
    },
  });
  return {
    action: 'UPDATED',
    entry,
    sourceFingerprint,
    previousFingerprint: existing.sourceFingerprint,
  };
}

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
