import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VehicleRegistrationConvergenceConfig } from '@config/vehicle-registration-convergence.config';
import { VEHICLE_REGISTRATION_CONVERGENCE_PORT } from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.port';
import type { VehicleRegistrationConvergencePort } from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.port';
import {
  isHmOnlyCanonicalRoutingEnabled,
  isHmOnlyShadowCompareEnabled,
} from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.routing';
import { HmOnlyCanonicalReadinessObservationService } from '@modules/vehicle-onboarding/hm-only-canonical/hm-only-canonical-readiness-observation.service';
import {
  assertHighMobilityRecordTenantAccess,
  assertHighMobilityTenantOperationalOrganization,
  highMobilityRecordOrgWhere,
} from './high-mobility-tenant-access.policy';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  RegisterHmOnlyVehicleDto,
  HmOnlyRegistrationResultDto,
} from './dto/high-mobility.dto';

/**
 * Phase 2: HighMobilityRegistrationService
 *
 * Manages the HM_ONLY vehicle creation/registration path.
 * Creates an internal SynqDrive Vehicle record from an approved HM provider record
 * without requiring hardware (DIMO LTE R1 / Smart5).
 *
 * DOMAIN RULE: HM_ONLY vehicles are structurally first-class but must not
 * automatically trigger hardware-dependent modules (DTC polling, DIMO snapshots,
 * driving events, etc.).
 */
@Injectable()
export class HighMobilityRegistrationService {
  private readonly logger = new Logger(HighMobilityRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    @Inject(VEHICLE_REGISTRATION_CONVERGENCE_PORT)
    private readonly convergencePort?: VehicleRegistrationConvergencePort,
    @Optional()
    private readonly hmReadinessObservation?: HmOnlyCanonicalReadinessObservationService,
  ) {}

  private defaultConvergenceConfig(): VehicleRegistrationConvergenceConfig {
    return { hmOnlyCanonicalEnabled: false, billingSingleRailEnabled: false, shadowCompareEnabled: false };
  }

  private resolveConvergenceConfig(): VehicleRegistrationConvergenceConfig {
    return (
      this.configService?.get<VehicleRegistrationConvergenceConfig>('vehicleRegistrationConvergence') ??
      this.defaultConvergenceConfig()
    );
  }

  /**
   * Create and register an HM_ONLY vehicle in SynqDrive.
   * Requires an approved HM vehicle record (clearanceStatus === APPROVED).
   * The resulting vehicle has no DIMO connection and uses HIGH_MOBILITY as its sole source.
   */
  async registerHmOnlyVehicle(
    dto: RegisterHmOnlyVehicleDto,
    access: {
      tenantOrganizationId: string;
      isMasterAdmin: boolean;
      actorUserId: string | null;
    },
  ): Promise<HmOnlyRegistrationResultDto> {
    const convergenceConfig = this.resolveConvergenceConfig();
    if (isHmOnlyCanonicalRoutingEnabled(convergenceConfig)) {
      if (!this.convergencePort) {
        throw new ServiceUnavailableException({
          code: 'VEHICLE_REGISTRATION_CONVERGENCE_WIRING_MISSING',
          message:
            'HM_ONLY canonical routing is enabled but convergence port is not wired. Disable VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED.',
        });
      }
      return this.convergencePort.registerHmOnlyCanonical({ dto, access });
    }

    if (isHmOnlyShadowCompareEnabled(convergenceConfig) && this.hmReadinessObservation) {
      void this.hmReadinessObservation
        .observeHmOnlyRegistrationAttempt({ dto, access })
        .catch((error) => {
          this.logger.warn({
            msg: 'hm_only_shadow_readiness_observation_failed',
            hmVehicleId: dto.hmVehicleId,
            organizationId: dto.organizationId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    const { hmVehicleId, organizationId, vehicleName, licensePlate, notes, mileageKm, fuelType, vehicleType } = dto;

    if (organizationId !== access.tenantOrganizationId && !access.isMasterAdmin) {
      throw new BadRequestException('organizationId does not match the authenticated organization');
    }

    // Validate HM vehicle record
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hmRecord) throw new NotFoundException(`HM vehicle ${hmVehicleId} not found`);
    assertHighMobilityRecordTenantAccess(hmRecord, organizationId, access.isMasterAdmin);
    if (hmRecord.clearanceStatus !== 'APPROVED') {
      throw new BadRequestException(
        `HM vehicle clearance is not APPROVED (current: ${hmRecord.clearanceStatus})`,
      );
    }
    if (hmRecord.sourceMode !== 'HM_ONLY') {
      throw new BadRequestException(
        `registerHmOnlyVehicle is only for HM_ONLY source mode vehicles (got: ${hmRecord.sourceMode})`,
      );
    }
    if (hmRecord.registrationState === 'REGISTERED') {
      throw new ConflictException(
        `HM vehicle ${hmVehicleId} is already registered as SynqDrive vehicle ${hmRecord.synqdriveVehicleId}`,
      );
    }

    await assertHighMobilityTenantOperationalOrganization(
      this.prisma,
      organizationId,
      access.isMasterAdmin,
    );

    // Prevent duplicate VIN registration within this org
    const existingVehicle = await this.prisma.vehicle.findFirst({
      where: { vin: hmRecord.vin, organizationId },
    });
    if (existingVehicle) {
      throw new ConflictException(
        `A vehicle with VIN ${hmRecord.vin} already exists in organization ${organizationId}`,
      );
    }

    // Create the SynqDrive vehicle record
    const now = new Date();
    const fuelTypeEnum = this.normalizeFuelType(fuelType);

    let synqdriveVehicle: any;
    try {
      synqdriveVehicle = await this.prisma.$transaction(async (tx) => {
        // Create internal vehicle
        const vehicle = await tx.vehicle.create({
          data: {
            organizationId,
            vin: hmRecord.vin,
            make: hmRecord.brand,
            model: vehicleName?.trim() || `${hmRecord.brand} (HM_ONLY)`,
            year: 0, // Unknown until enriched
            vehicleName: vehicleName?.trim() || `${hmRecord.brand} ${hmRecord.vin.slice(-6)}`,
            licensePlate: licensePlate?.trim() || undefined,
            notes: notes?.trim() || 'Registered via High Mobility (HM_ONLY source mode)',
            mileageKm: mileageKm ?? 0,
            fuelType: fuelTypeEnum,
            vehicleType: vehicleType as any ?? 'SEDAN',
            status: 'AVAILABLE',
            registryLifecycle: 'ACTIVE',
            healthStatus: 'GOOD',
          } as any,
        });

        // Create data source link: HIGH_MOBILITY / HM_ONLY
        await tx.vehicleDataSourceLink.create({
          data: {
            vehicleId: vehicle.id,
            sourceType: 'HIGH_MOBILITY',
            sourceSubtype: 'HM_ONLY',
            sourceReferenceId: hmVehicleId,
            isActive: true,
            activatedAt: now,
            metadata: {
              packageType: hmRecord.packageType,
              sourceMode: 'HM_ONLY',
              vin: hmRecord.vin,
              brand: hmRecord.brand,
              registeredAt: now.toISOString(),
            },
          },
        });

        // Update HM vehicle record
        await tx.highMobilityVehicle.update({
          where: { id: hmVehicleId },
          data: {
            synqdriveVehicleId: vehicle.id,
            isLinked: true,
            linkedAt: now,
            registrationState: 'REGISTERED' as any,
            registeredAt: now,
          } as any,
        });

        // Write status history
        await tx.highMobilityStatusHistory.create({
          data: {
            highMobilityVehicleId: hmVehicleId,
            eventType: 'HM_ONLY_REGISTERED',
            oldStatus: hmRecord.registrationState,
            newStatus: 'REGISTERED',
            payloadJson: {
              synqdriveVehicleId: vehicle.id,
              organizationId,
              registeredAt: now.toISOString(),
            } as any,
          },
        });

        return vehicle;
      });
    } catch (err: any) {
      // Mark as failed if it wasn't a domain-level exception
      this.logger.error(`HM_ONLY registration failed for ${hmRecord.vin}: ${err?.message}`);
      try {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmVehicleId },
          data: { registrationState: 'REGISTRATION_FAILED' as any } as any,
        });
      } catch { /* best effort */ }
      throw err;
    }

    this.logger.log(
      `HM_ONLY vehicle registered: VIN=${hmRecord.vin} → SynqDrive vehicleId=${synqdriveVehicle.id}`,
    );

    return {
      success: true,
      synqdriveVehicleId: synqdriveVehicle.id,
      hmVehicleId,
      vin: hmRecord.vin,
      sourceMode: 'HM_ONLY',
      message: `Vehicle ${hmRecord.vin} registered as HM_ONLY source`,
    };
  }

  /**
   * Return available HM_ONLY candidates (approved, not yet registered) for a given VIN.
   * Used by the registration UI to show available registrations.
   */
  async getHmOnlyCandidates(
    tenantOrganizationId: string,
    isMasterAdmin: boolean,
    vin?: string,
  ): Promise<any[]> {
    const where: Record<string, unknown> = {
      sourceMode: 'HM_ONLY',
      isActive: true,
      clearanceStatus: 'APPROVED',
      registrationState: { in: ['NOT_REGISTERED', 'REGISTRATION_FAILED'] },
    };
    if (vin) where.vin = vin.toUpperCase();
    const orgScope = highMobilityRecordOrgWhere(tenantOrganizationId, isMasterAdmin);
    if (orgScope) where.AND = [orgScope];

    const rows = await this.prisma.highMobilityVehicle.findMany({
      where,
      orderBy: { clearanceApprovedAt: 'desc' },
    });
    if (isMasterAdmin) return rows;
    return rows.map((row) => ({
      id: row.id,
      vin: row.vin,
      brand: row.brand,
      packageType: row.packageType,
      sourceMode: row.sourceMode,
      clearanceStatus: row.clearanceStatus,
      registrationState: row.registrationState,
      organizationId: row.organizationId,
    }));
  }

  private normalizeFuelType(fuel?: string): string {
    if (!fuel) return 'OTHER';
    const m: Record<string, string> = {
      electric: 'ELECTRIC',
      gasoline: 'GASOLINE',
      diesel: 'DIESEL',
      hybrid: 'HYBRID',
      plugin_hybrid: 'PLUGIN_HYBRID',
      other: 'OTHER',
    };
    return m[fuel.toLowerCase()] ?? 'OTHER';
  }
}
