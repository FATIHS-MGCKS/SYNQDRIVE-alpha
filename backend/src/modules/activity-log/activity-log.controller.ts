import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ActivityLogService } from './activity-log.service';
import {
  ActivityLogExportQuery,
  ActivityLogExportService,
} from './activity-log-export.service';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { PaginationParams } from '@shared/utils/pagination';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
} from './master-admin-audit.util';

@Controller()
@UseGuards(RolesGuard)
export class ActivityLogController {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly exportService: ActivityLogExportService,
    private readonly masterAdminAudit: MasterAdminAuditService,
  ) {}

  @Get('admin/activity-log')
  @Roles('MASTER_ADMIN')
  async findAll(
    @Query() query: PaginationParams & { entity?: string; action?: string; organizationId?: string },
  ) {
    return this.activityLogService.findAll(query);
  }

  @Get('admin/activity-log/export')
  @UseGuards(MasterAdminMfaGuard)
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_AUDIT_EXPORT)
  @Roles('MASTER_ADMIN')
  async exportAll(
    @Query() query: ActivityLogExportQuery,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportService.export(query);
    const correlationId = resolveCorrelationId(req);

    void this.masterAdminAudit.record({
      auditAction: MasterAdminAuditAction.AUDIT_EXPORT,
      actorUserId: req.user?.id,
      actorPlatformRole: req.user?.platformRole ?? null,
      actorPermissions: req.user?.platformPermissions ?? [],
      targetOrganizationId: query.organizationId ?? null,
      description: `Exported ${result.rowCount} audit log rows as ${result.format}`,
      correlationId,
      route: buildPrivilegedRouteLabel(req),
      httpMethod: 'GET',
      httpStatus: 200,
      ipAddress: req.ip ?? req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      after: {
        format: result.format,
        rowCount: result.rowCount,
        filters: {
          organizationId: query.organizationId ?? null,
          entity: query.entity ?? null,
          action: query.action ?? null,
          level: query.level ?? null,
          auditDomain: query.auditDomain ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
        },
      },
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('X-Export-Row-Count', String(result.rowCount));
    return result.body;
  }

  @Get('organizations/:orgId/activity-log')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_ROLES_MODULE, 'read')
  async findByOrganization(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams & { entity?: string; action?: string },
  ) {
    return this.activityLogService.findByOrganization(orgId, query);
  }
}
