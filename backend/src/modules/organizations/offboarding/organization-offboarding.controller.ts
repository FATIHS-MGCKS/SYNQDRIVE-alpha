import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import type { OrganizationOffboardPrepareRequest } from './organization-offboarding.types';

type AuthedRequest = Request & { user?: { id?: string; sub?: string } };

@Controller('admin/organizations/:organizationId/offboarding')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
@Roles('MASTER_ADMIN')
export class OrganizationOffboardingController {
  constructor(private readonly offboarding: OrganizationOffboardingService) {}

  private actorId(req: AuthedRequest): string | null {
    return req.user?.id ?? req.user?.sub ?? null;
  }

  @Get('preflight')
  getPreflight(@Param('organizationId') organizationId: string) {
    return this.offboarding.getPreflight(organizationId);
  }

  @Post('prepare')
  @HttpCode(201)
  prepare(
    @Param('organizationId') organizationId: string,
    @Body() body: OrganizationOffboardPrepareRequest,
    @Req() req: AuthedRequest,
  ) {
    return this.offboarding.prepare(organizationId, body, this.actorId(req));
  }

  @Get()
  getJob(@Param('organizationId') organizationId: string) {
    return this.offboarding.getLatestJob(organizationId);
  }
}