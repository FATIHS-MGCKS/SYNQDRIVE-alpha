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
import { RunPredictiveForecastsDto } from './dto/run-predictive-forecasts.dto';
import { ListPredictiveForecastsDto } from './dto/list-predictive-forecasts.dto';
import { PredictiveForecastService } from './predictive-forecast.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/forecasts')
@UseGuards(OrgScopingGuard)
export class PredictiveForecastController {
  constructor(private readonly service: PredictiveForecastService) {}

  @Get()
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveForecastsDto,
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
