import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { PaginationParams } from '@shared/utils/pagination';

@Controller()
@UseGuards(RolesGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get('admin/activity-log')
  @Roles('MASTER_ADMIN')
  async findAll(
    @Query() query: PaginationParams & { entity?: string; action?: string },
  ) {
    return this.activityLogService.findAll(query);
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
