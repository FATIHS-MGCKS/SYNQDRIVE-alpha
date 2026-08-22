import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DashboardUtilizationService } from './dashboard-utilization.service';

@Controller('organizations/:orgId/dashboard/utilization')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DashboardUtilizationController {
  constructor(private readonly service: DashboardUtilizationService) {}

  @Get()
  @RequirePermission('dashboard', 'read')
  async getUtilizationOverview(
    @Param('orgId') orgId: string,
    @Query('year') yearRaw?: string,
    @Query('month') monthRaw?: string,
    @Query('stationId') stationId?: string,
  ) {
    const now = new Date();
    const year = yearRaw ? Number(yearRaw) : now.getUTCFullYear();
    const month = monthRaw ? Number(monthRaw) : now.getUTCMonth() + 1;

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return this.service.getOverview(orgId, now.getUTCFullYear(), now.getUTCMonth() + 1, stationId);
    }

    return this.service.getOverview(orgId, year, month, stationId);
  }
}
