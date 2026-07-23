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
  ActivateProviderAccessGrantDto,
  CreateProviderAccessGrantDto,
  RevokeProviderAccessGrantDto,
} from './dto/provider-access-grant.dto';
import { ProviderAccessGrantService } from './provider-access-grant.service';

interface AuthedRequest {
  user?: { id?: string };
}

@Controller('organizations/:orgId/provider-access-grants')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ProviderAccessGrantController {
  constructor(private readonly service: ProviderAccessGrantService) {}

  @Get(':grantId')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  get(@Param('orgId') orgId: string, @Param('grantId') grantId: string) {
    return this.service.findById(orgId, grantId);
  }

  @Post()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  create(
    @Param('orgId') orgId: string,
    @Body() body: CreateProviderAccessGrantDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.create(orgId, body, req.user?.id);
  }

  @Post(':grantId/activate')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  activate(
    @Param('orgId') orgId: string,
    @Param('grantId') grantId: string,
    @Body() body: ActivateProviderAccessGrantDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.activate(orgId, grantId, body, req.user.id);
  }

  @Post(':grantId/revoke')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  revoke(
    @Param('orgId') orgId: string,
    @Param('grantId') grantId: string,
    @Body() body: RevokeProviderAccessGrantDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.service.revoke(orgId, grantId, body, req.user.id);
  }

  @Post('legacy-vpc/:legacyVpcId/link')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  linkLegacy(
    @Param('orgId') orgId: string,
    @Param('legacyVpcId') legacyVpcId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.service.linkFromLegacyVpc(orgId, legacyVpcId, req.user?.id);
  }
}
