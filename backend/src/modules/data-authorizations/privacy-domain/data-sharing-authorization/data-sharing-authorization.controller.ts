import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_AUTH_MODULE } from '../../data-authorization.constants';
import {
  AuthorizeDataSharingDto,
  CreateDataSharingAuthorizationDto,
  RevokeDataSharingAuthorizationDto,
} from './dto/data-sharing-authorization.dto';
import { DataSharingAuthorizationService } from './data-sharing-authorization.service';

interface AuthedRequest {
  user?: { id?: string };
}

@Controller('organizations/:orgId/processing-activities/:activityId/data-sharing-authorizations')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataSharingAuthorizationController {
  constructor(private readonly service: DataSharingAuthorizationService) {}

  @Get()
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  list(@Param('orgId') orgId: string, @Param('activityId') activityId: string) {
    return this.service.listByActivity(orgId, activityId);
  }

  @Get(':authorizationId')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  get(
    @Param('orgId') orgId: string,
    @Param('authorizationId') authorizationId: string,
  ) {
    return this.service.findById(orgId, authorizationId);
  }

  @Post()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() body: CreateDataSharingAuthorizationDto,
  ) {
    return this.service.create(orgId, activityId, body);
  }

  @Post(':authorizationId/authorize')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  authorize(
    @Param('orgId') orgId: string,
    @Param('authorizationId') authorizationId: string,
    @Body() body: AuthorizeDataSharingDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.authorize(orgId, authorizationId, body, req.user.id);
  }

  @Post(':authorizationId/revoke')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  revoke(
    @Param('orgId') orgId: string,
    @Param('authorizationId') authorizationId: string,
    @Body() body: RevokeDataSharingAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.revoke(orgId, authorizationId, body, req.user.id);
  }
}
