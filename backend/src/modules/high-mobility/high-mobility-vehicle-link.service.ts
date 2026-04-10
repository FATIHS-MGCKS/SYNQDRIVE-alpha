import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { HmAvailabilityDto } from './dto/high-mobility.dto';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';

/**
 * Manages the link between a SynqDrive registered vehicle and an approved HM vehicle record.
 * Phase 1: HEALTH package only.
 * VIN-safe: prevents ambiguous or duplicate active links.
 */
@Injectable()
export class HighMobilityVehicleLinkService {
  private readonly logger = new Logger(HighMobilityVehicleLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmSignalUsage: HmSignalUsageService,
  ) {}

  /**
   * Check if a VIN has an approved HM HEALTH record available for linking.
   * Called from the vehicle register form to show/hide HM activation UI.
   */
  async checkAvailability(vin: string): Promise<HmAvailabilityDto> {
    const hmRecord = await this.prisma.highMobilityVehicle.findFirst({
      where: {
        vin,
        packageType: 'HEALTH',
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!hmRecord) {
      return {
        vin,
        available: false,
        packageType: null,
        clearanceStatus: null,
        hmVehicleId: null,
        isLinked: false,
        linkedVehicleId: null,
      };
    }

    return {
      vin,
      available: hmRecord.clearanceStatus === 'APPROVED',
      packageType: 'HEALTH',
      clearanceStatus: hmRecord.clearanceStatus as any,
      hmVehicleId: hmRecord.id,
      isLinked: hmRecord.isLinked,
      linkedVehicleId: hmRecord.synqdriveVehicleId ?? null,
    };
  }

  /**
   * Link an approved HM HEALTH vehicle record to a SynqDrive vehicle.
   * Creates a VehicleDataSourceLink record and updates the HM vehicle record.
   */
  async activateHealthLink(hmVehicleId: string, synqdriveVehicleId: string): Promise<void> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({
      where: { id: hmVehicleId },
    });
    if (!hmRecord) throw new NotFoundException(`HM vehicle ${hmVehicleId} not found`);

    if (hmRecord.clearanceStatus !== 'APPROVED') {
      throw new BadRequestException(
        `HM vehicle is not approved (status: ${hmRecord.clearanceStatus})`,
      );
    }

    // Prevent duplicate active links for this SynqDrive vehicle + HM_HEALTH
    const existingLink = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId: synqdriveVehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
    });
    if (existingLink) {
      throw new ConflictException(
        `Vehicle ${synqdriveVehicleId} already has an active HM Health link`,
      );
    }

    // Prevent one approved HM record being linked to multiple SynqDrive vehicles
    if (hmRecord.isLinked && hmRecord.synqdriveVehicleId && hmRecord.synqdriveVehicleId !== synqdriveVehicleId) {
      throw new ConflictException(
        `HM vehicle ${hmVehicleId} is already linked to SynqDrive vehicle ${hmRecord.synqdriveVehicleId}`,
      );
    }

    const now = new Date();

    await this.prisma.$transaction([
      // Create data source link
      this.prisma.vehicleDataSourceLink.create({
        data: {
          vehicleId: synqdriveVehicleId,
          sourceType: 'HIGH_MOBILITY',
          sourceSubtype: 'HM_HEALTH',
          sourceReferenceId: hmVehicleId,
          isActive: true,
          activatedAt: now,
          metadata: {
            packageType: 'HEALTH',
            sourceMode: hmRecord.sourceMode,
            vin: hmRecord.vin,
            brand: hmRecord.brand,
          },
        },
      }),
      // Update HM vehicle record
      this.prisma.highMobilityVehicle.update({
        where: { id: hmVehicleId },
        data: {
          isLinked: true,
          linkedAt: now,
          synqdriveVehicleId,
        },
      }),
    ]);

    // Write status history
    try {
      await this.prisma.highMobilityStatusHistory.create({
        data: {
          highMobilityVehicleId: hmVehicleId,
          eventType: 'LINKED',
          oldStatus: 'APPROVED',
          newStatus: 'APPROVED',
          payloadJson: { synqdriveVehicleId, linkedAt: now.toISOString() },
        },
      });
    } catch { /* non-critical */ }

    this.logger.log(
      `HM Health activated: HM vehicle ${hmVehicleId} → SynqDrive vehicle ${synqdriveVehicleId}`,
    );

    // Immediate signal fetch so health tiles are populated before the next scheduler tick
    void this.hmSignalUsage.refreshAllSignalGroupsInitial(synqdriveVehicleId).catch((e: Error) =>
      this.logger.warn(`Post-link HM signal refresh failed: ${e?.message}`),
    );
  }

  /**
   * Deactivate an HM Health link (e.g. when vehicle is deregistered).
   */
  async deactivateHealthLink(synqdriveVehicleId: string): Promise<void> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId: synqdriveVehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
    });
    if (!link) return;

    await this.prisma.vehicleDataSourceLink.update({
      where: { id: link.id },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    // Unlink from HM vehicle record
    await this.prisma.highMobilityVehicle.updateMany({
      where: { id: link.sourceReferenceId, synqdriveVehicleId },
      data: { isLinked: false },
    });

    this.logger.log(`HM Health deactivated for SynqDrive vehicle ${synqdriveVehicleId}`);
  }

  /** Get the active HM data source links for a SynqDrive vehicle */
  async getLinksForVehicle(synqdriveVehicleId: string) {
    return this.prisma.vehicleDataSourceLink.findMany({
      where: { vehicleId: synqdriveVehicleId, isActive: true, sourceType: 'HIGH_MOBILITY' },
    });
  }

  // ── Phase 2: Full Telemetry link ─────────────────────────────────────────

  /**
   * Link an approved FULL_TELEMETRY HM vehicle to an existing SynqDrive vehicle.
   * This prepares the telemetry streaming path but does NOT activate full downstream business logic.
   * DOMAIN RULE: streaming activation is a separate product decision; this is structural linkage only.
   */
  async linkFullTelemetry(hmVehicleId: string, synqdriveVehicleId: string): Promise<void> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hmRecord) throw new NotFoundException(`HM vehicle ${hmVehicleId} not found`);

    if (hmRecord.packageType !== 'FULL_TELEMETRY') {
      throw new BadRequestException(
        `linkFullTelemetry requires FULL_TELEMETRY package (got: ${hmRecord.packageType})`,
      );
    }
    if (hmRecord.clearanceStatus !== 'APPROVED') {
      throw new BadRequestException(
        `HM vehicle is not approved (status: ${hmRecord.clearanceStatus})`,
      );
    }

    const existingLink = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId: synqdriveVehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_FULL_TELEMETRY',
        isActive: true,
      },
    });
    if (existingLink) {
      throw new ConflictException(`Vehicle ${synqdriveVehicleId} already has an active HM Full Telemetry link`);
    }

    if (hmRecord.isLinked && hmRecord.synqdriveVehicleId && hmRecord.synqdriveVehicleId !== synqdriveVehicleId) {
      throw new ConflictException(
        `HM vehicle ${hmVehicleId} is already linked to SynqDrive vehicle ${hmRecord.synqdriveVehicleId}`,
      );
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.vehicleDataSourceLink.create({
        data: {
          vehicleId: synqdriveVehicleId,
          sourceType: 'HIGH_MOBILITY',
          sourceSubtype: 'HM_FULL_TELEMETRY',
          sourceReferenceId: hmVehicleId,
          isActive: true,
          activatedAt: now,
          metadata: {
            packageType: 'FULL_TELEMETRY',
            sourceMode: hmRecord.sourceMode,
            vin: hmRecord.vin,
            brand: hmRecord.brand,
            note: 'Phase 2: structural link — telemetry streaming not yet fully activated',
          },
        },
      }),
      this.prisma.highMobilityVehicle.update({
        where: { id: hmVehicleId },
        data: { isLinked: true, linkedAt: now, synqdriveVehicleId },
      }),
    ]);

    try {
      await this.prisma.highMobilityStatusHistory.create({
        data: {
          highMobilityVehicleId: hmVehicleId,
          eventType: 'FULL_TELEMETRY_LINKED',
          oldStatus: hmRecord.clearanceStatus,
          newStatus: 'APPROVED',
          payloadJson: {
            synqdriveVehicleId,
            linkedAt: now.toISOString(),
            note: 'Full Telemetry structural link — business activation deferred',
          } as any,
        },
      });
    } catch { /* non-critical */ }

    this.logger.log(
      `HM Full Telemetry linked (structural): HM vehicle ${hmVehicleId} → SynqDrive vehicle ${synqdriveVehicleId}`,
    );
  }
}
