import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReferenceCaptureExp021CanaryLiveWindowActivationService } from '../../modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation.service';
import {
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_DEFAULT,
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_ENV,
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MAX,
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MIN,
} from '../../modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation.constants';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState } from '../../modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation-scheduler.runtime-state';

function resolveIntervalMs(): number {
  const raw = Number.parseInt(process.env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_ENV] ?? '', 10);
  if (!Number.isFinite(raw)) return EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_DEFAULT;
  const floored = Math.floor(raw);
  if (floored < EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MIN) {
    return EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MIN;
  }
  if (floored > EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MAX) {
    return EXP021_CANARY_LIVE_WINDOW_ACTIVATION_INTERVAL_MS_MAX;
  }
  return floored;
}

@Injectable()
export class ReferenceCaptureExp021CanaryLiveWindowActivationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReferenceCaptureExp021CanaryLiveWindowActivationScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly activationService: ReferenceCaptureExp021CanaryLiveWindowActivationService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly runtimeState: ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState,
  ) {}

  onModuleInit(): void {
    const intervalMs = resolveIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.runtimeState.markTimerInstalled(intervalMs);

    const config = this.activationService.resolveConfigFromEnv();
    if (config) {
      this.logger.log(
        `EXP-021 canary live window activation scheduler active (intervalMs=${intervalMs}, cohortVehicles=${config.cohort.members.length}, tokenIds=[${config.cohort.tokenIds.join(',')}])`,
      );
    } else {
      this.logger.log(
        `EXP-021 canary live window activation scheduler timer installed (intervalMs=${intervalMs}, activationConfig=inactive)`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    this.runtimeState.markCallback();
    const config = this.activationService.resolveConfigFromEnv();
    if (!config) return;
    this.runtimeState.markConfigValid();
    if (!this.leaderGuard.shouldRun('reference_capture_exp021_canary_live_window_activation')) {
      this.runtimeState.markSkippedNotLeader();
      return;
    }
    this.runtimeState.markExecutedTick();
    try {
      await this.activationService.runActivationTick();
      this.runtimeState.markSuccessfulTick();
    } catch (err) {
      this.runtimeState.markError(err);
      throw err;
    }
  }
}
