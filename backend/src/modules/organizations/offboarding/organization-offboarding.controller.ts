import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import { OrganizationOffboardingExecutionService } from './organization-offboarding-execution.service';
import { OrganizationOffboardingFinalizationService } from './organization-offboarding-finalization.service';
import { OrganizationOffboardingDimoPrivilegeService } from './organization-offboarding-dimo-privilege.service';
import { parseOrganizationDimoOwnerHandoffBody } from './organization-offboarding-dimo-owner-handoff.validation';
import { parseOrganizationOffboardingPrepareBody } from './organization-offboarding-prepare.validation';
import { parseOrganizationOffboardingExecuteBody } from './organization-offboarding-execute.validation';
import { parseOrganizationOffboardingFinalizeBody } from './organization-offboarding-finalize.validation';

type AuthedRequest = Request & { user?: { id?: string; sub?: string } };

@Controller('admin/organizations/:organizationId/offboarding')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
@Roles('MASTER_ADMIN')
export class OrganizationOffboardingController {
  constructor(
    private readonly offboarding: OrganizationOffboardingService,
    private readonly execution: OrganizationOffboardingExecutionService,
    private readonly finalization: OrganizationOffboardingFinalizationService,
    private readonly dimoPrivilege: OrganizationOffboardingDimoPrivilegeService,
  ) {}

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
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    const parsed = parseOrganizationOffboardingPrepareBody(body);
    return this.offboarding.prepare(organizationId, parsed, this.actorId(req));
  }

  @Post('finalize')
  @HttpCode(200)
  finalize(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    const parsed = parseOrganizationOffboardingFinalizeBody(body);
    return this.finalization.finalize(organizationId, parsed, this.actorId(req));
  }

  @Post('execute')
  @HttpCode(200)
  execute(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    const parsed = parseOrganizationOffboardingExecuteBody(body);
    return this.execution.execute(organizationId, parsed, this.actorId(req));
  }

  @Get()
  getJob(@Param('organizationId') organizationId: string) {
    return this.offboarding.getLatestJob(organizationId);
  }

  @Get('dimo-privilege-status')
  getDimoPrivilegeStatus(@Param('organizationId') organizationId: string) {
    return this.dimoPrivilege.getDimoPrivilegeStatus(organizationId);
  }

  @Post('dimo-privilege-recheck')
  @HttpCode(200)
  recheckDimoPrivileges(@Param('organizationId') organizationId: string, @Req() req: AuthedRequest) {
    return this.dimoPrivilege.recheckDimoPrivileges(organizationId, this.actorId(req));
  }

  @Post('dimo-owner-handoff')
  @HttpCode(201)
  recordDimoOwnerHandoff(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    const parsed = parseOrganizationDimoOwnerHandoffBody(body);
    return this.dimoPrivilege.recordDimoOwnerHandoff(organizationId, parsed, this.actorId(req));
  }
}