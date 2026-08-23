import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationAiActivityService } from './communication-ai-activity.service';
import { CommunicationAiActivityListQueryDto } from './dto/communication-ai-activity-query.dto';

interface AuthUser {
  id: string;
}

@Controller('organizations/:orgId/communication')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationAiActivityController {
  constructor(private readonly aiActivityService: CommunicationAiActivityService) {}

  @Get('ai-activity')
  @RequireCommunicationPermission('read')
  listAiActivity(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: CommunicationAiActivityListQueryDto,
  ) {
    return this.aiActivityService.listAiActivity(orgId, user?.id, query);
  }
}
