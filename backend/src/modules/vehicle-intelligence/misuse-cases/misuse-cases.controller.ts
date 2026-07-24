import { Controller, Get, Param, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { MisuseCasesService, ListMisuseCasesQuery } from './misuse-cases.service';
import { MisuseCaseLifecycleService } from './misuse-case-lifecycle/misuse-case-lifecycle.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { EvaluationsAccessService } from '@modules/business-insights/access/evaluations-access.service';
import { EvaluationsPermissionGuard } from '@modules/business-insights/access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '@modules/business-insights/access/require-evaluations-permission.decorator';
import { EvaluationsAuditService } from '@modules/business-insights/access/evaluations-audit.service';
import {
  EVALUATIONS_AUDIT_ENTITY_TYPE,
  EvaluationsAuditAction,
} from '@modules/business-insights/access/evaluations-audit.constants';
import { evaluationsAuditActorFromRequest } from '@modules/business-insights/access/evaluations-audit-request.util';

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
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.executive.read')
  async list(
    @Param('orgId') orgId: string,
    @Query() query: ListMisuseCasesQuery,
    @CurrentUser() user: { id?: string; platformRole?: string },
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user });

    if (query.surface !== 'cockpit') {
      await this.evaluationsAccess.assertEvaluationsPermission(
        orgId,
        user,
        'evaluations.driver.read',
      );
      void this.evaluationsAudit.recordSensitiveDetailAccess(orgId, actor, {
        entityId: `misuse-list:${orgId}`,
        surface: 'driver_analysis_list',
      });
    }

    return this.misuseCasesService.list(orgId, query);
  }

  @Get(':id')
  @RequireEvaluationsPermission('evaluations.driver.read')
  async getOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: { id?: string },
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    void this.evaluationsAudit.recordSensitiveDetailAccess(
      orgId,
      evaluationsAuditActorFromRequest({ ...req, user }),
      { entityId: id, surface: 'driver_analysis_detail' },
    );
    return this.misuseCasesService.getById(orgId, id);
  }

  @Post(':id/lifecycle')
  @RequireEvaluationsPermission('evaluations.recommendations.write')
  async transition(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: MisuseCaseTransitionBody,
    @CurrentUser() user: { id?: string },
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user });
    const before = await this.misuseCasesService.getById(orgId, id).catch(() => null);

    try {
      const row = await this.lifecycleService.transition(orgId, id, body.action, {
        resolutionReason: body.resolutionReason,
        operatorNote: body.operatorNote,
      });
      const result = await this.misuseCasesService.getById(orgId, row.id);

      void this.evaluationsAudit.record({
        organizationId: orgId,
        actor,
        action: EvaluationsAuditAction.RECOMMENDATION_CHANGED,
        entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MISUSE_CASE,
        entityId: id,
        outcome: 'SUCCESS',
        description: `Misuse recommendation lifecycle: ${body.action}`,
        changeReason: body.resolutionReason ?? body.operatorNote ?? null,
        before: before ? { status: before.status } : undefined,
        after: { status: result.status },
        metadata: { transition: body.action },
      });

      void this.evaluationsAudit.record({
        organizationId: orgId,
        actor,
        action: EvaluationsAuditAction.STATUS_CHANGED,
        entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MISUSE_CASE,
        entityId: id,
        outcome: 'SUCCESS',
        description: `Misuse case status changed via ${body.action}`,
        before: before ? { status: before.status } : undefined,
        after: { status: result.status },
        metadata: { transition: body.action },
      });

      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Transition failed';
      void this.evaluationsAudit.record({
        organizationId: orgId,
        actor,
        action: EvaluationsAuditAction.RECOMMENDATION_CHANGED,
        entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MISUSE_CASE,
        entityId: id,
        outcome: 'FAILED',
        description: `Misuse recommendation lifecycle failed: ${body.action}`,
        changeReason: reason,
        metadata: { transition: body.action },
      });
      throw error;
    }
  }
}
