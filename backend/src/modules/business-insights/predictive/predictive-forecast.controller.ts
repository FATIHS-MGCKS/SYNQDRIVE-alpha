import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { EvaluationsPermissionGuard } from '../access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '../access/require-evaluations-permission.decorator';
import { RunPredictiveForecastsDto } from './dto/run-predictive-forecasts.dto';
import { ListPredictiveForecastsDto } from './dto/list-predictive-forecasts.dto';
import { PredictiveForecastService } from './predictive-forecast.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/forecasts')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveForecastController {
  constructor(private readonly service: PredictiveForecastService) {}

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
  runForecasts(
    @Param('orgId') organizationId: string,
    @Body() body: RunPredictiveForecastsDto,
  ) {
    return this.service.runForecasts({
      organizationId,
      asOfDate: body.asOfDate,
      timezone: body.timezone,
      targets: body.targets,
      horizons: body.horizons as ForecastHorizonDays[] | undefined,
      trigger: body.trigger ?? 'api',
    });
  }
}
