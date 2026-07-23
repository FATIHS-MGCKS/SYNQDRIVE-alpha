import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck.service';

@Injectable()
export class BookingEligibilityRecheckSchedulerService {
  private readonly logger = new Logger(BookingEligibilityRecheckSchedulerService.name);

  constructor(private readonly recheck: BookingEligibilityRecheckService) {}

  @Cron('*/30 * * * * *')
  async pollDueRechecks(): Promise<void> {
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
