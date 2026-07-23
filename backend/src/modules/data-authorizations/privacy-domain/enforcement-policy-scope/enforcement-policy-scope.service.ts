import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EnforcementPolicyStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  EnforcementPolicyScopeSets,
  ReplaceEnforcementPolicyScopesDto,
} from './dto/enforcement-policy-scope.dto';
import { EnforcementPolicyScopeValidationService } from './enforcement-policy-scope-validation.service';
import {
  ENFORCEMENT_POLICY_SCOPE_ERROR,
  throwScopeError,
} from './enforcement-policy-scope.exceptions';

type PolicyWithScopes = Prisma.EnforcementPolicyGetPayload<{
  include: {
    vehicles: true;
    customers: true;
    bookings: true;
    stations: true;
  };
}>;

const SCOPE_INCLUDE = {
  vehicles: true,
  customers: true,
  bookings: true,
  stations: true,
} as const;

@Injectable()
export class EnforcementPolicyScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: EnforcementPolicyScopeValidationService,
  ) {}

  async getScopes(orgId: string, policyId: string) {
    const policy = await this.findPolicyOrThrow(orgId, policyId);
    return this.toScopeResponse(policy);
  }

  async replaceScopes(
    orgId: string,
    policyId: string,
    dto: ReplaceEnforcementPolicyScopesDto,
  ) {
    const policy = await this.findPolicyOrThrow(orgId, policyId);
    this.assertDraftEditable(policy);

    const resolved = await this.validation.assertAllValidOrThrow(
      orgId,
      this.toScopeSets(dto),
    );
    return this.applyScopesTransactional(orgId, policy.id, resolved);
  }

  async createScopedVersion(
    orgId: string,
    policyId: string,
    dto: ReplaceEnforcementPolicyScopesDto,
  ) {
    const source = await this.findPolicyOrThrow(orgId, policyId);
    if (source.status !== EnforcementPolicyStatus.ACTIVE) {
      throwScopeError(
        ENFORCEMENT_POLICY_SCOPE_ERROR.ACTIVE_REQUIRES_NEW_VERSION,
        'Scoped versions can only be created from active policies',
      );
    }

    const resolved = await this.validation.assertAllValidOrThrow(
      orgId,
      this.toScopeSets(dto),
    );

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.enforcementPolicy.findFirst({
        where: { policyFamilyId: source.policyFamilyId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const nextVersion = (latest?.versionNumber ?? source.versionNumber) + 1;

      await tx.enforcementPolicy.updateMany({
        where: { policyFamilyId: source.policyFamilyId, isCurrentVersion: true },
        data: { isCurrentVersion: false },
      });

      const created = await tx.enforcementPolicy.create({
        data: {
          organizationId: orgId,
          processingActivityId: source.processingActivityId,
          policyFamilyId: source.policyFamilyId,
          versionNumber: nextVersion,
          isCurrentVersion: true,
          status: EnforcementPolicyStatus.DRAFT,
          enforcementMode: source.enforcementMode,
          dataCategory: source.dataCategory,
          processingPurpose: source.processingPurpose,
          scopeType: source.scopeType,
          pathId: source.pathId,
          legacyOrgDataAuthorizationId: null,
        },
      });

      await this.writeScopes(tx, orgId, created.id, resolved);

      return tx.enforcementPolicy.findUniqueOrThrow({
        where: { id: created.id },
        include: SCOPE_INCLUDE,
      });
    });
  }

  private async applyScopesTransactional(
    orgId: string,
    policyId: string,
    scopes: EnforcementPolicyScopeSets,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.enforcementPolicy.findFirst({
        where: { id: policyId, organizationId: orgId },
      });
      if (!locked) {
        throw new NotFoundException('Enforcement policy not found');
      }
      if (locked.status !== EnforcementPolicyStatus.DRAFT) {
        throwScopeError(
          ENFORCEMENT_POLICY_SCOPE_ERROR.POLICY_NOT_EDITABLE,
          'Scope changes are only allowed on draft policies',
        );
      }

      await this.writeScopes(tx, orgId, policyId, scopes);

      return tx.enforcementPolicy.findUniqueOrThrow({
        where: { id: policyId },
        include: SCOPE_INCLUDE,
      });
    });
  }

  private async writeScopes(
    tx: Prisma.TransactionClient,
    orgId: string,
    policyId: string,
    scopes: EnforcementPolicyScopeSets,
  ) {
    await tx.enforcementPolicyVehicle.deleteMany({ where: { enforcementPolicyId: policyId } });
    await tx.enforcementPolicyCustomer.deleteMany({ where: { enforcementPolicyId: policyId } });
    await tx.enforcementPolicyBooking.deleteMany({ where: { enforcementPolicyId: policyId } });
    await tx.enforcementPolicyStation.deleteMany({ where: { enforcementPolicyId: policyId } });

    if (scopes.vehicleIds.length) {
      await tx.enforcementPolicyVehicle.createMany({
        data: scopes.vehicleIds.map((vehicleId) => ({
          organizationId: orgId,
          enforcementPolicyId: policyId,
          vehicleId,
        })),
      });
    }
    if (scopes.customerIds.length) {
      await tx.enforcementPolicyCustomer.createMany({
        data: scopes.customerIds.map((customerId) => ({
          organizationId: orgId,
          enforcementPolicyId: policyId,
          customerId,
        })),
      });
    }
    if (scopes.bookingIds.length) {
      await tx.enforcementPolicyBooking.createMany({
        data: scopes.bookingIds.map((bookingId) => ({
          organizationId: orgId,
          enforcementPolicyId: policyId,
          bookingId,
        })),
      });
    }
    if (scopes.stationIds.length) {
      await tx.enforcementPolicyStation.createMany({
        data: scopes.stationIds.map((stationId) => ({
          organizationId: orgId,
          enforcementPolicyId: policyId,
          stationId,
        })),
      });
    }
  }

  private toScopeSets(dto: ReplaceEnforcementPolicyScopesDto): EnforcementPolicyScopeSets {
    return {
      vehicleIds: dto.vehicleIds ?? [],
      customerIds: dto.customerIds ?? [],
      bookingIds: dto.bookingIds ?? [],
      stationIds: dto.stationIds ?? [],
    };
  }

  private assertDraftEditable(
    policy: Pick<PolicyWithScopes, 'status'>,
  ): void {
    if (policy.status !== EnforcementPolicyStatus.DRAFT) {
      throwScopeError(
        ENFORCEMENT_POLICY_SCOPE_ERROR.POLICY_NOT_EDITABLE,
        'Scope changes are only allowed on draft policies. Create a new policy version instead.',
      );
    }
  }

  private async findPolicyOrThrow(orgId: string, policyId: string): Promise<PolicyWithScopes> {
    const policy = await this.prisma.enforcementPolicy.findFirst({
      where: { id: policyId, organizationId: orgId },
      include: SCOPE_INCLUDE,
    });
    if (!policy) {
      throw new NotFoundException('Enforcement policy not found');
    }
    return policy;
  }

  private toScopeResponse(policy: PolicyWithScopes) {
    return {
      policyId: policy.id,
      policyFamilyId: policy.policyFamilyId,
      versionNumber: policy.versionNumber,
      status: policy.status,
      vehicleIds: policy.vehicles.map((row) => row.vehicleId),
      customerIds: policy.customers.map((row) => row.customerId),
      bookingIds: policy.bookings.map((row) => row.bookingId),
      stationIds: policy.stations.map((row) => row.stationId),
    };
  }

  static newPolicyFamilyId(): string {
    return randomUUID();
  }
}
