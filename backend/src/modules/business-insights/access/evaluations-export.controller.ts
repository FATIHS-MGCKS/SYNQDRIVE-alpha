import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DashboardInsightsRepository } from '../dashboard-insights.repository';
import { TenantInsightPolicyService } from '../tenant-insight-policy.service';
import { EvaluationsPermissionGuard } from './evaluations-permission.guard';
import { RequireEvaluationsPermission } from './require-evaluations-permission.decorator';
import { EvaluationsAccessService } from './evaluations-access.service';

@Controller('organizations/:orgId/evaluations/export')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class EvaluationsExportController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly evaluationsAccess: EvaluationsAccessService,
  ) {}

  @Get('summary')
  @RequireEvaluationsPermission('evaluations.export.write')
  async exportSummary(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId: string | undefined,
    @CurrentUser('id') userId?: string,
  ) {
    await this.evaluationsAccess.assertReadableStation(userId, orgId, stationId);

    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);

    return {
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      stationId: stationId ?? null,
      insightSummary: response.summary,
      activeInsightCount: response.activeInsightCount,
      generatedAt: response.generatedAt,
      format: 'json',
      note: 'Aggregate export only — no customer or driver identifiers.',
    };
  }
}
