import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { EvaluationsPermissionGuard } from '../access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '../access/require-evaluations-permission.decorator';
import { EvaluationsAuditService } from '../access/evaluations-audit.service';
import { evaluationsAuditActorFromRequest } from '../access/evaluations-audit-request.util';
import { PredictiveBacktestService } from './predictive-backtest.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/backtests')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveBacktestController {
  constructor(
    private readonly service: PredictiveBacktestService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get('results')
  @RequireEvaluationsPermission('evaluations.data_quality.read')
  listResults(
    @Param('orgId') organizationId: string,
    @Query('modelKey') modelKey?: string,
    @Query('horizonDays') horizonDays?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listResults(organizationId, {
      modelKey,
      horizonDays: horizonDays ? parseInt(horizonDays, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('registry')
  @RequireEvaluationsPermission('evaluations.forecasts.read')
  listRegistry(
    @Param('orgId') organizationId: string,
    @Query('modelKey') modelKey?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listRegistry(organizationId, { modelKey, status });
  }

  @Get('drift')
  @RequireEvaluationsPermission('evaluations.data_quality.read')
  listDrift(
    @Param('orgId') organizationId: string,
    @Query('modelKey') modelKey?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listDriftSnapshots(organizationId, {
      modelKey,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('runs/latest')
  @RequireEvaluationsPermission('evaluations.data_quality.read')
  getLatestRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestRun(organizationId);
  }

  @Post('run')
  @RequireEvaluationsPermission('evaluations.admin.manage')
  async runBacktests(
    @Param('orgId') organizationId: string,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user: { id: userId } });
    const runId = randomUUID();

    try {
      const result = await this.service.runBacktests({ organizationId, trigger: 'api' });
      void this.evaluationsAudit.recordDataQualityAction(organizationId, actor, {
        entityId: runId,
        actionKind: 'backtest_run',
        metadata: { trigger: 'api' },
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Backtest run failed';
      void this.evaluationsAudit.recordDataQualityAction(organizationId, actor, {
        entityId: runId,
        actionKind: 'backtest_run',
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }

  @Post('drift-check')
  @RequireEvaluationsPermission('evaluations.admin.manage')
  async runDriftCheck(
    @Param('orgId') organizationId: string,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user: { id: userId } });
    const runId = randomUUID();

    try {
      const result = await this.service.runDriftCheck({ organizationId, trigger: 'api' });
      void this.evaluationsAudit.recordDataQualityAction(organizationId, actor, {
        entityId: runId,
        actionKind: 'drift_check',
        metadata: { trigger: 'api' },
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Drift check failed';
      void this.evaluationsAudit.recordDataQualityAction(organizationId, actor, {
        entityId: runId,
        actionKind: 'drift_check',
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }
}

@Controller('admin/business-insights/predictive-backtests')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PredictiveBacktestAdminController {
  constructor(
    private readonly service: PredictiveBacktestService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Post('run/:orgId')
  runBacktests(@Param('orgId') orgId: string) {
    return this.service.runBacktests({ organizationId: orgId, trigger: 'manual_admin' });
  }

  @Post('drift-check/:orgId')
  runDriftCheck(@Param('orgId') orgId: string) {
    return this.service.runDriftCheck({ organizationId: orgId, trigger: 'manual_admin_drift' });
  }

  @Post('approve/:orgId')
  async approveModel(
    @Param('orgId') orgId: string,
    @Query('modelKey') modelKey: string,
    @Query('modelVersion') modelVersion: string,
    @Query('horizonDays') horizonDays: string,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user: { id: userId } });
    const parsedHorizon = parseInt(horizonDays, 10);
    const result = await this.service.approveModel(orgId, modelKey, modelVersion, parsedHorizon);

    if (result.approved) {
      void this.evaluationsAudit.recordModelStatusChange(orgId, actor, {
        entityId: `${modelKey}:${parsedHorizon}`,
        modelKey,
        modelVersion,
        horizonDays: parsedHorizon,
        previousStatus: 'SHADOW',
        nextStatus: 'APPROVED',
        reason: 'Master admin approval',
      });
    }

    return result;
  }

  @Get('diagnostics/:orgId')
  async diagnostics(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    void this.evaluationsAudit.recordDataQualityAction(
      orgId,
      evaluationsAuditActorFromRequest({ ...req, user: { id: userId } }),
      {
        entityId: `diagnostics:${orgId}`,
        actionKind: 'admin_diagnostics_read',
      },
    );

    const [registry, results, drift, latestRun] = await Promise.all([
      this.service.listRegistry(orgId),
      this.service.listResults(orgId, { limit: 20 }),
      this.service.listDriftSnapshots(orgId, { limit: 10 }),
      this.service.getLatestRun(orgId),
    ]);
    return {
      organizationId: orgId,
      latestRun,
      registry,
      recentResults: results,
      recentDrift: drift,
      releaseGateDoc: 'docs/architecture/analytics/evaluations-forecast-backtesting.md',
    };
  }
}
