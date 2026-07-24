import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import {
  buildEvaluationsAccessContext,
  redactDashboardInsightsForRole,
  resolveEvaluationsPiiTierForMembership,
} from './access/evaluations-privacy.policy';
import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
  ) {}

  @Get()
  @RequirePermission('invoices', 'read')
  async getInsights(
    @Param('orgId') orgId: string,
    @CurrentUser() user: {
      membershipRole?: MembershipRole;
      permissions?: unknown;
    },
  ) {
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const tier = this.resolveTier(user);
    return redactDashboardInsightsForRole(response, tier);
  }

  @Get('summary')
  @RequirePermission('invoices', 'read')
  async getSummary(
    @Param('orgId') orgId: string,
    @CurrentUser() user: {
      membershipRole?: MembershipRole;
      permissions?: unknown;
    },
  ) {
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
    permissions?: unknown;
  }) {
    const permissions = normalizeMembershipPermissions(user.permissions);
    return resolveEvaluationsPiiTierForMembership(
      buildEvaluationsAccessContext({
        membershipRole: user.membershipRole,
        canReadInvoices: evaluateModulePermission(permissions, 'invoices', 'read'),
        canReadCustomers: evaluateModulePermission(permissions, 'customers', 'read'),
      }),
    );
  }
}
