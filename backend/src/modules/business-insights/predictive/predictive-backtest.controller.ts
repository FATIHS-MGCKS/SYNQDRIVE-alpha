import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { EvaluationsPermissionGuard } from '../access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '../access/require-evaluations-permission.decorator';
import { PredictiveBacktestService } from './predictive-backtest.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/backtests')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveBacktestController {
  constructor(private readonly service: PredictiveBacktestService) {}

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
  runBacktests(@Param('orgId') organizationId: string) {
    return this.service.runBacktests({ organizationId, trigger: 'api' });
  }

  @Post('drift-check')
  @RequireEvaluationsPermission('evaluations.admin.manage')
  runDriftCheck(@Param('orgId') organizationId: string) {
    return this.service.runDriftCheck({ organizationId, trigger: 'api' });
  }
}

@Controller('admin/business-insights/predictive-backtests')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PredictiveBacktestAdminController {
  constructor(private readonly service: PredictiveBacktestService) {}

  @Post('run/:orgId')
  runBacktests(@Param('orgId') orgId: string) {
    return this.service.runBacktests({ organizationId: orgId, trigger: 'manual_admin' });
  }

  @Post('drift-check/:orgId')
  runDriftCheck(@Param('orgId') orgId: string) {
    return this.service.runDriftCheck({ organizationId: orgId, trigger: 'manual_admin_drift' });
  }

  @Post('approve/:orgId')
  approveModel(
    @Param('orgId') orgId: string,
    @Query('modelKey') modelKey: string,
    @Query('modelVersion') modelVersion: string,
    @Query('horizonDays') horizonDays: string,
  ) {
    return this.service.approveModel(
      orgId,
      modelKey,
      modelVersion,
      parseInt(horizonDays, 10),
    );
  }

  @Get('diagnostics/:orgId')
  async diagnostics(@Param('orgId') orgId: string) {
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
