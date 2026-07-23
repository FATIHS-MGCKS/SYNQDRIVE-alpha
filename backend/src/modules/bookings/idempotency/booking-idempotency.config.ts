import { Injectable } from '@nestjs/common';
import {
  DEFAULT_BOOKING_IDEMPOTENCY_RETENTION_HOURS,
} from './booking-idempotency.constants';

@Injectable()
export class BookingIdempotencyConfigService {
  getRetentionHours(): number {
    const raw = process.env.BOOKING_IDEMPOTENCY_RETENTION_HOURS;
    if (!raw) return DEFAULT_BOOKING_IDEMPOTENCY_RETENTION_HOURS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_BOOKING_IDEMPOTENCY_RETENTION_HOURS;
    }
    return parsed;
  }

  getProcessingPollAttempts(): number {
    const raw = process.env.BOOKING_IDEMPOTENCY_PROCESSING_POLL_ATTEMPTS;
    if (!raw) return 15;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  }

  getProcessingPollDelayMs(): number {
    const raw = process.env.BOOKING_IDEMPOTENCY_PROCESSING_POLL_DELAY_MS;
    if (!raw) return 200;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
  }
}
