import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { PredictiveFeatureService } from './predictive-feature.service';
import { PredictiveForecastService } from './predictive-forecast.service';
import { PredictiveRiskService } from './predictive-risk.service';

const FORECAST_CRON = '15 3 * * *';

@Injectable()
export class PredictiveForecastScheduler {
  private readonly logger = new Logger(PredictiveForecastScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureService: PredictiveFeatureService,
    private readonly forecastService: PredictiveForecastService,
    private readonly riskService: PredictiveRiskService,
  ) {}

  @Cron(FORECAST_CRON)
  async nightlyRun() {
    if (this.running) {
      this.logger.warn('Predictive forecast nightly run skipped — previous run still active');
      return;
    }
    this.running = true;
    try {
      const orgs = await this.prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      for (const org of orgs) {
        try {
          await this.featureService.buildFeatures({
            organizationId: org.id,
            lookbackDays: 400,
            trigger: 'scheduled_forecast',
          });
          await this.forecastService.runForecasts({
            organizationId: org.id,
            trigger: 'scheduled_forecast',
          });
          await this.riskService.runForecasts({
            organizationId: org.id,
            trigger: 'scheduled_risk_forecast',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Predictive pipeline failed for org ${org.id}: ${message}`);
        }
      }
      this.logger.log(`Predictive forecast nightly run completed for ${orgs.length} orgs`);
    } finally {
      this.running = false;
    }
  }
}
