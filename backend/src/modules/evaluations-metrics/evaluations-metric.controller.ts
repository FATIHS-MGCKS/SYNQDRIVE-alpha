import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { EvaluationsMetricService } from './evaluations-metric.service';

@Controller('evaluations-metrics')
@UseGuards(RolesGuard)
export class EvaluationsMetricController {
  constructor(private readonly metricService: EvaluationsMetricService) {}

  /** Full registry snapshot for Auswertungen metric metadata. */
  @Get('registry')
  getRegistry() {
    return this.metricService.getRegistry();
  }

  /** Lookup by canonical or legacy metric id (dots allowed via query). */
  @Get('metrics/lookup')
  getMetric(@Query('id') metricId: string) {
    return this.metricService.getMetric(metricId);
  }
}
