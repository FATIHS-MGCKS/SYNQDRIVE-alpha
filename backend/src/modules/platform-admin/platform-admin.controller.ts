import { Controller, Get, Post, Patch, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import { DimoAuthService } from '../dimo/dimo-auth.service';
import { PrismaService } from '@shared/database/prisma.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { TripEnrichmentOrchestratorService } from '../vehicle-intelligence/trips/trip-enrichment-orchestrator.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { BatteryCapabilityRefreshService } from '../vehicle-intelligence/battery-health/capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityPreflightRepository } from '../vehicle-intelligence/battery-health/capability-preflight/battery-capability-preflight.repository';
import { BatteryCapabilityRefreshTrigger } from '../vehicle-intelligence/battery-health/capability-preflight/battery-capability-lifecycle.policy';

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
    private readonly audit: AuditService,
    private readonly batteryCapabilityRefresh: BatteryCapabilityRefreshService,
    private readonly batteryCapabilityRepository: BatteryCapabilityPreflightRepository,
  ) {}

  @Get('changelogs')
  async getChangelogs(@Query('module') module?: string) {
    return this.platformAdminService.getChangelogs(module);
  }

  @Post('changelogs')
  async createChangelog(@Body() body: any, @Req() req: any) {
    const result = await this.platformAdminService.createChangelog(body);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.CREATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Admin created changelog entry: ${body?.title ?? 'untitled'}`,
    });
    return result;
  }

  @Post('prune')
  async pruneMasterData(@Req() req: any) {
    void this.audit.critical({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.PRUNE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: 'Platform admin triggered pruneMasterData',
      changeSummary: 'Destructive: master data pruned',
    });
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

  @Get('monitoring/queues')
  async getMonitoringQueues() {
    return this.platformAdminService.getMonitoringQueues();
  }

  @Get('platform-health')
  async getPlatformHealth() {
    return this.platformAdminService.getPlatformHealth();
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
    @Req() req: any,
  ) {
    if (!body.vehicleIds || body.vehicleIds.length === 0) {
      return { updated: 0, message: 'No vehicle IDs provided' };
    }
    const result = await this.prisma.vehicle.updateMany({
      where: { id: { in: body.vehicleIds } },
      data: { hardwareType: body.hardwareType },
    });
    void this.audit.critical({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.BACKFILL,
      entity: ActivityEntity.VEHICLE,
      description: `Admin hardware backfill: ${result.count} vehicles → ${body.hardwareType}`,
      changeSummary: `hardwareType set to ${body.hardwareType} on ${result.count} vehicles`,
      metaJson: { vehicleIds: body.vehicleIds, hardwareType: body.hardwareType, updated: result.count },
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
    @Req() req: any,
  ) {
    const result = await this.logbookService.enableLogbook(vehicleId, body.durationHours ?? 24, body.enabledBy, body.notes);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.VEHICLE,
      entityId: vehicleId,
      description: `Admin enabled logbook for vehicle ${vehicleId} (${body.durationHours ?? 24}h)`,
    });
    return result;
  }

  @Post('vehicle-logbook/:vehicleId/disable')
  async disableLogbook(@Param('vehicleId') vehicleId: string, @Req() req: any) {
    const result = await this.logbookService.disableLogbook(vehicleId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.VEHICLE,
      entityId: vehicleId,
      description: `Admin disabled logbook for vehicle ${vehicleId}`,
    });
    return result;
  }

  @Get('vehicle-logbook/:vehicleId/detail')
  async getLogbookDetail(@Param('vehicleId') vehicleId: string) {
    return this.logbookService.getVehicleDetail(vehicleId);
  }

  // POST /admin/vehicles/:vehicleId/battery-capability-refresh
  @Post('vehicles/:vehicleId/battery-capability-refresh')
  async refreshBatteryCapability(
    @Param('vehicleId') vehicleId: string,
    @Req() req: any,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      return { enqueued: false, message: 'Vehicle not found' };
    }

    const jobId = await this.batteryCapabilityRefresh.enqueue({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      trigger: BatteryCapabilityRefreshTrigger.MANUAL_ADMIN,
    });

    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.VEHICLE,
      entityId: vehicleId,
      description: `Admin triggered battery capability refresh for vehicle ${vehicleId}`,
      metaJson: { jobId, trigger: BatteryCapabilityRefreshTrigger.MANUAL_ADMIN },
    });

    const capabilities = await this.batteryCapabilityRepository.listForVehicle(
      vehicle.organizationId,
      vehicle.id,
    );
    const changes = await this.batteryCapabilityRepository.listChangesForVehicle(
      vehicle.organizationId,
      vehicle.id,
      20,
    );

    return {
      enqueued: jobId != null,
      jobId,
      capabilityCount: capabilities.length,
      recentChanges: changes.length,
      message: jobId
        ? 'Battery capability refresh enqueued'
        : 'Refresh not enqueued (no DIMO token or queue unavailable)',
    };
  }

  // ── Trip Enrichment Backfill ────────────────────────────────────────────
  // POST /admin/trips/backfill-enrichment
  // Safe to call repeatedly — idempotent via status guards.
  @Post('trips/backfill-enrichment')
  async backfillTripEnrichment(
    @Query('vehicleId') vehicleId?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const result = await this.enrichmentOrchestrator.backfillUnenrichedTrips(
      vehicleId,
      limit ? parseInt(limit, 10) : undefined,
    );
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.BACKFILL,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: vehicleId,
      description: `Admin trip enrichment backfill: ${result.enqueued} trips enqueued`,
      changeSummary: `${result.enqueued} trips enqueued for enrichment`,
      metaJson: { vehicleId, limit, enqueued: result.enqueued },
    });
    return {
      ...result,
      message: `Backfill complete: ${result.enqueued} trips enqueued for enrichment`,
    };
  }
}
