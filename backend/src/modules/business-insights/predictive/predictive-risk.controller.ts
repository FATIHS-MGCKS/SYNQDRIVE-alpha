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
import {
  ListPredictiveRiskForecastsDto,
  RunPredictiveRiskForecastsDto,
} from './dto/list-predictive-risk-forecasts.dto';
import { PredictiveRiskService } from './predictive-risk.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/risk-forecasts')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class PredictiveRiskController {
  constructor(private readonly service: PredictiveRiskService) {}

  @Get()
  @RequirePermission('invoices', 'read')
  listForecasts(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveRiskForecastsDto,
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
