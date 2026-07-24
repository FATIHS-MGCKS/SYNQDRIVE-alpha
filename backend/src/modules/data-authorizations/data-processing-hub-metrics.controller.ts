import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from './privacy-domain/review-workflow/data-processing-permission.service';
import { DataProcessingHubMetricsService } from './data-processing-hub-metrics.service';

@ApiTags('data-authorizations/hub-metrics')
@Controller('organizations/:orgId/data-authorizations/hub-metrics')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataProcessingHubMetricsController {
  constructor(
    private readonly metrics: DataProcessingHubMetricsService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Get()
  async get(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_view');
    return this.metrics.getMetrics(orgId);
  }
}
