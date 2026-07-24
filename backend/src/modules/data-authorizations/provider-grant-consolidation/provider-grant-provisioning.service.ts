import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuthorizationActorType,
  Prisma,
  ProviderAccessGrantMechanism,
  ProviderAccessGrantStatus,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeProviderScopes } from '../privacy-domain/provider-access-grant/provider-access-grant.constants';
import { assertProviderGrantTransition } from '../privacy-domain/privacy-domain.lifecycle';
import { buildWebhookIdempotencyKey } from './provider-grant-consolidation.constants';

export interface ProvisionProviderGrantInput {
  organizationId: string;
  vehicleId: string;
  provider: string;
  grantMechanism: ProviderAccessGrantMechanism;
  scopes: string[];
  providerGrantReference?: string | null;
  providerAccountReference?: string | null;
  webhookEventId?: string | null;
  processingActivityId?: string | null;
  actorType?: AuthorizationActorType;
  actorId?: string | null;
  expiresAt?: Date | null;
  /** Informational only — never used as legal basis. */
  tokenExpiresAt?: Date | null;
  legacyVpcMetadata?: Record<string, unknown>;
  vpcGrantType?: VehicleProviderConsentGrantType;
}

export interface ProvisionProviderGrantResult {
  grantId: string;
  vpcId: string | null;
  idempotentReplay: boolean;
  activated: boolean;
}

/**
 * Single write path for provider grants — only onboarding, OAuth, sharing, or webhook flows.
 * Never auto-activates from GET endpoints. Mirrors legacy VPC for controlled migration.
 */
@Injectable()
export class ProviderGrantProvisioningService {
  private readonly logger = new Logger(ProviderGrantProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provisionAndActivate(input: ProvisionProviderGrantInput): Promise<ProvisionProviderGrantResult> {
    await this.assertVehicleInOrg(input.organizationId, input.vehicleId);

    const provider = input.provider.trim().toUpperCase();
    const scopes = normalizeProviderScopes(provider, input.scopes);
    const webhookIdempotencyKey = input.webhookEventId
      ? buildWebhookIdempotencyKey(provider, input.vehicleId, input.webhookEventId)
      : null;

    if (webhookIdempotencyKey) {
      const existing = await this.prisma.providerAccessGrant.findUnique({
        where: { webhookIdempotencyKey },
        include: { legacyVehicleProviderConsent: true },
      });
      if (existing) {
        return {
          grantId: existing.id,
          vpcId: existing.legacyVehicleProviderConsentId,
          idempotentReplay: true,
          activated: existing.providerStatus === ProviderAccessGrantStatus.ACTIVE,
        };
      }
    }

    const actorType = input.actorType ?? AuthorizationActorType.SYSTEM;
    const grantedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const vpc = await tx.vehicleProviderConsent.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          provider,
          grantType: input.vpcGrantType ?? this.defaultVpcGrantType(provider, input.grantMechanism),
          status: VehicleProviderConsentStatus.ACTIVE,
          scopes,
          grantedByUserId: input.actorId ?? null,
          providerVehicleRef: input.providerGrantReference ?? input.providerAccountReference ?? null,
          proofReference: input.providerGrantReference ?? null,
          metadataJson: this.sanitizeMetadata(input.legacyVpcMetadata) as Prisma.InputJsonValue,
        },
      });

      const grant = await tx.providerAccessGrant.create({
        data: {
          organizationId: input.organizationId,
          provider,
          providerAccountReference: input.providerAccountReference?.trim() || null,
          providerGrantReference: input.providerGrantReference?.trim() || null,
          providerStatus: ProviderAccessGrantStatus.ACTIVE,
          grantMechanism: input.grantMechanism,
          grantedAt,
          expiresAt: input.expiresAt ?? null,
          tokenExpiresAt: input.tokenExpiresAt ?? null,
          lastVerifiedAt: grantedAt,
          processingActivityId: input.processingActivityId ?? null,
          vehicleId: input.vehicleId,
          linkedVehicleCount: 1,
          legacyVehicleProviderConsentId: vpc.id,
          webhookIdempotencyKey,
          technicalOwnerUserId: input.actorId ?? null,
        },
      });

      await tx.providerAccessGrantScope.createMany({
        data: scopes.map((scopeKey) => ({
          organizationId: input.organizationId,
          providerAccessGrantId: grant.id,
          scopeKey,
        })),
      });

      await tx.providerAccessGrantStatusEvent.create({
        data: {
          organizationId: input.organizationId,
          providerAccessGrantId: grant.id,
          fromStatus: null,
          toStatus: ProviderAccessGrantStatus.ACTIVE,
          actorType,
          actorId: input.actorId ?? null,
          reason: `provisioned via ${input.grantMechanism}`,
        },
      });

      this.logger.log(
        `Provider grant ${grant.id} activated for ${provider} vehicle=${input.vehicleId} mechanism=${input.grantMechanism}`,
      );

      return {
        grantId: grant.id,
        vpcId: vpc.id,
        idempotentReplay: false,
        activated: true,
      };
    });
  }

  async revokeForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    actorType?: AuthorizationActorType;
    actorId?: string | null;
    reason?: string | null;
  }): Promise<{ grantsRevoked: number; vpcRevoked: boolean }> {
    const provider = input.provider.trim().toUpperCase();
    const revokedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const activeGrants = await tx.providerAccessGrant.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          providerStatus: ProviderAccessGrantStatus.ACTIVE,
        },
      });

      for (const grant of activeGrants) {
        assertProviderGrantTransition(grant.providerStatus, ProviderAccessGrantStatus.REVOKED);
        await tx.providerAccessGrant.update({
          where: { id: grant.id },
          data: { providerStatus: ProviderAccessGrantStatus.REVOKED, revokedAt },
        });
        await tx.providerAccessGrantStatusEvent.create({
          data: {
            organizationId: input.organizationId,
            providerAccessGrantId: grant.id,
            fromStatus: grant.providerStatus,
            toStatus: ProviderAccessGrantStatus.REVOKED,
            actorType: input.actorType ?? AuthorizationActorType.SYSTEM,
            actorId: input.actorId ?? null,
            reason: input.reason?.trim() || null,
          },
        });
      }

      const vpcResult = await tx.vehicleProviderConsent.updateMany({
        where: {
          vehicleId: input.vehicleId,
          provider,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
        data: {
          status: VehicleProviderConsentStatus.REVOKED,
          revokedAt,
          metadataJson: input.reason ? { revokedReason: input.reason } : undefined,
        },
      });

      return { grantsRevoked: activeGrants.length, vpcRevoked: vpcResult.count > 0 };
    });
  }

  private async assertVehicleInOrg(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found in organization');
    }
  }

  private defaultVpcGrantType(
    provider: string,
    mechanism: ProviderAccessGrantMechanism,
  ): VehicleProviderConsentGrantType {
    if (provider === 'HIGH_MOBILITY') {
      return VehicleProviderConsentGrantType.HM_FLEET_CLEARANCE;
    }
    if (mechanism === ProviderAccessGrantMechanism.OAUTH) {
      return VehicleProviderConsentGrantType.DIMO_OAUTH;
    }
    return VehicleProviderConsentGrantType.DIMO_DIRECT;
  }

  /** Strip any secret-like keys from metadata before persistence. */
  private sanitizeMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const forbidden = /secret|password|token|private.?key|api.?key/i;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (forbidden.test(key)) continue;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        clean[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }
}
