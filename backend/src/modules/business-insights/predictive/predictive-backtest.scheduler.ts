import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { PredictiveBacktestService } from './predictive-backtest.service';

const BACKTEST_CRON = '30 3 * * 0';
const DRIFT_CRON = '0 4 * * 1';

@Injectable()
export class PredictiveBacktestScheduler {
  private readonly logger = new Logger(PredictiveBacktestScheduler.name);
  private backtestRunning = false;
  private driftRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backtestService: PredictiveBacktestService,
  ) {}

  @Cron(BACKTEST_CRON)
  async weeklyBacktest() {
    if (this.backtestRunning) {
      this.logger.warn('Weekly backtest skipped — previous run still active');
      return;
    }
    this.backtestRunning = true;
    try {
      const orgs = await this.prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      for (const org of orgs) {
        try {
          await this.backtestService.runBacktests({
            organizationId: org.id,
            trigger: 'scheduled_weekly_backtest',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Weekly backtest failed for org ${org.id}: ${message}`);
        }
      }
      this.logger.log(`Weekly predictive backtest completed for ${orgs.length} orgs`);
    } finally {
      this.backtestRunning = false;
    }
  }

  @Cron(DRIFT_CRON)
  async weeklyDriftCheck() {
    if (this.driftRunning) {
      this.logger.warn('Weekly drift check skipped — previous run still active');
      return;
    }
    this.driftRunning = true;
    try {
      const orgs = await this.prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      for (const org of orgs) {
        try {
          await this.backtestService.runDriftCheck({
            organizationId: org.id,
            trigger: 'scheduled_weekly_drift',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Drift check failed for org ${org.id}: ${message}`);
        }
      }
      this.logger.log(`Weekly drift check completed for ${orgs.length} orgs`);
    } finally {
      this.driftRunning = false;
    }
  }
}
