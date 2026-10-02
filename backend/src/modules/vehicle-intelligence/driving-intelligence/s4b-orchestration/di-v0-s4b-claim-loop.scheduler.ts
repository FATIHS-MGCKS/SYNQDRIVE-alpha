import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DI_V0_S4B_TUNING } from './di-v0-s4b-config';
import type { DiV0S4ClaimLoop, DiV0S4ClaimLoopResult } from './di-v0-s4b-claim-loop';
import { DI_V0_S4B_CLAIM_LOOP } from './di-v0-s4b-tokens';

/**
 * REPLICA_LOCAL `di_v0_s4_claim_loop`: every replica may claim, because the work-item row and
 * `lease_epoch` (FOR UPDATE SKIP LOCKED, DB clock) are the execution authority, not leadership.
 * No timer is created unless the worker role is enabled; each tick still refuses to claim
 * without a ready executor.
 */
@Injectable()
export class DiV0S4ClaimLoopScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4ClaimLoopScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DI_V0_S4B_CLAIM_LOOP) private readonly claimLoop: DiV0S4ClaimLoop) {}

  onModuleInit(): void {
    if (!this.claimLoop.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), DI_V0_S4B_TUNING.claimLoopIntervalMs);
    this.logger.log(`DI V0 S4 claim loop active (intervalMs=${DI_V0_S4B_TUNING.claimLoopIntervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.claimLoop.stop();
  }

  async tick(): Promise<DiV0S4ClaimLoopResult | null> {
    try {
      return await this.claimLoop.runOnce();
    } catch (error) {
      this.logger.warn(`DI V0 S4 claim tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      return null;
    }
  }
}
