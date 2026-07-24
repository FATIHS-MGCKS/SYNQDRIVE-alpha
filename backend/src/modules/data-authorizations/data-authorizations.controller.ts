import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataAuthorizationsService } from './data-authorizations.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_AUTH_MODULE } from './data-authorization.constants';
import {
  CreateDataAuthorizationDto,
  GrantDataAuthorizationDto,
  ListDataAuthorizationsQueryDto,
  RevokeDataAuthorizationDto,
  UpdateDataAuthorizationDto,
} from './dto';

interface AuthedRequest {
  user?: {
    id?: string;
    name?: string;
    email?: string;
  };
}

@Controller('organizations/:orgId/data-authorizations')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataAuthorizationsController {
  constructor(private readonly service: DataAuthorizationsService) {}

  @Get()
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  async list(
    @Param('orgId') orgId: string,
    @Query() query: ListDataAuthorizationsQueryDto,
  ) {
    return this.service.findByOrg(orgId, query);
  }

  @Get('stats')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  async stats(@Param('orgId') orgId: string) {
    return this.service.getStats(orgId);
  }

  @Get('audit-log')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  async auditLog(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
    @Query('entityId') entityId?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.service.getAuditLog(orgId, {
      limit: Number.isFinite(parsed) ? parsed : 50,
      entityId,
      cursor,
    });
  }

  @Post('sync-system-authorizations')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async syncSystemAuthorizations(@Param('orgId') orgId: string) {
    return this.service.syncSystemAuthorizations(orgId);
  }

  @Get(':id')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  async get(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }

  @Post()
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    const user = req.user ?? {};
    return this.service.create(orgId, body, {
      id: user.id,
      name: user.name || user.email || 'System',
    });
  }

  @Patch(':id')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    const user = req.user ?? {};
    return this.service.update(orgId, id, body, {
      id: user.id,
      name: user.name || user.email || 'System',
    });
  }

  @Post(':id/grant')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async grantPost(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: GrantDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    const user = req.user ?? {};
    return this.service.grant(
      orgId,
      id,
      user.id || 'system',
      user.name || user.email || 'System',
      body,
    );
  }

  /** @deprecated Prefer POST — kept for existing clients */
  @Patch(':id/grant')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async grantPatch(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: GrantDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    return this.grantPost(orgId, id, body, req);
  }

  @Post(':id/revoke')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async revokePost(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RevokeDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    const user = req.user ?? {};
    return this.service.revoke(
      orgId,
      id,
      user.id || 'system',
      user.name || user.email || 'System',
      body,
    );
  }

  /** @deprecated Prefer POST — kept for existing clients */
  @Patch(':id/revoke')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async revokePatch(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RevokeDataAuthorizationDto,
    @Req() req: AuthedRequest,
  ) {
    return this.revokePost(orgId, id, body, req);
  }
}
