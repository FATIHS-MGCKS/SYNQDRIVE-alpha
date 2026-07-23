import { JobsOptions } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import bookingDomainEventOutboxConfig from '@config/booking-domain-event-outbox.config';

export const BOOKING_DOMAIN_EVENT_OUTBOX_JOB_NAME = 'publish';

export function buildBookingDomainEventOutboxJobId(outboxId: string): string {
  return `booking-domain-event:${outboxId}`;
}

export function buildBookingDomainEventOutboxJobOptions(
  config: ConfigType<typeof bookingDomainEventOutboxConfig>,
  outboxId: string,
): JobsOptions {
  return {
    jobId: buildBookingDomainEventOutboxJobId(outboxId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  };
}
