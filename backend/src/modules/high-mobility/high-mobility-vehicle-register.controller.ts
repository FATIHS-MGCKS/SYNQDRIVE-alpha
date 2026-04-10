import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import type { RegisterHmOnlyVehicleDto } from './dto/high-mobility.dto';

/**
 * Register-flow integration endpoints.
 * Used by the vehicle registration form to detect + activate HM Health or register HM_ONLY vehicles.
 *
 * Phase 1: DIMO_PLUS_HM — detect approved HM HEALTH and activate link
 * Phase 2: HM_ONLY — register full internal vehicle from approved HM provider record
 */
@Controller('vehicles')
@UseGuards(RolesGuard)
export class HighMobilityVehicleRegisterController {
  constructor(
    private readonly vehicleLinkService: HighMobilityVehicleLinkService,
    private readonly registrationService: HighMobilityRegistrationService,
  ) {}

  // ── Phase 1: DIMO_PLUS_HM availability check ─────────────────────────────

  /** GET /api/v1/vehicles/register/high-mobility-availability?vin=... */
  @Get('register/high-mobility-availability')
  async checkAvailability(@Query('vin') vin: string) {
    if (!vin?.trim()) throw new BadRequestException('vin is required');
    return this.vehicleLinkService.checkAvailability(vin.trim().toUpperCase());
  }

  /** POST /api/v1/vehicles/:vehicleId/activate-high-mobility-health */
  @Post(':vehicleId/activate-high-mobility-health')
  async activateHmHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hmVehicleId: string },
  ) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    await this.vehicleLinkService.activateHealthLink(body.hmVehicleId, vehicleId);
    return { success: true, message: 'High Mobility Health activated' };
  }

  // ── Phase 2: Full Telemetry link ──────────────────────────────────────────

  /** POST /api/v1/vehicles/:vehicleId/link-high-mobility-full-telemetry */
  @Post(':vehicleId/link-high-mobility-full-telemetry')
  async linkFullTelemetry(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hmVehicleId: string },
  ) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    await this.vehicleLinkService.linkFullTelemetry(body.hmVehicleId, vehicleId);
    return {
      success: true,
      message: 'High Mobility Full Telemetry structural link created',
      note: 'Full streaming activation is deferred to Phase 3',
    };
  }

  // ── Phase 2: HM_ONLY vehicle registration ────────────────────────────────

  /**
   * POST /api/v1/vehicles/register/hm-only
   * Create a new internal SynqDrive vehicle from an approved HM_ONLY provider record.
   * No hardware (DIMO) is required or created.
   */
  @Post('register/hm-only')
  @HttpCode(HttpStatus.CREATED)
  async registerHmOnlyVehicle(@Body() body: RegisterHmOnlyVehicleDto) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    if (!body.organizationId) throw new BadRequestException('organizationId is required');
    return this.registrationService.registerHmOnlyVehicle(body);
  }

  /**
   * GET /api/v1/vehicles/register/hm-only-candidates?vin=...
   * List approved HM_ONLY records that have not yet been registered as internal vehicles.
   */
  @Get('register/hm-only-candidates')
  async getHmOnlyCandidates(@Query('vin') vin?: string) {
    return this.registrationService.getHmOnlyCandidates(vin);
  }
}
