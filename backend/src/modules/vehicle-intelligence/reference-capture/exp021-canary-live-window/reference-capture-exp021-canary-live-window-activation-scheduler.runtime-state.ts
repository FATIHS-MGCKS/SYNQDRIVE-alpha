import { Injectable } from '@nestjs/common';

export type Exp021CanaryLiveWindowActivationSchedulerRuntimeSnapshot = {
  timerInstalled: boolean;
  intervalMs: number | null;
  lastCallbackAt: string | null;
  lastConfigValidAt: string | null;
  lastSkippedNotLeaderAt: string | null;
  lastExecutedTickAt: string | null;
  lastSuccessfulTickAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

@Injectable()
export class ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState {
  private timerInstalled = false;
  private intervalMs: number | null = null;
  private lastCallbackAt: Date | null = null;
  private lastConfigValidAt: Date | null = null;
  private lastSkippedNotLeaderAt: Date | null = null;
  private lastExecutedTickAt: Date | null = null;
  private lastSuccessfulTickAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private lastErrorMessage: string | null = null;

  markTimerInstalled(intervalMs: number): void {
    this.timerInstalled = true;
    this.intervalMs = intervalMs;
  }

  markCallback(): void {
    this.lastCallbackAt = new Date();
  }

  markConfigValid(): void {
    this.lastConfigValidAt = new Date();
  }

  markSkippedNotLeader(): void {
    this.lastSkippedNotLeaderAt = new Date();
  }

  markExecutedTick(): void {
    this.lastExecutedTickAt = new Date();
  }

  markSuccessfulTick(): void {
    this.lastSuccessfulTickAt = new Date();
  }

  markError(err: unknown): void {
    this.lastErrorAt = new Date();
    this.lastErrorMessage = err instanceof Error ? err.message : String(err);
  }

  getSnapshot(): Exp021CanaryLiveWindowActivationSchedulerRuntimeSnapshot {
    return {
      timerInstalled: this.timerInstalled,
      intervalMs: this.intervalMs,
      lastCallbackAt: this.lastCallbackAt?.toISOString() ?? null,
      lastConfigValidAt: this.lastConfigValidAt?.toISOString() ?? null,
      lastSkippedNotLeaderAt: this.lastSkippedNotLeaderAt?.toISOString() ?? null,
      lastExecutedTickAt: this.lastExecutedTickAt?.toISOString() ?? null,
      lastSuccessfulTickAt: this.lastSuccessfulTickAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: this.lastErrorMessage,
    };
  }
}
