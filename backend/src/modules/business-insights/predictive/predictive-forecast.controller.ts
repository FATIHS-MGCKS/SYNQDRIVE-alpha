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
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RunPredictiveForecastsDto } from './dto/run-predictive-forecasts.dto';
import { ListPredictiveForecastsDto } from './dto/list-predictive-forecasts.dto';
import { PredictiveForecastService } from './predictive-forecast.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/forecasts')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class PredictiveForecastController {
  constructor(private readonly service: PredictiveForecastService) {}

  @Get()
  @RequirePermission('invoices', 'read')
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveForecastsDto,
  ) {
    return this.service.listForecasts(organizationId, query);
  }

  @Get('runs/latest')
  @RequirePermission('invoices', 'read')
  getLatestRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestRun(organizationId);
  }

  @Post('run')
  @RequirePermission('data-analyse', 'manage')
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
