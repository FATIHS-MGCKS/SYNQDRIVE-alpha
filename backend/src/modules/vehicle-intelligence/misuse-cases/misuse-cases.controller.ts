import { Controller, Get, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { MisuseCasesService, ListMisuseCasesQuery } from './misuse-cases.service';
import { MisuseCaseLifecycleService } from './misuse-case-lifecycle/misuse-case-lifecycle.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { EvaluationsAccessService } from '@modules/business-insights/access/evaluations-access.service';
import { EvaluationsPermissionGuard } from '@modules/business-insights/access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '@modules/business-insights/access/require-evaluations-permission.decorator';

type MisuseCaseTransitionBody = {
  action: 'CONFIRM' | 'DISMISS' | 'RESOLVE' | 'DOWNGRADE' | 'SUPERSEDE';
  resolutionReason?: string;
  operatorNote?: string;
};

@Controller('organizations/:orgId/misuse-cases')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class MisuseCasesController {
  constructor(
    private readonly misuseCasesService: MisuseCasesService,
    private readonly lifecycleService: MisuseCaseLifecycleService,
    private readonly evaluationsAccess: EvaluationsAccessService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.executive.read')
  async list(
    @Param('orgId') orgId: string,
    @Query() query: ListMisuseCasesQuery,
    @CurrentUser() user: { id?: string; platformRole?: string },
  ) {
    if (query.surface !== 'cockpit') {
      await this.evaluationsAccess.assertEvaluationsPermission(
        orgId,
        user,
        'evaluations.driver.read',
      );
    }
    return this.misuseCasesService.list(orgId, query);
  }

  @Get(':id')
  @RequireEvaluationsPermission('evaluations.driver.read')
  async getOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.misuseCasesService.getById(orgId, id);
  }

  @Post(':id/lifecycle')
  @RequireEvaluationsPermission('evaluations.recommendations.write')
  async transition(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: MisuseCaseTransitionBody,
  ) {
    const row = await this.lifecycleService.transition(orgId, id, body.action, {
      resolutionReason: body.resolutionReason,
      operatorNote: body.operatorNote,
    });
    return this.misuseCasesService.getById(orgId, row.id);
  }
}
