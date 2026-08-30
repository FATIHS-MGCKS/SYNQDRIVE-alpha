import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class BookingEligibilityRecheckSchedulerService {
  private readonly logger = new Logger(BookingEligibilityRecheckSchedulerService.name);

  constructor(
    private readonly recheck: BookingEligibilityRecheckService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('*/30 * * * * *')
  async pollDueRechecks(): Promise<void> {
    if (!this.leaderGuard.shouldRun('booking_eligibility_recheck')) return;
    try {
      await this.recheck.processDueScheduledRechecks();
    } catch (err) {
      this.logger.error(
        'booking eligibility recheck poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
