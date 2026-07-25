import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { redactInsightDtoForRole } from './insight-redaction.helper';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
  ) {}

  @Get()
  @RequirePermission('dashboard', 'read')
  async getInsights(
    @Param('orgId') orgId: string,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
  ) {
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const role = membershipRole ?? MembershipRole.WORKER;
    return {
      ...response,
      insights: response.insights.map((insight) => redactInsightDtoForRole(insight, role)),
    };
  }

  @Get('summary')
  @RequirePermission('dashboard', 'read')
  async getSummary(@Param('orgId') orgId: string) {
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const lastRun = await this.repo.getLastRunForOrg(orgId);

    return {
      generatedAt: response.generatedAt,
      summary: response.summary,
      insightCount: response.insights.length,
      maxVisible: policy.maxVisibleInsights,
      enabled: policy.enabled,
      lastRunTrigger: lastRun?.trigger ?? null,
      lastRunDurationMs: lastRun?.durationMs ?? null,
    };
  }
}
