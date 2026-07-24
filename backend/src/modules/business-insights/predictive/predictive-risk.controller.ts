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
import {
  ListPredictiveRiskForecastsDto,
  RunPredictiveRiskForecastsDto,
} from './dto/list-predictive-risk-forecasts.dto';
import { PredictiveRiskService } from './predictive-risk.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/risk-forecasts')
@UseGuards(OrgScopingGuard)
export class PredictiveRiskController {
  constructor(private readonly service: PredictiveRiskService) {}

  @Get()
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveRiskForecastsDto,
  ) {
    return this.service.listForecasts(organizationId, query);
  }

  @Get('runs/latest')
  getLatestRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestRun(organizationId);
  }

  @Post('run')
  runForecasts(
    @Param('orgId') organizationId: string,
    @Body() body: RunPredictiveRiskForecastsDto,
  ) {
    return this.service.runForecasts({
      organizationId,
      asOfDate: body.asOfDate,
      timezone: body.timezone,
      horizons: body.horizons as [30, 90] | undefined,
      trigger: body.trigger ?? 'api',
    });
  }
}
