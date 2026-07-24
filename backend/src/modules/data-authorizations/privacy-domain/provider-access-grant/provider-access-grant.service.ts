import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AuthorizationActorType,
  Prisma,
  ProviderAccessGrantStatus,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  ActivateProviderAccessGrantDto,
  CreateProviderAccessGrantDto,
  RevokeProviderAccessGrantDto,
} from './dto/provider-access-grant.dto';
import { normalizeProviderScopes } from './provider-access-grant.constants';
import { assertProviderGrantTransition } from '../privacy-domain.lifecycle';
import { RevocationOrchestratorEnqueueService } from '../../revocation-orchestrator/revocation-orchestrator.enqueue.service';

@Injectable()
export class ProviderAccessGrantService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly revocationEnqueue?: RevocationOrchestratorEnqueueService,
  ) {}

  async create(orgId: string, dto: CreateProviderAccessGrantDto, actorUserId?: string) {
    const scopes = normalizeProviderScopes(dto.provider, dto.grantedScopes);

    if (dto.processingActivityId) {
      await this.findActivityOrThrow(orgId, dto.processingActivityId);
    }
    if (dto.vehicleId) {
      await this.findVehicleOrThrow(orgId, dto.vehicleId);
    }
    if (dto.legacyVehicleProviderConsentId) {
      await this.findLegacyVpcOrThrow(orgId, dto.legacyVehicleProviderConsentId);
    }

    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.providerAccessGrant.create({
        data: {
          organizationId: orgId,
          provider: dto.provider.trim().toUpperCase(),
          providerAccountReference: dto.providerAccountReference?.trim() || null,
          providerGrantReference: dto.providerGrantReference?.trim() || null,
          providerStatus: ProviderAccessGrantStatus.PENDING,
          grantMechanism: dto.grantMechanism ?? 'MANUAL',
          processingActivityId: dto.processingActivityId ?? null,
          vehicleId: dto.vehicleId ?? null,
          technicalOwnerUserId: actorUserId ?? null,
          linkedVehicleCount: dto.vehicleId ? 1 : 0,
          legacyVehicleProviderConsentId: dto.legacyVehicleProviderConsentId ?? null,
        },
      });

      await tx.providerAccessGrantScope.createMany({
        data: scopes.map((scopeKey) => ({
          organizationId: orgId,
          providerAccessGrantId: grant.id,
          scopeKey,
        })),
      });

      await tx.providerAccessGrantStatusEvent.create({
        data: {
          organizationId: orgId,
          providerAccessGrantId: grant.id,
          fromStatus: null,
          toStatus: ProviderAccessGrantStatus.PENDING,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId ?? null,
        },
      });

      return tx.providerAccessGrant.findUniqueOrThrow({
        where: { id: grant.id },
        include: { grantedScopes: true, statusEvents: true },
      });
    });
  }

  async activate(
    orgId: string,
    grantId: string,
    dto: ActivateProviderAccessGrantDto,
    actorUserId: string,
  ) {
    const grant = await this.findByIdOrThrow(orgId, grantId);
    assertProviderGrantTransition(grant.providerStatus, ProviderAccessGrantStatus.ACTIVE);

    const grantedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerAccessGrant.update({
        where: { id: grant.id },
        data: {
          providerStatus: ProviderAccessGrantStatus.ACTIVE,
          grantedAt,
          technicalOwnerUserId: dto.technicalOwnerUserId ?? actorUserId,
          lastVerifiedAt: grantedAt,
        },
        include: { grantedScopes: true },
      });

      await tx.providerAccessGrantStatusEvent.create({
        data: {
          organizationId: orgId,
          providerAccessGrantId: grant.id,
          fromStatus: grant.providerStatus,
          toStatus: ProviderAccessGrantStatus.ACTIVE,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
        },
      });

      return updated;
    });
  }

  async revoke(
    orgId: string,
    grantId: string,
    dto: RevokeProviderAccessGrantDto,
    actorUserId: string,
  ) {
    const grant = await this.findByIdOrThrow(orgId, grantId);
    assertProviderGrantTransition(grant.providerStatus, ProviderAccessGrantStatus.REVOKED);

    const revokedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerAccessGrant.update({
        where: { id: grant.id },
        data: {
          providerStatus: ProviderAccessGrantStatus.REVOKED,
          revokedAt,
        },
        include: { grantedScopes: true },
      });

      await tx.providerAccessGrantStatusEvent.create({
        data: {
          organizationId: orgId,
          providerAccessGrantId: grant.id,
          fromStatus: grant.providerStatus,
          toStatus: ProviderAccessGrantStatus.REVOKED,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
          reason: dto.reason?.trim() || null,
        },
      });

      if (updated.vehicleId) {
        await tx.vehicleProviderConsent.updateMany({
          where: {
            vehicleId: updated.vehicleId,
            provider: updated.provider,
            status: VehicleProviderConsentStatus.ACTIVE,
          },
          data: {
            status: VehicleProviderConsentStatus.REVOKED,
            revokedAt,
            revokedByUserId: actorUserId,
          },
        });
      }

      return updated;
    }).then(async (updated) => {
      if (this.revocationEnqueue) {
        await this.revocationEnqueue.enqueueProviderGrantRevoked({
          organizationId: orgId,
          providerGrantId: updated.id,
          vehicleId: updated.vehicleId,
          actorUserId,
          reason: dto.reason,
        });
      }
      return updated;
    });
  }

  async linkFromLegacyVpc(orgId: string, legacyVpcId: string, actorUserId?: string) {
    const vpc = await this.findLegacyVpcOrThrow(orgId, legacyVpcId);
    if (vpc.legacyProviderAccessGrant) {
      return vpc.legacyProviderAccessGrant;
    }

    return this.create(
      orgId,
      {
        provider: vpc.provider,
        providerGrantReference: vpc.proofReference ?? undefined,
        grantedScopes: vpc.scopes,
        grantMechanism: 'SYSTEM_SYNC',
        vehicleId: vpc.vehicleId,
        legacyVehicleProviderConsentId: vpc.id,
      },
      actorUserId,
    );
  }

  async findById(orgId: string, grantId: string) {
    return this.findByIdOrThrow(orgId, grantId);
  }

  private async findByIdOrThrow(orgId: string, grantId: string) {
    const row = await this.prisma.providerAccessGrant.findFirst({
      where: { id: grantId, organizationId: orgId },
      include: { grantedScopes: true },
    });
    if (!row) {
      throw new NotFoundException('Provider access grant not found');
    }
    return row;
  }

  private async findActivityOrThrow(orgId: string, processingActivityId: string) {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: processingActivityId, organizationId: orgId },
    });
    if (!activity) {
      throw new NotFoundException('Processing activity not found');
    }
    return activity;
  }

  private async findVehicleOrThrow(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async findLegacyVpcOrThrow(orgId: string, vpcId: string) {
    const vpc = await this.prisma.vehicleProviderConsent.findFirst({
      where: { id: vpcId, organizationId: orgId },
      include: { legacyProviderAccessGrant: true },
    });
    if (!vpc) {
      throw new NotFoundException('Legacy vehicle provider consent not found');
    }
    return vpc;
  }
}
