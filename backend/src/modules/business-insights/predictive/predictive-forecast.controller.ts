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
import { RunPredictiveForecastsDto } from './dto/run-predictive-forecasts.dto';
import { ListPredictiveForecastsDto } from './dto/list-predictive-forecasts.dto';
import { PredictiveForecastService } from './predictive-forecast.service';
import type { ForecastHorizonDays } from '@synq/evaluations-insights/predictive/evaluations-baseline-forecast.contract';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/forecasts')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveForecastController {
  constructor(
    private readonly service: PredictiveForecastService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.forecasts.read')
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveForecastsDto,
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
    @Body() body: RunPredictiveForecastsDto,
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
        targets: body.targets,
        horizons: body.horizons as ForecastHorizonDays[] | undefined,
        trigger,
      });

      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'operational_forecast',
        trigger,
        metadata: {
          targetCount: body.targets?.length ?? null,
          horizonCount: body.horizons?.length ?? null,
          forecastsWritten: result.forecastsWritten,
        },
      });

      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Forecast run failed';
      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'operational_forecast',
        trigger,
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }
}
