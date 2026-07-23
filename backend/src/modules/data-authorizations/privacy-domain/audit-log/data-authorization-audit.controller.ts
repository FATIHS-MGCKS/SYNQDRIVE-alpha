import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthorizationDecisionEventType } from '@prisma/client';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../review-workflow/data-processing-permission.service';
import { DataAuthorizationAuditService } from './data-authorization-audit.service';

@ApiTags('data-authorizations/audit')
@Controller('organizations/:orgId/data-authorizations/audit')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataAuthorizationAuditController {
  constructor(
    private readonly auditService: DataAuthorizationAuditService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id ?? 'system', platformRole: user?.platformRole };
  }

  @Get('authorization-decisions')
  async listAuthorizationDecisions(
    @Param('orgId') orgId: string,
    @Req() req: Request,
    @Query('eventType') eventType?: AuthorizationDecisionEventType,
    @Query('correlationId') correlationId?: string,
    @Query('dataCategory') dataCategory?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.audit_view');

    return this.auditService.listAuthorizationDecisions({
      organizationId: orgId,
      eventType,
      correlationId,
      dataCategory,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('outbox/backlog')
  async outboxBacklog(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.audit_view');
    const count = await this.auditService.getOutboxBacklog(orgId);
    return { organizationId: orgId, backlog: count };
  }
}
