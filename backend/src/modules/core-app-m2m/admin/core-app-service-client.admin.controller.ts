import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { CoreAppServiceClientAdminService } from './core-app-service-client.admin.service';

type MasterAdminRequest = Request & {
  user?: { id: string };
  route?: { path?: string };
};

@Controller('admin/core-app-service-clients')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_API_KEYS)
@Roles('MASTER_ADMIN')
export class CoreAppServiceClientAdminController {
  constructor(private readonly admin: CoreAppServiceClientAdminService) {}

  @Get()
  listClients() {
    return this.admin.listClients();
  }

  @Get(':id')
  getClient(@Param('id') id: string) {
    return this.admin.getClient(id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  createClient(@Body() body: Record<string, unknown>, @Req() req: MasterAdminRequest) {
    return this.admin.createClient(body, this.auditContext(req));
  }

  @Patch(':id')
  updateClient(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: MasterAdminRequest,
  ) {
    return this.admin.updateClient(id, body, this.auditContext(req));
  }

  @Post(':id/rotate-credential')
  @Header('Cache-Control', 'no-store')
  rotateCredential(@Param('id') id: string, @Req() req: MasterAdminRequest) {
    return this.admin.rotateCredential(id, this.auditContext(req));
  }

  @Get(':id/org-grants')
  listOrgGrants(@Param('id') id: string) {
    return this.admin.listOrgGrants(id);
  }

  @Post(':id/org-grants')
  attachOrgGrant(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: MasterAdminRequest,
  ) {
    const organizationId = String(body.organizationId ?? '').trim();
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    return this.admin.attachOrgGrant(id, organizationId, this.auditContext(req));
  }

  @Patch(':id/org-grants/:orgId')
  updateOrgGrant(
    @Param('id') id: string,
    @Param('orgId') orgId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: MasterAdminRequest,
  ) {
    return this.admin.updateOrgGrant(id, orgId, body, this.auditContext(req));
  }

  private auditContext(req: MasterAdminRequest) {
    const actorUserId = req.user?.id;
    if (!actorUserId) {
      throw new UnauthorizedException();
    }
    return {
      actorUserId,
      correlationId: randomUUID(),
      route: req.route?.path,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}