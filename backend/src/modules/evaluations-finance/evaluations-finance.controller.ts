import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { normalizeEvaluationsRequestedStationIds } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import type { EvaluationsAnalyticsActor } from '@modules/evaluations-analytics/evaluations-analytics-scope.service';
import {
  EvaluationsFinanceService,
  type FinancialInsightsResult,
} from './evaluations-finance.service';

function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
}

/**
 * Canonical E3 finance serving endpoint — the single live source for the
 * Financial Insights core KPIs (replacing the previous client-side computation).
 *
 * Security: OrgScopingGuard + repository scoping (organization), the E2 scope
 * service inside the finance service (station scope + period/timezone), and the
 * `invoices` read permission (the same authority that governs the underlying
 * finance data the page already consumed). It is NOT dark-gated because it
 * replaces an existing live capability. The actor's organization/station/period/
 * currency are server-authorized — none are trusted from the client beyond the
 * requested station narrowing, which is validated against the authorized scope.
 */
@Controller('organizations/:orgId/evaluations/finance')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class EvaluationsFinanceController {
  constructor(private readonly finance: EvaluationsFinanceService) {}

  @Get('insights')
  @RequirePermission('invoices', 'read')
  async insights(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<FinancialInsightsResult> {
    const requestedStationIds = normalizeEvaluationsRequestedStationIds(
      toStringArray(query.stationIds) ?? null,
    );
    return this.finance.computeFinancialInsights({
      actor,
      orgId,
      requestedStationIds,
    });
  }
}
