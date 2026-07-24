import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { DenySwitchService } from './deny-switch.service';

@ApiTags('data-authorizations/deny-switch')
@Controller('organizations/:orgId/data-authorizations/deny-switch')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DenySwitchController {
  constructor(
    private readonly denySwitch: DenySwitchService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id ?? 'system', platformRole: user?.platformRole };
  }

  @Get()
  async listActive(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.deny_switch_view');
    const rows = await this.denySwitch.listForOrganization(orgId);
    return {
      organizationId: orgId,
      activeCount: rows.length,
      switches: rows.map((row) => ({
        id: row.id,
        scopeType: row.scopeType,
        scopeEntityId: row.scopeEntityId,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        trigger: row.trigger,
        sequence: row.sequence.toString(),
        blocksIngest: row.blocksIngest,
        blocksRead: row.blocksRead,
        blocksQueueEnqueue: row.blocksQueueEnqueue,
        activatedAt: row.activatedAt,
        correlationId: row.correlationId,
      })),
    };
  }

  @Get('metrics')
  async getMetrics(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.deny_switch_view');
    return {
      organizationId: orgId,
      ...this.denySwitch.getMetricsSnapshot(),
    };
  }
}
