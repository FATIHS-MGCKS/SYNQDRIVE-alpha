import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { HighMobilityEligibilityService } from './high-mobility-eligibility.service';
import { HighMobilityFleetService } from './high-mobility-fleet.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityMqttConsumerService } from './high-mobility-mqtt-consumer.service';
import { HighMobilityTelemetryIngestionService } from './high-mobility-telemetry-ingestion.service';
import type {
  CheckEligibilityDto,
  CreateHmVehicleDto,
  HmPackageType,
  HmClearanceStatus,
  HmSourceMode,
  HmEligibilityStatus,
  RegisterHmOnlyVehicleDto,
} from './dto/high-mobility.dto';

@Controller('admin/high-mobility')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class HighMobilityAdminController {
  constructor(
    private readonly eligibilityService: HighMobilityEligibilityService,
    private readonly fleetService: HighMobilityFleetService,
    private readonly vehicleLinkService: HighMobilityVehicleLinkService,
    private readonly healthFetchService: HighMobilityHealthFetchService,
    private readonly registrationService: HighMobilityRegistrationService,
    private readonly streamConfigService: HighMobilityStreamConfigService,
    private readonly mqttConsumerService: HighMobilityMqttConsumerService,
    private readonly ingestionService: HighMobilityTelemetryIngestionService,
  ) {}

  // ── Eligibility ────────────────────────────────────────────────────────────

  /** POST /api/v1/admin/high-mobility/eligibility/check */
  @Post('eligibility/check')
  async checkEligibility(@Body() body: CheckEligibilityDto) {
    if (!body.vin?.trim()) throw new BadRequestException('vin is required');
    if (!body.brand?.trim()) throw new BadRequestException('brand is required');
    return this.eligibilityService.checkEligibility({
      vin: body.vin.trim().toUpperCase(),
      brand: body.brand.trim(),
    });
  }

  /** GET /api/v1/admin/high-mobility/eligibility/:vin */
  @Get('eligibility/:vin')
  async getLastEligibility(@Param('vin') vin: string) {
    const result = await this.eligibilityService.getLastEligibility(vin.toUpperCase());
    return result ?? { vin, available: false, message: 'No eligibility check found for this VIN' };
  }

  // ── Vehicle list ───────────────────────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/vehicles */
  @Get('vehicles')
  async listVehicles(
    @Query('packageType') packageType?: HmPackageType,
    @Query('clearanceStatus') clearanceStatus?: HmClearanceStatus,
    @Query('sourceMode') sourceMode?: HmSourceMode,
    @Query('brand') brand?: string,
    @Query('eligibilityStatus') eligibilityStatus?: HmEligibilityStatus,
    @Query('linked') linked?: string,
    @Query('registrationState') registrationState?: string,
    @Query('streamingState') streamingState?: string,
  ) {
    return this.fleetService.listVehicles({
      packageType,
      clearanceStatus,
      sourceMode,
      brand,
      eligibilityStatus,
      ...(linked !== undefined ? { isLinked: linked === 'true' } : {}),
    });
  }

  /** GET /api/v1/admin/high-mobility/vehicles/:id */
  @Get('vehicles/:id')
  async getVehicle(@Param('id') id: string) {
    return this.fleetService.findById(id);
  }

  /** POST /api/v1/admin/high-mobility/vehicles */
  @Post('vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createVehicle(@Body() body: CreateHmVehicleDto) {
    if (!body.vin?.trim()) throw new BadRequestException('vin is required');
    if (!body.brand?.trim()) throw new BadRequestException('brand is required');
    if (!body.packageType) throw new BadRequestException('packageType is required');
    return this.fleetService.createVehicle({
      ...body,
      vin: body.vin.trim().toUpperCase(),
      brand: body.brand.trim(),
    });
  }

  /** POST /api/v1/admin/high-mobility/vehicles/:id/refresh-status */
  @Post('vehicles/:id/refresh-status')
  async refreshStatus(@Param('id') id: string) {
    return this.fleetService.refreshStatus(id);
  }

  /** DELETE /api/v1/admin/high-mobility/vehicles/:id */
  @Delete('vehicles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVehicle(@Param('id') id: string) {
    await this.fleetService.removeVehicle(id);
  }

  /** POST /api/v1/admin/high-mobility/vehicles/:id/fetch-health */
  @Post('vehicles/:id/fetch-health')
  async fetchHealth(@Param('id') id: string) {
    return this.healthFetchService.fetchHealth(id, 'MANUAL');
  }

  /** POST /api/v1/admin/high-mobility/vehicles/:id/link-to-vehicle */
  @Post('vehicles/:id/link-to-vehicle')
  async linkToVehicle(
    @Param('id') id: string,
    @Body() body: { synqdriveVehicleId: string },
  ) {
    if (!body.synqdriveVehicleId) throw new BadRequestException('synqdriveVehicleId is required');
    await this.vehicleLinkService.activateHealthLink(id, body.synqdriveVehicleId);
    return { success: true, message: 'HM Health activated for vehicle' };
  }

  // ── Phase 2: HM_ONLY vehicle registration ──────────────────────────────────

  /** POST /api/v1/admin/high-mobility/vehicles/:id/create-hm-only-vehicle */
  @Post('vehicles/:id/create-hm-only-vehicle')
  @HttpCode(HttpStatus.CREATED)
  async createHmOnlyVehicle(
    @Param('id') id: string,
    @Body() body: Omit<RegisterHmOnlyVehicleDto, 'hmVehicleId'>,
  ) {
    if (!body.organizationId) throw new BadRequestException('organizationId is required');
    return this.registrationService.registerHmOnlyVehicle({ ...body, hmVehicleId: id });
  }

  /** GET /api/v1/admin/high-mobility/vehicles/:id/streaming-readiness */
  @Get('vehicles/:id/streaming-readiness')
  async getStreamingReadiness(@Param('id') id: string) {
    return this.streamConfigService.getStreamingReadiness(id);
  }

  // ── Phase 2: Full Telemetry link ───────────────────────────────────────────

  /** POST /api/v1/admin/high-mobility/vehicles/:id/link-full-telemetry */
  @Post('vehicles/:id/link-full-telemetry')
  async linkFullTelemetry(
    @Param('id') id: string,
    @Body() body: { synqdriveVehicleId: string },
  ) {
    if (!body.synqdriveVehicleId) throw new BadRequestException('synqdriveVehicleId is required');
    await this.vehicleLinkService.linkFullTelemetry(id, body.synqdriveVehicleId);
    return {
      success: true,
      message: 'HM Full Telemetry structural link created (streaming activation deferred to Phase 3)',
    };
  }

  // ── Phase 2: MQTT streaming status ────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/stream/consumer-status */
  @Get('stream/consumer-status')
  async getConsumerStatus() {
    return this.streamConfigService.getConsumerStatus();
  }

  /** POST /api/v1/admin/high-mobility/stream/test-connection */
  @Post('stream/test-connection')
  async testMqttConnection() {
    return this.mqttConsumerService.testConnection();
  }

  // ── Phase 2: Stream logs ───────────────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/stream/logs */
  @Get('stream/logs')
  async getStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('hmVehicleId') hmVehicleId?: string,
    @Query('vin') vin?: string,
    @Query('ingestStatus') ingestStatus?: string,
  ) {
    return this.ingestionService.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      hmVehicleId,
      vin,
      ingestStatus,
    });
  }

  /** GET /api/v1/admin/high-mobility/stream/logs/:id */
  @Get('stream/logs/:id')
  async getStreamLogById(@Param('id') id: string) {
    const log = await this.ingestionService.getStreamLogById(id);
    if (!log) throw new BadRequestException(`Stream log ${id} not found`);
    return log;
  }

  // ── Status history ─────────────────────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/status-history/:vehicleId */
  @Get('status-history/:vehicleId')
  async getStatusHistory(@Param('vehicleId') vehicleId: string) {
    return this.fleetService.getStatusHistory(vehicleId);
  }

  // ── Phase 2: HM_ONLY candidates ───────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/candidates/hm-only */
  @Get('candidates/hm-only')
  async getHmOnlyCandidates(@Query('vin') vin?: string) {
    return this.registrationService.getHmOnlyCandidates(vin);
  }
}
