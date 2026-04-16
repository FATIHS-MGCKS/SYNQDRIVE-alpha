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
import { HighMobilityTelemetryAppFleetService } from './high-mobility-telemetry-app-fleet.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityHealthAppMqttConsumerService } from './high-mobility-health-app-mqtt-consumer.service';
import { HighMobilityTelemetryAppMqttConsumerService } from './high-mobility-telemetry-app-mqtt-consumer.service';
import { HighMobilityHealthAppIngestionService } from './high-mobility-health-app-ingestion.service';
import { HighMobilityTelemetryAppIngestionService } from './high-mobility-telemetry-app-ingestion.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
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
    // HM Health-APP fleet (HEALTH package, DIMO+HM)
    private readonly healthFleetService: HighMobilityFleetService,
    // HM Telemetry-APP fleet (FULL_TELEMETRY package)
    private readonly telemetryFleetService: HighMobilityTelemetryAppFleetService,
    private readonly vehicleLinkService: HighMobilityVehicleLinkService,
    private readonly healthFetchService: HighMobilityHealthFetchService,
    private readonly registrationService: HighMobilityRegistrationService,
    private readonly streamConfigService: HighMobilityStreamConfigService,
    private readonly healthMqttConsumer: HighMobilityHealthAppMqttConsumerService,
    private readonly telemetryMqttConsumer: HighMobilityTelemetryAppMqttConsumerService,
    private readonly healthIngestion: HighMobilityHealthAppIngestionService,
    private readonly telemetryIngestion: HighMobilityTelemetryAppIngestionService,
    private readonly hmConfig: HighMobilityAppConfigService,
  ) {}

  // ── System readiness ───────────────────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/readiness */
  @Get('readiness')
  getReadiness() {
    return {
      healthApp: {
        oauthReady: this.hmConfig.isHealthAppOAuthReady(),
        mqttReady: this.hmConfig.isHealthAppMqttReady(),
        mqttConnectionState: this.healthMqttConsumer.getConnectionState(),
      },
      telemetryApp: {
        oauthReady: this.hmConfig.isTelemetryAppOAuthReady(),
        mqttReady: this.hmConfig.isTelemetryAppMqttReady(),
        mqttConnectionState: this.telemetryMqttConsumer.getConnectionState(),
      },
    };
  }

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

  // ── HM Health-APP vehicles ─────────────────────────────────────────────────

  /** GET /api/v1/admin/high-mobility/health-app/vehicles */
  @Get('health-app/vehicles')
  async listHealthAppVehicles(
    @Query('clearanceStatus') clearanceStatus?: HmClearanceStatus,
    @Query('sourceMode') sourceMode?: HmSourceMode,
    @Query('brand') brand?: string,
    @Query('eligibilityStatus') eligibilityStatus?: HmEligibilityStatus,
    @Query('linked') linked?: string,
  ) {
    return this.healthFleetService.listVehicles({
      packageType: 'HEALTH',
      clearanceStatus,
      sourceMode,
      brand,
      eligibilityStatus,
      ...(linked !== undefined ? { isLinked: linked === 'true' } : {}),
    });
  }

  /** POST /api/v1/admin/high-mobility/health-app/vehicles */
  @Post('health-app/vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createHealthAppVehicle(@Body() body: CreateHmVehicleDto) {
    if (!body.vin?.trim()) throw new BadRequestException('vin is required');
    if (!body.brand?.trim()) throw new BadRequestException('brand is required');
    return this.healthFleetService.createVehicle({
      ...body,
      packageType: 'HEALTH',
      vin: body.vin.trim().toUpperCase(),
      brand: body.brand.trim(),
    });
  }

  /** POST /api/v1/admin/high-mobility/health-app/vehicles/:id/refresh-status */
  @Post('health-app/vehicles/:id/refresh-status')
  async refreshHealthAppVehicleStatus(@Param('id') id: string) {
    return this.healthFleetService.refreshStatus(id);
  }

  /** DELETE /api/v1/admin/high-mobility/health-app/vehicles/:id */
  @Delete('health-app/vehicles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeHealthAppVehicle(@Param('id') id: string) {
    await this.healthFleetService.removeVehicle(id);
  }

  /** POST /api/v1/admin/high-mobility/health-app/vehicles/:id/fetch-health */
  @Post('health-app/vehicles/:id/fetch-health')
  async fetchHealthSignals(@Param('id') id: string) {
    return this.healthFetchService.fetchHealth(id, 'MANUAL');
  }

  /** POST /api/v1/admin/high-mobility/health-app/vehicles/:id/link-to-vehicle */
  @Post('health-app/vehicles/:id/link-to-vehicle')
  async linkHealthAppToVehicle(
    @Param('id') id: string,
    @Body() body: { synqdriveVehicleId: string },
  ) {
    if (!body.synqdriveVehicleId) throw new BadRequestException('synqdriveVehicleId is required');
    await this.vehicleLinkService.activateHealthLink(id, body.synqdriveVehicleId);
    return { success: true, message: 'HM Health-APP activated for vehicle' };
  }

  /** GET /api/v1/admin/high-mobility/health-app/stream/consumer-status */
  @Get('health-app/stream/consumer-status')
  async getHealthAppConsumerStatus() {
    return this.streamConfigService.getConsumerStatus('healthApp');
  }

  /** POST /api/v1/admin/high-mobility/health-app/stream/test-connection */
  @Post('health-app/stream/test-connection')
  async testHealthAppMqttConnection() {
    return this.healthMqttConsumer.testConnection();
  }

  /** GET /api/v1/admin/high-mobility/health-app/stream/logs */
  @Get('health-app/stream/logs')
  async getHealthAppStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('hmVehicleId') hmVehicleId?: string,
    @Query('vin') vin?: string,
    @Query('ingestStatus') ingestStatus?: string,
  ) {
    return this.healthIngestion.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      hmVehicleId, vin, ingestStatus,
    });
  }

  // ── HM Telemetry-APP vehicles ──────────────────────────────────────────────

  /**
   * GET /api/v1/admin/high-mobility/telemetry-app/candidates
   * Returns APPROVED HM Telemetry-APP vehicles awaiting SynqDrive registration.
   * Used by the "HM Telemetry" tab in the master non-registered vehicle view.
   */
  @Get('telemetry-app/candidates')
  async listTelemetryAppCandidates() {
    return this.telemetryFleetService.listApprovedCandidates();
  }

  /** GET /api/v1/admin/high-mobility/telemetry-app/vehicles */
  @Get('telemetry-app/vehicles')
  async listTelemetryAppVehicles(
    @Query('clearanceStatus') clearanceStatus?: HmClearanceStatus,
  ) {
    return this.telemetryFleetService.listCandidates({ clearanceStatus });
  }

  /** POST /api/v1/admin/high-mobility/telemetry-app/vehicles */
  @Post('telemetry-app/vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createTelemetryAppVehicle(@Body() body: { vin: string; brand: string; organizationId?: string }) {
    if (!body.vin?.trim()) throw new BadRequestException('vin is required');
    if (!body.brand?.trim()) throw new BadRequestException('brand is required');
    return this.telemetryFleetService.createVehicle({
      ...body,
      vin: body.vin.trim().toUpperCase(),
      brand: body.brand.trim(),
    });
  }

  /** GET /api/v1/admin/high-mobility/telemetry-app/vehicles/:id */
  @Get('telemetry-app/vehicles/:id')
  async getTelemetryAppVehicle(@Param('id') id: string) {
    return this.telemetryFleetService.findById(id);
  }

  /** POST /api/v1/admin/high-mobility/telemetry-app/vehicles/:id/refresh-status */
  @Post('telemetry-app/vehicles/:id/refresh-status')
  async refreshTelemetryAppVehicleStatus(@Param('id') id: string) {
    return this.telemetryFleetService.refreshStatus(id);
  }

  /** GET /api/v1/admin/high-mobility/telemetry-app/vehicles/:id/streaming-readiness */
  @Get('telemetry-app/vehicles/:id/streaming-readiness')
  async getTelemetryAppStreamingReadiness(@Param('id') id: string) {
    return this.streamConfigService.getStreamingReadiness(id, 'telemetryApp');
  }

  /** GET /api/v1/admin/high-mobility/telemetry-app/stream/consumer-status */
  @Get('telemetry-app/stream/consumer-status')
  async getTelemetryAppConsumerStatus() {
    return this.streamConfigService.getConsumerStatus('telemetryApp');
  }

  /** POST /api/v1/admin/high-mobility/telemetry-app/stream/test-connection */
  @Post('telemetry-app/stream/test-connection')
  async testTelemetryAppMqttConnection() {
    return this.telemetryMqttConsumer.testConnection();
  }

  /** GET /api/v1/admin/high-mobility/telemetry-app/stream/logs */
  @Get('telemetry-app/stream/logs')
  async getTelemetryAppStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('hmVehicleId') hmVehicleId?: string,
    @Query('vin') vin?: string,
    @Query('ingestStatus') ingestStatus?: string,
  ) {
    return this.telemetryIngestion.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      hmVehicleId, vin, ingestStatus,
    });
  }

  // ── Legacy + shared endpoints ──────────────────────────────────────────────

  /**
   * GET /api/v1/admin/high-mobility/vehicles
   * Legacy: returns combined list. Prefer /health-app/vehicles or /telemetry-app/vehicles.
   */
  @Get('vehicles')
  async listVehicles(
    @Query('packageType') packageType?: HmPackageType,
    @Query('clearanceStatus') clearanceStatus?: HmClearanceStatus,
    @Query('sourceMode') sourceMode?: HmSourceMode,
    @Query('brand') brand?: string,
    @Query('eligibilityStatus') eligibilityStatus?: HmEligibilityStatus,
    @Query('linked') linked?: string,
  ) {
    return this.healthFleetService.listVehicles({
      packageType,
      clearanceStatus,
      sourceMode,
      brand,
      eligibilityStatus,
      ...(linked !== undefined ? { isLinked: linked === 'true' } : {}),
    });
  }

  @Get('vehicles/:id')
  async getVehicle(@Param('id') id: string) {
    return this.healthFleetService.findById(id);
  }

  @Post('vehicles')
  @HttpCode(HttpStatus.CREATED)
  async createVehicle(@Body() body: CreateHmVehicleDto) {
    if (!body.vin?.trim()) throw new BadRequestException('vin is required');
    if (!body.brand?.trim()) throw new BadRequestException('brand is required');
    if (!body.packageType) throw new BadRequestException('packageType is required');
    return this.healthFleetService.createVehicle({
      ...body,
      vin: body.vin.trim().toUpperCase(),
      brand: body.brand.trim(),
    });
  }

  @Post('vehicles/:id/refresh-status')
  async refreshStatus(@Param('id') id: string) {
    return this.healthFleetService.refreshStatus(id);
  }

  @Delete('vehicles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVehicle(@Param('id') id: string) {
    await this.healthFleetService.removeVehicle(id);
  }

  @Post('vehicles/:id/fetch-health')
  async fetchHealth(@Param('id') id: string) {
    return this.healthFetchService.fetchHealth(id, 'MANUAL');
  }

  @Post('vehicles/:id/link-to-vehicle')
  async linkToVehicle(@Param('id') id: string, @Body() body: { synqdriveVehicleId: string }) {
    if (!body.synqdriveVehicleId) throw new BadRequestException('synqdriveVehicleId is required');
    await this.vehicleLinkService.activateHealthLink(id, body.synqdriveVehicleId);
    return { success: true, message: 'HM Health-APP activated for vehicle' };
  }

  @Post('vehicles/:id/create-hm-only-vehicle')
  @HttpCode(HttpStatus.CREATED)
  async createHmOnlyVehicle(
    @Param('id') id: string,
    @Body() body: Omit<RegisterHmOnlyVehicleDto, 'hmVehicleId'>,
  ) {
    if (!body.organizationId) throw new BadRequestException('organizationId is required');
    return this.registrationService.registerHmOnlyVehicle({ ...body, hmVehicleId: id });
  }

  @Get('vehicles/:id/streaming-readiness')
  async getStreamingReadiness(@Param('id') id: string) {
    return this.streamConfigService.getStreamingReadiness(id, 'healthApp');
  }

  @Post('vehicles/:id/link-full-telemetry')
  async linkFullTelemetry(@Param('id') id: string, @Body() body: { synqdriveVehicleId: string }) {
    if (!body.synqdriveVehicleId) throw new BadRequestException('synqdriveVehicleId is required');
    await this.vehicleLinkService.linkFullTelemetry(id, body.synqdriveVehicleId);
    return { success: true, message: 'HM Telemetry-APP structural link created' };
  }

  @Get('stream/consumer-status')
  async getConsumerStatus() {
    return this.streamConfigService.getConsumerStatus('healthApp');
  }

  @Post('stream/test-connection')
  async testMqttConnection() {
    return this.healthMqttConsumer.testConnection();
  }

  @Get('stream/logs')
  async getStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('hmVehicleId') hmVehicleId?: string,
    @Query('vin') vin?: string,
    @Query('ingestStatus') ingestStatus?: string,
  ) {
    return this.healthIngestion.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      hmVehicleId, vin, ingestStatus,
    });
  }

  @Get('status-history/:vehicleId')
  async getStatusHistory(@Param('vehicleId') vehicleId: string) {
    return this.healthFleetService.getStatusHistory(vehicleId);
  }

  @Get('candidates/hm-only')
  async getHmOnlyCandidates(@Query('vin') vin?: string) {
    return this.registrationService.getHmOnlyCandidates(vin);
  }
}
