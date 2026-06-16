import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrganizationInviteStatus } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { OrganizationInviteService } from './organization-invite.service';
import { CreateOrganizationInviteDto } from './dto/organization-invite.dto';

interface AuthedRequest {
  user?: {
    id?: string;
    platformRole?: string;
    membershipRole?: string;
  };
}

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/invites')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class OrganizationInvitesController {
  constructor(private readonly invites: OrganizationInviteService) {}

  @Get()
  @RequirePermission(USERS_MODULE, 'read')
  list(
    @Param('orgId') orgId: string,
    @Query('status') status?: OrganizationInviteStatus,
  ) {
    return this.invites.listInvites(orgId, status);
  }

  @Post()
  @RequirePermission(USERS_MODULE, 'write')
  create(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() body: CreateOrganizationInviteDto,
  ) {
    return this.invites.createInvite(orgId, body, req.user?.id ?? '', req.user ?? {});
  }

  @Post(':inviteId/resend')
  @RequirePermission(USERS_MODULE, 'manage')
  resend(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.invites.resendInvite(orgId, inviteId, req.user?.id ?? '');
  }

  @Delete(':inviteId')
  @RequirePermission(USERS_MODULE, 'manage')
  revoke(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.invites.revokeInvite(orgId, inviteId, req.user?.id);
  }
}
