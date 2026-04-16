import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityEligibilityService } from './high-mobility-eligibility.service';
import { HighMobilityFleetService } from './high-mobility-fleet.service';
import {
  getOemPath,
  supportsEligibility,
  usesDirectFleetClearance,
  getOemRoutingNote,
  type HmOemPath,
} from './high-mobility-oem-routing';

/**
 * Composite HM state for a SynqDrive vehicle (used by Vehicle Edit / Detail page).
 * Derived from VehicleDataSourceLink + HighMobilityVehicle records.
 */
export type HmActivationState =
  | 'NOT_CONFIGURED'    // No HM record exists for this VIN
  | 'ELIGIBLE'          // Eligibility check passed, clearance not yet requested
  | 'CLEARANCE_PENDING' // Clearance submitted, waiting for provider approval
  | 'APPROVED'          // HM approved — can be linked/activated
  | 'LINKED_ACTIVE'     // HM Health is linked and active for this vehicle
  | 'REJECTED'          // Provider rejected the clearance
  | 'REVOKED'           // Clearance was revoked
  | 'ERROR';            // Error state — retry possible

export interface HmVehicleStatusDto {
  state: HmActivationState;
  hmVehicleId: string | null;
  vin: string;
  brand: string | null;
  clearanceStatus: string | null;
  eligibilityStatus: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  lastCheckedAt: string | null;
  canActivate: boolean;
  canDeactivate: boolean;
  canCheckEligibility: boolean;
  canRefresh: boolean;
  /** OEM onboarding path — determines whether eligibility must be checked first. */
  oemPath: HmOemPath;
  /** True when brand uses direct fleet clearance (VW Group, Porsche) and no HM record yet exists. */
  canRequestDirectClearance: boolean;
  /** Human-readable explanation for why eligibility is skipped. Null for eligibility-first brands. */
  routingNote: string | null;
}

/**
 * Facade service for High Mobility vehicle activation from Vehicle Detail / Edit pages.
 * Supports both newly registered and existing vehicles receiving HM retroactively.
 *
 * Architecture: delegates to existing VehicleLinkService, EligibilityService, FleetService.
 * Does NOT duplicate business logic — only orchestrates and exposes a clean status API.
 */
@Injectable()
export class HmVehicleActivationService {
  private readonly logger = new Logger(HmVehicleActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly linkService: HighMobilityVehicleLinkService,
    private readonly eligibilityService: HighMobilityEligibilityService,
    private readonly fleetService: HighMobilityFleetService,
  ) {}

  /**
   * Get composite HM status for a SynqDrive vehicle.
   * Reads from vehicle_data_source_links + high_mobility_vehicles.
   * Returns OEM-path-aware capabilities for the UI.
   */
  async getHmStatusForVehicle(vehicleId: string): Promise<HmVehicleStatusDto> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, vin: true, make: true },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);

    const vin = vehicle.vin;
    const brand = vehicle.make ?? '';
    const oemPath = getOemPath(brand);

    // Check for active HM_HEALTH data source link
    const activeLink = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
    });

    if (activeLink) {
      const hmRecord = await this.prisma.highMobilityVehicle.findUnique({
        where: { id: activeLink.sourceReferenceId },
        select: {
          id: true, vin: true, brand: true,
          clearanceStatus: true, eligibilityStatus: true,
          isLinked: true, linkedAt: true, clearanceLastCheckedAt: true,
        },
      });
      return {
        state: 'LINKED_ACTIVE',
        hmVehicleId: hmRecord?.id ?? activeLink.sourceReferenceId,
        vin: hmRecord?.vin ?? vin,
        brand: hmRecord?.brand ?? null,
        clearanceStatus: hmRecord?.clearanceStatus ?? null,
        eligibilityStatus: hmRecord?.eligibilityStatus ?? null,
        isLinked: true,
        linkedAt: activeLink.activatedAt.toISOString(),
        lastCheckedAt: hmRecord?.clearanceLastCheckedAt?.toISOString() ?? null,
        canActivate: false,
        canDeactivate: true,
        canCheckEligibility: false,
        canRefresh: true,
        oemPath,
        canRequestDirectClearance: false,
        routingNote: null,
      };
    }

    // No active link — look for HM record by VIN
    const availability = await this.linkService.checkAvailability(vin);

    if (!availability.available && !availability.hmVehicleId) {
      return this.buildNotConfiguredStatus(vin, brand, oemPath);
    }

    // HM record exists — get full details
    const hmRecord = availability.hmVehicleId
      ? await this.prisma.highMobilityVehicle.findUnique({
          where: { id: availability.hmVehicleId },
          select: {
            id: true, vin: true, brand: true,
            clearanceStatus: true, eligibilityStatus: true,
            isLinked: true, linkedAt: true, clearanceLastCheckedAt: true,
          },
        })
      : null;

    const clearanceStatus = hmRecord?.clearanceStatus ?? availability.clearanceStatus ?? null;
    const state = this.derivedState(clearanceStatus, availability.isLinked);

    return {
      state,
      hmVehicleId: availability.hmVehicleId,
      vin,
      brand: hmRecord?.brand ?? brand,
      clearanceStatus,
      eligibilityStatus: hmRecord?.eligibilityStatus ?? null,
      isLinked: availability.isLinked,
      linkedAt: hmRecord?.linkedAt?.toISOString() ?? null,
      lastCheckedAt: hmRecord?.clearanceLastCheckedAt?.toISOString() ?? null,
      canActivate: state === 'APPROVED' && !availability.isLinked,
      canDeactivate: availability.isLinked,
      // Eligibility check only available for brands that support it
      canCheckEligibility: supportsEligibility(brand) && (state === 'NOT_CONFIGURED' || state === 'ERROR'),
      canRefresh: !!availability.hmVehicleId && state !== 'NOT_CONFIGURED',
      oemPath,
      canRequestDirectClearance: false, // Record already exists
      routingNote: null,
    };
  }

  /**
   * Brand-aware eligibility check.
   *
   * For brands that support the HM Eligibility API (BMW, Mercedes, Toyota, etc.):
   *   → runs the eligibility check normally.
   *
   * For VW Group brands and Porsche:
   *   → returns a structured NOT_APPLICABLE response explaining the routing.
   *   → does NOT call the HM Eligibility API (which would fail / mislead).
   *   → instructs the caller to use requestDirectFleetClearance() instead.
   */
  async checkEligibilityForVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true, make: true },
    });
    if (!vehicle?.vin) throw new NotFoundException(`Vehicle ${vehicleId} has no VIN`);

    const brand = vehicle.make ?? '';

    if (!supportsEligibility(brand)) {
      const oemPath = getOemPath(brand);
      const note = getOemRoutingNote(brand);
      this.logger.log(
        `HM eligibility check skipped for VIN ${vehicle.vin} — brand "${brand}" uses ${oemPath} path`,
      );
      return {
        vin: vehicle.vin,
        brand,
        eligibilityStatus: 'NOT_APPLICABLE' as const,
        oemPath,
        routingNote: note ?? `Brand "${brand}" does not use the HM Eligibility API. Use direct fleet clearance instead.`,
        canRequestDirectClearance: usesDirectFleetClearance(brand),
        deliveryMode: null,
        capabilities: null,
        checkedAt: new Date().toISOString(),
        rawResponse: null,
      };
    }

    return this.eligibilityService.checkEligibility({ vin: vehicle.vin, brand });
  }

  /**
   * Request direct fleet clearance for VW Group / Porsche vehicles.
   * Skips the Eligibility API entirely and goes straight to fleet clearance activation.
   * Safe to call for any brand — returns an error for eligibility-first brands to prevent misuse.
   */
  async requestDirectFleetClearance(
    vehicleId: string,
  ): Promise<{ success: boolean; message: string; status?: HmVehicleStatusDto }> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true, make: true },
    });
    if (!vehicle?.vin) throw new NotFoundException(`Vehicle ${vehicleId} has no VIN`);

    const brand = vehicle.make ?? '';

    if (!usesDirectFleetClearance(brand)) {
      return {
        success: false,
        message: `Brand "${brand}" uses the ELIGIBILITY_FIRST path. Use checkEligibility instead.`,
      };
    }

    // Guard: prevent duplicate HM records
    const existing = await this.prisma.highMobilityVehicle.findFirst({
      where: { vin: vehicle.vin, packageType: 'HEALTH', sourceMode: 'DIMO_PLUS_HM', isActive: true },
    });
    if (existing) {
      this.logger.log(
        `Direct clearance requested for ${vehicle.vin} but HM record ${existing.id} already exists — returning current status`,
      );
      const current = await this.getHmStatusForVehicle(vehicleId);
      return {
        success: true,
        message: 'Fleet clearance record already exists. Returning current status.',
        status: current,
      };
    }

    this.logger.log(
      `Starting direct fleet clearance for VIN ${vehicle.vin} brand=${brand} (${getOemPath(brand)} path)`,
    );

    // Create HM vehicle record + trigger clearance request in one call
    try {
      await this.fleetService.createVehicle({
        vin: vehicle.vin,
        brand,
        packageType: 'HEALTH',
        sourceMode: 'DIMO_PLUS_HM',
      });
    } catch (err: any) {
      if (err?.status === 409 || err?.message?.includes('already exists')) {
        this.logger.log(`HM record conflict for ${vehicle.vin} — reading current status`);
      } else {
        this.logger.error(`Direct clearance failed for ${vehicle.vin}: ${err?.message}`);
        return { success: false, message: `Fleet clearance request failed: ${err?.message}` };
      }
    }

    const updatedStatus = await this.getHmStatusForVehicle(vehicleId);
    return {
      success: true,
      message: 'Fleet clearance request submitted. Waiting for provider approval.',
      status: updatedStatus,
    };
  }

  /**
   * Activate HM Health for an existing SynqDrive vehicle.
   * Finds the approved HM record by VIN and creates the data source link.
   */
  async activateHmHealth(vehicleId: string): Promise<{ success: boolean; message: string }> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true },
    });
    if (!vehicle?.vin) throw new NotFoundException(`Vehicle ${vehicleId} has no VIN`);

    const availability = await this.linkService.checkAvailability(vehicle.vin);
    if (!availability.available || !availability.hmVehicleId) {
      return { success: false, message: 'No approved High Mobility record found for this VIN' };
    }
    if (availability.isLinked) {
      return { success: false, message: 'High Mobility Health is already linked for this vehicle' };
    }

    await this.linkService.activateHealthLink(availability.hmVehicleId, vehicleId);
    this.logger.log(`HM Health activated for vehicle ${vehicleId} via VIN ${vehicle.vin}`);
    return { success: true, message: 'High Mobility Health successfully activated' };
  }

  /**
   * Refresh HM clearance status for the linked HM record.
   */
  async refreshHmStatus(vehicleId: string): Promise<HmVehicleStatusDto> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true },
    });
    if (!vehicle?.vin) throw new NotFoundException(`Vehicle ${vehicleId} has no VIN`);

    const availability = await this.linkService.checkAvailability(vehicle.vin);
    if (availability.hmVehicleId) {
      try {
        await this.fleetService.refreshStatus(availability.hmVehicleId);
      } catch (err: any) {
        this.logger.warn(`HM status refresh failed for vehicle ${vehicleId}: ${err?.message}`);
      }
    }

    return this.getHmStatusForVehicle(vehicleId);
  }

  /**
   * Deactivate HM Health link for a vehicle.
   */
  async deactivateHmHealth(vehicleId: string): Promise<{ success: boolean; message: string }> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId, sourceType: 'HIGH_MOBILITY', sourceSubtype: 'HM_HEALTH', isActive: true },
    });
    if (!link) {
      return { success: false, message: 'No active High Mobility Health link found' };
    }

    await this.linkService.deactivateHealthLink(vehicleId);
    this.logger.log(`HM Health deactivated for vehicle ${vehicleId}`);
    return { success: true, message: 'High Mobility Health deactivated' };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private derivedState(clearanceStatus: string | null, isLinked: boolean): HmActivationState {
    if (isLinked) return 'LINKED_ACTIVE';
    switch (clearanceStatus) {
      case 'APPROVED':           return 'APPROVED';
      case 'CLEARANCE_PENDING':  return 'CLEARANCE_PENDING';
      case 'ELIGIBLE':           return 'ELIGIBLE';
      case 'REJECTED':           return 'REJECTED';
      case 'REVOKED':            return 'REVOKED';
      case 'ERROR':              return 'ERROR';
      default:                   return 'NOT_CONFIGURED';
    }
  }

  private buildNotConfiguredStatus(vin: string, brand: string, oemPath: HmOemPath): HmVehicleStatusDto {
    const directClearance = usesDirectFleetClearance(brand);
    return {
      state: 'NOT_CONFIGURED',
      hmVehicleId: null,
      vin,
      brand,
      clearanceStatus: null,
      eligibilityStatus: null,
      isLinked: false,
      linkedAt: null,
      lastCheckedAt: null,
      canActivate: false,
      canDeactivate: false,
      // Eligibility check only valid for brands that support it
      canCheckEligibility: supportsEligibility(brand),
      canRefresh: false,
      oemPath,
      // Direct clearance button shown for VW Group / Porsche when no record exists
      canRequestDirectClearance: directClearance,
      routingNote: getOemRoutingNote(brand),
    };
  }
}
