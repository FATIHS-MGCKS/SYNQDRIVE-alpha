import { Injectable } from '@nestjs/common';
import {
  EnforcementPolicyScopeMigrationFindingCode,
  EnforcementPolicyScopeMigrationSource,
  EnforcementPolicyScopeResourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { EnforcementPolicyScopeSets } from './dto/enforcement-policy-scope.dto';
import { dedupeIds, fingerprintResourceReference } from './enforcement-policy-scope.util';
import {
  ENFORCEMENT_POLICY_SCOPE_ERROR,
  throwScopeError,
} from './enforcement-policy-scope.exceptions';

export interface ScopeValidationResult {
  vehicleIds: string[];
  customerIds: string[];
  bookingIds: string[];
  stationIds: string[];
  invalidCount: number;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class EnforcementPolicyScopeValidationService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeScopeSets(input: EnforcementPolicyScopeSets): EnforcementPolicyScopeSets {
    return {
      vehicleIds: dedupeIds(input.vehicleIds),
      customerIds: dedupeIds(input.customerIds),
      bookingIds: dedupeIds(input.bookingIds),
      stationIds: dedupeIds(input.stationIds),
    };
  }

  async validateAndResolve(
    orgId: string,
    scopes: EnforcementPolicyScopeSets,
    options?: {
      tx?: Tx;
      enforcementPolicyId?: string;
      legacySource?: EnforcementPolicyScopeMigrationSource;
      recordFindings?: boolean;
    },
  ): Promise<ScopeValidationResult> {
    const normalized = this.normalizeScopeSets(scopes);
    const client = options?.tx ?? this.prisma;
    let invalidCount = 0;

    const vehicleIds = await this.resolveResourceIds(
      client,
      orgId,
      EnforcementPolicyScopeResourceType.VEHICLE,
      normalized.vehicleIds,
      options,
    );
    invalidCount += normalized.vehicleIds.length - vehicleIds.length;

    const customerIds = await this.resolveResourceIds(
      client,
      orgId,
      EnforcementPolicyScopeResourceType.CUSTOMER,
      normalized.customerIds,
      options,
    );
    invalidCount += normalized.customerIds.length - customerIds.length;

    const bookingIds = await this.resolveResourceIds(
      client,
      orgId,
      EnforcementPolicyScopeResourceType.BOOKING,
      normalized.bookingIds,
      options,
    );
    invalidCount += normalized.bookingIds.length - bookingIds.length;

    const stationIds = await this.resolveResourceIds(
      client,
      orgId,
      EnforcementPolicyScopeResourceType.STATION,
      normalized.stationIds,
      options,
    );
    invalidCount += normalized.stationIds.length - stationIds.length;

    return { vehicleIds, customerIds, bookingIds, stationIds, invalidCount };
  }

  async assertAllValidOrThrow(
    orgId: string,
    scopes: EnforcementPolicyScopeSets,
  ): Promise<ScopeValidationResult> {
    const result = await this.validateAndResolve(orgId, scopes);
    if (result.invalidCount > 0) {
      throwScopeError(
        ENFORCEMENT_POLICY_SCOPE_ERROR.INVALID_SCOPE_RESOURCES,
        'One or more scope resources are invalid or do not belong to this organization',
      );
    }
    return result;
  }

  private async resolveResourceIds(
    client: Tx | PrismaService,
    orgId: string,
    resourceType: EnforcementPolicyScopeResourceType,
    requestedIds: string[],
    options?: {
      enforcementPolicyId?: string;
      legacySource?: EnforcementPolicyScopeMigrationSource;
      recordFindings?: boolean;
    },
  ): Promise<string[]> {
    if (requestedIds.length === 0) return [];

    const existing = await this.findExistingIds(client, orgId, resourceType, requestedIds);
    const existingSet = new Set(existing);

    for (const reference of requestedIds) {
      if (existingSet.has(reference)) continue;

      if (options?.recordFindings) {
        await client.enforcementPolicyScopeMigrationFinding.create({
          data: {
            organizationId: orgId,
            enforcementPolicyId: options.enforcementPolicyId ?? null,
            legacySource:
              options.legacySource ??
              EnforcementPolicyScopeMigrationSource.LEGACY_ORG_DATA_AUTHORIZATION_JSON,
            resourceType,
            referenceFingerprint: fingerprintResourceReference(reference),
            findingCode: EnforcementPolicyScopeMigrationFindingCode.RESOURCE_NOT_FOUND,
          },
        });
      }
    }

    return requestedIds.filter((id) => existingSet.has(id));
  }

  private async findExistingIds(
    client: Tx | PrismaService,
    orgId: string,
    resourceType: EnforcementPolicyScopeResourceType,
    ids: string[],
  ): Promise<string[]> {
    switch (resourceType) {
      case EnforcementPolicyScopeResourceType.VEHICLE: {
        const rows = await client.vehicle.findMany({
          where: { organizationId: orgId, id: { in: ids } },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      }
      case EnforcementPolicyScopeResourceType.CUSTOMER: {
        const rows = await client.customer.findMany({
          where: { organizationId: orgId, id: { in: ids } },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      }
      case EnforcementPolicyScopeResourceType.BOOKING: {
        const rows = await client.booking.findMany({
          where: { organizationId: orgId, id: { in: ids } },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      }
      case EnforcementPolicyScopeResourceType.STATION: {
        const rows = await client.station.findMany({
          where: { organizationId: orgId, id: { in: ids } },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      }
      default:
        return [];
    }
  }
}
