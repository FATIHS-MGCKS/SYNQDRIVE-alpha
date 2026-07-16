import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleProviderConsentGrantType, VehicleProviderConsentStatus } from '@prisma/client';
import { BatteryCapabilityRefreshService } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityRefreshTrigger } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-lifecycle.policy';

export interface RecordDimoConsentInput {
  vehicleId: string;
  organizationId: string;
  dimoTokenId?: number | null;
  dimoExternalId?: string | null;
  grantedByUserId?: string | null;
  scopes?: string[];
  metadataJson?: Record<string, unknown>;
}

export interface RecordHmConsentInput {
  vehicleId: string;
  organizationId: string;
  hmVehicleId: string;
  hmVin?: string | null;
  appContainerType?: string | null;
  grantedByUserId?: string | null;
  proofReference?: string | null;
  proofHash?: string | null;
  scopes?: string[];
  metadataJson?: Record<string, unknown>;
}

export interface RevokeConsentInput {
  vehicleId: string;
  provider: string;
  revokedByUserId?: string | null;
  reason?: string;
}

/**
 * VehicleProviderConsentService — canonical consent/access-grant ledger for SynqDrive.
 *
 * Records every provider access grant event for a vehicle, including:
 *  - DIMO: when a vehicle is linked via DIMO (OAuth or direct)
 *  - HM: when a High Mobility fleet clearance is approved
 *
 * All writes are fire-and-forget safe (catch-and-log on failure so they
 * never break the calling registration flow).
 */
@Injectable()
export class VehicleProviderConsentService {
  private readonly logger = new Logger(VehicleProviderConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly batteryCapabilityRefresh?: BatteryCapabilityRefreshService,
  ) {}

  /**
   * Record a DIMO consent grant when a vehicle is registered from DIMO.
   */
  async recordDimoConsent(input: RecordDimoConsentInput): Promise<string | null> {
    try {
      const record = await this.prisma.vehicleProviderConsent.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          provider: 'DIMO',
          grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
          status: VehicleProviderConsentStatus.ACTIVE,
          scopes: input.scopes ?? ['telemetry', 'location', 'dtc', 'snapshot'],
          grantedByUserId: input.grantedByUserId ?? null,
          providerVehicleRef: input.dimoExternalId ?? (input.dimoTokenId ? String(input.dimoTokenId) : null),
          metadataJson: {
            dimoTokenId: input.dimoTokenId ?? null,
            dimoExternalId: input.dimoExternalId ?? null,
            ...input.metadataJson,
          },
        },
      });
      this.logger.log(`DIMO consent recorded for vehicle ${input.vehicleId} (consent ${record.id})`);
      void this.batteryCapabilityRefresh?.enqueueForDimoVehicle(
        input.organizationId,
        input.vehicleId,
        BatteryCapabilityRefreshTrigger.PROVIDER_CHANGE,
        { correlationId: record.id },
      );
      return record.id;
    } catch (err: any) {
      this.logger.error(`Failed to record DIMO consent for vehicle ${input.vehicleId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Record an HM fleet clearance approval as a provider consent grant.
   */
  async recordHmConsent(input: RecordHmConsentInput): Promise<string | null> {
    try {
      const record = await this.prisma.vehicleProviderConsent.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          provider: 'HIGH_MOBILITY',
          grantType: VehicleProviderConsentGrantType.HM_FLEET_CLEARANCE,
          status: VehicleProviderConsentStatus.ACTIVE,
          scopes: input.scopes ?? ['health', 'tire_pressure', 'service_info'],
          grantedByUserId: input.grantedByUserId ?? null,
          providerVehicleRef: input.hmVehicleId,
          proofReference: input.proofReference ?? null,
          proofHash: input.proofHash ?? null,
          metadataJson: {
            hmVehicleId: input.hmVehicleId,
            hmVin: input.hmVin ?? null,
            appContainerType: input.appContainerType ?? null,
            ...input.metadataJson,
          },
        },
      });
      this.logger.log(`HM consent recorded for vehicle ${input.vehicleId} via ${input.appContainerType ?? 'unknown'} (consent ${record.id})`);
      return record.id;
    } catch (err: any) {
      this.logger.error(`Failed to record HM consent for vehicle ${input.vehicleId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Revoke all active consents for a vehicle+provider combination.
   * Called when clearance is revoked or vehicle is deregistered.
   */
  async revokeByProvider(input: RevokeConsentInput): Promise<void> {
    try {
      await this.prisma.vehicleProviderConsent.updateMany({
        where: {
          vehicleId: input.vehicleId,
          provider: input.provider,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
        data: {
          status: VehicleProviderConsentStatus.REVOKED,
          revokedAt: new Date(),
          revokedByUserId: input.revokedByUserId ?? null,
          metadataJson: input.reason ? { revokedReason: input.reason } : undefined,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to revoke consent for vehicle ${input.vehicleId} provider ${input.provider}: ${err?.message}`);
    }
  }

  /** Get the latest active consent for a vehicle+provider. */
  async getActiveConsent(vehicleId: string, provider: string) {
    return this.prisma.vehicleProviderConsent.findFirst({
      where: {
        vehicleId,
        provider,
        status: VehicleProviderConsentStatus.ACTIVE,
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /** List all consents for a vehicle (history). */
  async listForVehicle(vehicleId: string) {
    return this.prisma.vehicleProviderConsent.findMany({
      where: { vehicleId },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
