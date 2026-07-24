import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DashboardInsightsRepository } from '../dashboard-insights.repository';
import { TenantInsightPolicyService } from '../tenant-insight-policy.service';
import { EvaluationsPermissionGuard } from './evaluations-permission.guard';
import { RequireEvaluationsPermission } from './require-evaluations-permission.decorator';
import { EvaluationsAccessService } from './evaluations-access.service';
import { EvaluationsAuditService } from './evaluations-audit.service';
import { evaluationsAuditActorFromRequest } from './evaluations-audit-request.util';

@Controller('organizations/:orgId/evaluations/export')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class EvaluationsExportController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly evaluationsAccess: EvaluationsAccessService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get('summary')
  @RequireEvaluationsPermission('evaluations.export.write')
  async exportSummary(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId: string | undefined,
    @CurrentUser('id') userId?: string,
    @Req() req?: { requestId?: string; headers?: Record<string, unknown>; route?: { path?: string }; method?: string; url?: string; ip?: string; connection?: { remoteAddress?: string } },
  ) {
    const actor = evaluationsAuditActorFromRequest({
      ...req,
      user: { id: userId },
    });
    const exportId = randomUUID();

    try {
      await this.evaluationsAccess.assertReadableStation(userId, orgId, stationId);

      const policy = await this.policyService.getPolicy(orgId);
      const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);

      void this.evaluationsAudit.recordFinanceExport(orgId, actor, {
        exportId,
        stationId: stationId ?? null,
        activeInsightCount: response.activeInsightCount,
      });

      return {
        exportedAt: new Date().toISOString(),
        organizationId: orgId,
        stationId: stationId ?? null,
        exportId,
        insightSummary: response.summary,
        activeInsightCount: response.activeInsightCount,
        generatedAt: response.generatedAt,
        format: 'json',
        note: 'Aggregate export only — no customer or driver identifiers.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Export failed';
      void this.evaluationsAudit.recordFinanceExport(orgId, actor, {
        exportId,
        stationId: stationId ?? null,
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }
}
