import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OperatorAuditService } from './operator-audit.service';

@Controller('organizations/:orgId/operator/audit-events')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class OperatorAuditController {
  constructor(private readonly operatorAudit: OperatorAuditService) {}

  @Get()
  @RequirePermission('bookings', 'read')
  list(
    @Param('orgId') orgId: string,
    @Query('bookingId') bookingId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.operatorAudit.listForOrganization(orgId, {
      bookingId: bookingId?.trim() || undefined,
      action: action?.trim() || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
