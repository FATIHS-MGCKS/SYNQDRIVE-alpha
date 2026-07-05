import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DataAnalyseService } from './data-analyse.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_ANALYSE_MODULE } from './data-analyse.constants';

@Controller('organizations/:orgId/data-analyse')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataAnalyseController {
  constructor(private readonly service: DataAnalyseService) {}

  @Get('vehicles')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  listVehicles(@Param('orgId') orgId: string) {
    return this.service.listConnectedVehicles(orgId);
  }

  @Get('vehicles/:vehicleId/telemetry-overview')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  telemetryOverview(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.service.getTelemetryOverview(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/signals')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  signals(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.getSignals(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/high-frequency')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  highFrequency(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.service.getHighFrequency(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/launch-feasibility')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  launchFeasibility(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.service.getLaunchFeasibility(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/health-trace')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  healthTrace(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.getHealthTrace(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/pipeline')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  pipeline(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.getPipeline(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/event-architecture')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  eventArchitecture(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.service.getEventArchitecture(orgId, vehicleId);
  }

  @Get('vehicles/:vehicleId/device-connection-events')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  deviceConnectionEvents(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('debugRaw') debugRaw?: string,
  ) {
    return this.service.getDeviceConnectionEvents(orgId, vehicleId, {
      debugRaw: debugRaw === '1' || debugRaw === 'true',
    });
  }

  @Get('vehicles/:vehicleId/rpm-webhook-candidates')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  rpmWebhookCandidates(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.service.getRpmWebhookCandidates(orgId, vehicleId);
  }

  @Get('signal-groups')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  signalGroups(
    @Param('orgId') orgId: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    void orgId;
    if (vehicleId) {
      return this.service.getSignalGroupsForVehicle(orgId, vehicleId);
    }
    return this.service.getSignalGroups();
  }
}
