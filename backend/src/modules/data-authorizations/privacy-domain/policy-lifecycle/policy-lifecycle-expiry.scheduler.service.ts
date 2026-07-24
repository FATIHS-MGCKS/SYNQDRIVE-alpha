import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PolicyLifecycleExpiryService } from './policy-lifecycle-expiry.service';
import { POLICY_LIFECYCLE_REASON_CODES } from './policy-lifecycle-semantics.constants';

const DEFAULT_POLL_MS = 60_000;

/**
 * Server-side catch-up scheduler for policy expiry.
 * Idempotent — safe to re-run after outages.
 */
@Injectable()
export class PolicyLifecycleExpirySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolicyLifecycleExpirySchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly expiry: PolicyLifecycleExpiryService) {}

  onModuleInit(): void {
    if (process.env.DATA_AUTH_POLICY_EXPIRY_POLL_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DATA_AUTH_POLICY_EXPIRY_POLL_MS ?? DEFAULT_POLL_MS);
    this.timer = setInterval(() => {
      void this.expiry
        .expireDuePolicies({
          reasonCode: POLICY_LIFECYCLE_REASON_CODES.EXPIRED.SCHEDULED_CATCH_UP,
        })
        .catch((err) => {
          this.logger.error(
            'Policy expiry poll failed',
            err instanceof Error ? err.stack : String(err),
          );
        });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
