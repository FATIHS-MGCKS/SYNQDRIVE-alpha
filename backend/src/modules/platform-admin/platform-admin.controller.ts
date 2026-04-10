import { Controller, Get, Post, Patch, Body, Param, UseGuards, Query } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import { DimoAuthService } from '../dimo/dimo-auth.service';
import { PrismaService } from '@shared/database/prisma.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { TripEnrichmentOrchestratorService } from '../vehicle-intelligence/trips/trip-enrichment-orchestrator.service';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PlatformAdminController {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
    private readonly logbookService: VehicleLogbookService,
    private readonly dimoAuthService: DimoAuthService,
    private readonly prisma: PrismaService,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
  ) {}

  @Get('changelogs')
  async getChangelogs(@Query('module') module?: string) {
    return this.platformAdminService.getChangelogs(module);
  }

  @Post('changelogs')
  async createChangelog(@Body() body: any) {
    return this.platformAdminService.createChangelog(body);
  }

  @Post('prune')
  async pruneMasterData() {
    return this.platformAdminService.pruneMasterData();
  }

  @Get('dashboard')
  async getDashboard() {
    return this.platformAdminService.getDashboardStats();
  }

  @Get('stats/organizations')
  async getOrganizationStats() {
    return this.platformAdminService.getOrganizationStats();
  }

  @Get('stats/revenue')
  async getRevenueStats() {
    return this.platformAdminService.getRevenueStats();
  }

  @Get('monitoring/summary')
  async getMonitoringSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.platformAdminService.getMonitoringSummary({ from, to });
  }

  @Get('monitoring/poll-logs')
  async getMonitoringPollLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('jobType') jobType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.platformAdminService.getMonitoringPollLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      vehicleId,
      jobType,
      status,
      from,
      to,
    });
  }

  @Get('monitoring/workers')
  async getMonitoringWorkers(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.platformAdminService.getMonitoringWorkers({ from, to });
  }

  @Get('monitoring/alerts')
  async getMonitoringAlerts(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.platformAdminService.getMonitoringAlerts({ from, to });
  }

  @Get('monitoring/token-health')
  async getTokenHealth() {
    return this.dimoAuthService.getHealthSnapshot();
  }

  // ── V3: Hardware type bulk backfill ─────────────────────────────────────────
  // POST /admin/vehicles/hardware-backfill
  // Marks a list of existing vehicle IDs as LTE_R1 in bulk.
  // Use this to backfill eligible existing vehicles that were registered before
  // the hardwareType field was introduced in V3 (2026-03-31).
  // Only MASTER_ADMIN can call this endpoint (guard applied at class level).
  @Post('vehicles/hardware-backfill')
  async backfillHardwareType(
    @Body() body: { vehicleIds: string[]; hardwareType: 'LTE_R1' | 'SMART5' | 'UNKNOWN' },
  ) {
    if (!body.vehicleIds || body.vehicleIds.length === 0) {
      return { updated: 0, message: 'No vehicle IDs provided' };
    }
    const result = await this.prisma.vehicle.updateMany({
      where: { id: { in: body.vehicleIds } },
      data: { hardwareType: body.hardwareType },
    });
    return {
      updated: result.count,
      hardwareType: body.hardwareType,
      message: `${result.count} vehicle(s) updated to ${body.hardwareType}`,
    };
  }

  // GET /admin/vehicles/hardware-summary
  @Get('vehicles/hardware-summary')
  async getHardwareSummary() {
    const counts = await this.prisma.vehicle.groupBy({
      by: ['hardwareType'],
      _count: { hardwareType: true },
    });
    return counts.map((c) => ({ hardwareType: c.hardwareType, count: c._count.hardwareType }));
  }

  // ── Vehicle Logbook ───────────────────────────────────────────────────

  @Get('vehicle-logbook')
  async getLogbookVehicles() {
    return this.logbookService.getVehicleList();
  }

  @Post('vehicle-logbook/:vehicleId/enable')
  async enableLogbook(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { durationHours?: number; enabledBy?: string; notes?: string },
  ) {
    return this.logbookService.enableLogbook(vehicleId, body.durationHours ?? 24, body.enabledBy, body.notes);
  }

  @Post('vehicle-logbook/:vehicleId/disable')
  async disableLogbook(@Param('vehicleId') vehicleId: string) {
    return this.logbookService.disableLogbook(vehicleId);
  }

  @Get('vehicle-logbook/:vehicleId/detail')
  async getLogbookDetail(@Param('vehicleId') vehicleId: string) {
    return this.logbookService.getVehicleDetail(vehicleId);
  }

  // ── Trip Enrichment Backfill ────────────────────────────────────────────
  // POST /admin/trips/backfill-enrichment
  // Safe to call repeatedly — idempotent via status guards.
  @Post('trips/backfill-enrichment')
  async backfillTripEnrichment(
    @Query('vehicleId') vehicleId?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.enrichmentOrchestrator.backfillUnenrichedTrips(
      vehicleId,
      limit ? parseInt(limit, 10) : undefined,
    );
    return {
      ...result,
      message: `Backfill complete: ${result.enqueued} trips enqueued for enrichment`,
    };
  }
}
