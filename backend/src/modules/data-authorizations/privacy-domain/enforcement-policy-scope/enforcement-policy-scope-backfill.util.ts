import {
  EnforcementPolicyScopeMigrationSource,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { EnforcementPolicyScopeSets } from './dto/enforcement-policy-scope.dto';
import { dedupeIds } from './enforcement-policy-scope.util';
import { EnforcementPolicyScopeValidationService } from './enforcement-policy-scope-validation.service';

export interface EnforcementPolicyScopeBackfillOptions {
  dryRun?: boolean;
  organizationId?: string;
}

export interface EnforcementPolicyScopeBackfillResult {
  dryRun: boolean;
  policiesProcessed: number;
  vehiclesLinked: number;
  customersLinked: number;
  bookingsLinked: number;
  stationsLinked: number;
  findingsRecorded: number;
  skippedPolicies: number;
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export async function backfillEnforcementPolicyScopes(
  prisma: PrismaClient,
  options: EnforcementPolicyScopeBackfillOptions = {},
): Promise<EnforcementPolicyScopeBackfillResult> {
  const validation = new EnforcementPolicyScopeValidationService(prisma as never);
  const dryRun = options.dryRun ?? false;

  const result: EnforcementPolicyScopeBackfillResult = {
    dryRun,
    policiesProcessed: 0,
    vehiclesLinked: 0,
    customersLinked: 0,
    bookingsLinked: 0,
    stationsLinked: 0,
    findingsRecorded: 0,
    skippedPolicies: 0,
  };

  const policies = await prisma.enforcementPolicy.findMany({
    where: {
      organizationId: options.organizationId,
      legacyOrgDataAuthorizationId: { not: null },
    },
    include: {
      legacyOrgDataAuthorization: true,
      vehicles: { select: { vehicleId: true } },
      customers: { select: { customerId: true } },
      bookings: { select: { bookingId: true } },
      stations: { select: { stationId: true } },
    },
  });

  for (const policy of policies) {
    const legacy = policy.legacyOrgDataAuthorization;
    if (!legacy) {
      result.skippedPolicies += 1;
      continue;
    }

    const requested: EnforcementPolicyScopeSets = {
      vehicleIds: dedupeIds([
        ...policy.vehicles.map((row) => row.vehicleId),
        ...jsonStringArray(legacy.vehicleIds),
      ]),
      customerIds: dedupeIds([
        ...policy.customers.map((row) => row.customerId),
        ...jsonStringArray(legacy.customerIds),
      ]),
      bookingIds: dedupeIds([
        ...policy.bookings.map((row) => row.bookingId),
        ...jsonStringArray(legacy.bookingIds),
      ]),
      stationIds: policy.stations.map((row) => row.stationId),
    };

    const hasRequested =
      requested.vehicleIds.length +
        requested.customerIds.length +
        requested.bookingIds.length +
        requested.stationIds.length >
      0;

    if (!hasRequested) {
      result.skippedPolicies += 1;
      continue;
    }

    result.policiesProcessed += 1;

    if (dryRun) {
      const resolved = await validation.validateAndResolve(policy.organizationId, requested, {
        enforcementPolicyId: policy.id,
        legacySource: EnforcementPolicyScopeMigrationSource.LEGACY_ORG_DATA_AUTHORIZATION_JSON,
        recordFindings: false,
      });
      result.vehiclesLinked += resolved.vehicleIds.length;
      result.customersLinked += resolved.customerIds.length;
      result.bookingsLinked += resolved.bookingIds.length;
      result.stationsLinked += resolved.stationIds.length;
      result.findingsRecorded += resolved.invalidCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const resolved = await validation.validateAndResolve(policy.organizationId, requested, {
        tx,
        enforcementPolicyId: policy.id,
        legacySource: EnforcementPolicyScopeMigrationSource.LEGACY_ORG_DATA_AUTHORIZATION_JSON,
        recordFindings: true,
      });

      await tx.enforcementPolicyVehicle.deleteMany({
        where: { enforcementPolicyId: policy.id },
      });
      await tx.enforcementPolicyCustomer.deleteMany({
        where: { enforcementPolicyId: policy.id },
      });
      await tx.enforcementPolicyBooking.deleteMany({
        where: { enforcementPolicyId: policy.id },
      });
      await tx.enforcementPolicyStation.deleteMany({
        where: { enforcementPolicyId: policy.id },
      });

      if (resolved.vehicleIds.length) {
        await tx.enforcementPolicyVehicle.createMany({
          data: resolved.vehicleIds.map((vehicleId) => ({
            organizationId: policy.organizationId,
            enforcementPolicyId: policy.id,
            vehicleId,
          })),
        });
      }
      if (resolved.customerIds.length) {
        await tx.enforcementPolicyCustomer.createMany({
          data: resolved.customerIds.map((customerId) => ({
            organizationId: policy.organizationId,
            enforcementPolicyId: policy.id,
            customerId,
          })),
        });
      }
      if (resolved.bookingIds.length) {
        await tx.enforcementPolicyBooking.createMany({
          data: resolved.bookingIds.map((bookingId) => ({
            organizationId: policy.organizationId,
            enforcementPolicyId: policy.id,
            bookingId,
          })),
        });
      }
      if (resolved.stationIds.length) {
        await tx.enforcementPolicyStation.createMany({
          data: resolved.stationIds.map((stationId) => ({
            organizationId: policy.organizationId,
            enforcementPolicyId: policy.id,
            stationId,
          })),
        });
      }

      result.vehiclesLinked += resolved.vehicleIds.length;
      result.customersLinked += resolved.customerIds.length;
      result.bookingsLinked += resolved.bookingIds.length;
      result.stationsLinked += resolved.stationIds.length;
      result.findingsRecorded += resolved.invalidCount;
    });
  }

  return result;
}
