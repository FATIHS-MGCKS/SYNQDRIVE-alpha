import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import {
  buildEvaluationsAccessContext,
  redactDashboardInsightsForRole,
  resolveEvaluationsPiiTierForMembership,
} from './access/evaluations-privacy.policy';
import { EvaluationsAccessService } from './access/evaluations-access.service';
import { EvaluationsPermissionGuard } from './access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from './access/require-evaluations-permission.decorator';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly evaluationsAccess: EvaluationsAccessService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.executive.read')
  async getInsights(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId: string | undefined,
    @CurrentUser() user: {
      id?: string;
      membershipRole?: MembershipRole;
      platformRole?: string;
      permissions?: unknown;
    },
  ) {
    await this.evaluationsAccess.assertReadableStation(user?.id, orgId, stationId);
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const tier = this.resolveTier(user);
    return redactDashboardInsightsForRole(response, tier);
  }

  @Get('summary')
  @RequireEvaluationsPermission('evaluations.executive.read')
  async getSummary(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId: string | undefined,
    @CurrentUser() user: {
      id?: string;
      membershipRole?: MembershipRole;
      platformRole?: string;
      permissions?: unknown;
    },
  ) {
    await this.evaluationsAccess.assertReadableStation(user?.id, orgId, stationId);
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const lastRun = await this.repo.getLastRunForOrg(orgId);
    const tier = this.resolveTier(user);
    const redacted = redactDashboardInsightsForRole(response, tier);

    return {
      generatedAt: redacted.generatedAt,
      summary: redacted.summary,
      insightCount: redacted.insights.length,
      maxVisible: policy.maxVisibleInsights,
      enabled: policy.enabled,
      lastRunTrigger: lastRun?.trigger ?? null,
      lastRunDurationMs: lastRun?.durationMs ?? null,
    };
  }

  private resolveTier(user: {
    membershipRole?: MembershipRole;
    platformRole?: string;
    permissions?: unknown;
  }) {
    const permissions = normalizeMembershipPermissions(user.permissions);
    const options = {
      membershipRole: user.membershipRole,
      platformRole: user.platformRole,
    };

    return resolveEvaluationsPiiTierForMembership(
      buildEvaluationsAccessContext({
        membershipRole: user.membershipRole,
        canReadCustomerPii: this.evaluationsAccess.evaluateEvaluationsPermission(
          permissions,
          'evaluations.customer_pii.read',
          options,
        ),
        canReadFinance: this.evaluationsAccess.evaluateEvaluationsPermission(
          permissions,
          'evaluations.finance.read',
          options,
        ),
        canReadExecutive: this.evaluationsAccess.evaluateEvaluationsPermission(
          permissions,
          'evaluations.executive.read',
          options,
        ),
      }),
    );
  }
}
