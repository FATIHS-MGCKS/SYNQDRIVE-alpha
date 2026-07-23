import { registerAs } from '@nestjs/config';

function resolveEnabled(): boolean {
  const explicit = process.env.BOOKING_DOMAIN_EVENT_OUTBOX_ENABLED;
  if (explicit === 'false') {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      console.error(
        '[booking-domain-event-outbox] BOOKING_DOMAIN_EVENT_OUTBOX_ENABLED=false is not permitted in production; outbox remains enabled.',
      );
      return true;
    }
    return false;
  }
  return explicit !== '0';
}

export default registerAs('bookingDomainEventOutbox', () => ({
  enabled: resolveEnabled(),
  maxAttempts: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_BACKOFF_MS ?? '2000', 10),
  pollBatchSize: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_POLL_BATCH ?? '50', 10),
  jobAttempts: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_JOB_ATTEMPTS ?? '5', 10),
  jobBackoffMs: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_JOB_BACKOFF_MS ?? '30000', 10),
  processingStaleMs: parseInt(
    process.env.BOOKING_DOMAIN_EVENT_OUTBOX_PROCESSING_STALE_MS ?? '300000',
    10,
  ),
  retentionDays: parseInt(process.env.BOOKING_DOMAIN_EVENT_OUTBOX_RETENTION_DAYS ?? '90', 10),
}));
