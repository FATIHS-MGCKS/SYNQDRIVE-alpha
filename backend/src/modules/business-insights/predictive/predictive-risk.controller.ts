import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { EvaluationsPermissionGuard } from '../access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '../access/require-evaluations-permission.decorator';
import { EvaluationsAuditService } from '../access/evaluations-audit.service';
import { evaluationsAuditActorFromRequest } from '../access/evaluations-audit-request.util';
import {
  ListPredictiveRiskForecastsDto,
  RunPredictiveRiskForecastsDto,
} from './dto/list-predictive-risk-forecasts.dto';
import { PredictiveRiskService } from './predictive-risk.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/risk-forecasts')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveRiskController {
  constructor(
    private readonly service: PredictiveRiskService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.forecasts.read')
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveRiskForecastsDto,
  ) {
    return this.service.listForecasts(organizationId, query);
  }

  @Get('runs/latest')
  @RequireEvaluationsPermission('evaluations.forecasts.read')
  getLatestRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestRun(organizationId);
  }

  @Post('run')
  @RequireEvaluationsPermission('evaluations.admin.manage')
  async runForecasts(
    @Param('orgId') organizationId: string,
    @Body() body: RunPredictiveRiskForecastsDto,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user: { id: userId } });
    const runId = randomUUID();
    const trigger = body.trigger ?? 'api';

    try {
      const result = await this.service.runForecasts({
        organizationId,
        asOfDate: body.asOfDate,
        timezone: body.timezone,
        horizons: body.horizons as [30, 90] | undefined,
        trigger,
      });

      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'risk_forecast',
        trigger,
        metadata: { forecastsWritten: result.forecastsWritten },
      });

      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Risk forecast run failed';
      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'risk_forecast',
        trigger,
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }
}
