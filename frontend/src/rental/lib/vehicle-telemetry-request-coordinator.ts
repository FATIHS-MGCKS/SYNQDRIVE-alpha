import { isAbortError } from '../../lib/api';
import {
  classifyTelemetryRequestError,
  combineAbortSignals,
  type TelemetryRequestErrorPolicy,
} from './vehicle-telemetry-request-error';
import {
  computeTelemetryBackoffMs,
  VEHICLE_TELEMETRY_RETRY,
} from './vehicle-telemetry-retry';
import { telemetryUserMessage } from './telemetry-user-messages';

export type TelemetryRequestChannel = 'dashboard' | 'gps';

export interface TelemetryRequestBinding {
  organizationId: string;
  vehicleId: string;
  generation: number;
}

export interface TelemetryRequestRunResult<T> {
  ok: boolean;
  data?: T;
  stale: boolean;
  aborted: boolean;
  policy?: TelemetryRequestErrorPolicy;
  failureStreak: number;
  nextDelayMs: number;
}

interface ChannelState {
  abort: AbortController | null;
  inFlight: boolean;
  failureStreak: number;
}

export class VehicleTelemetryRequestCoordinator {
  private generation = 0;
  private boundOrgId: string | null = null;
  private boundVehicleId: string | null = null;
  private readonly channels: Record<TelemetryRequestChannel, ChannelState> = {
    dashboard: { abort: null, inFlight: false, failureStreak: 0 },
    gps: { abort: null, inFlight: false, failureStreak: 0 },
  };

  bind(organizationId: string, vehicleId: string): TelemetryRequestBinding {
    this.abortAll();
    this.generation += 1;
    this.boundOrgId = organizationId;
    this.boundVehicleId = vehicleId;
    this.channels.dashboard.failureStreak = 0;
    this.channels.gps.failureStreak = 0;
    return this.snapshotBinding();
  }

  reset(): void {
    this.abortAll();
    this.generation += 1;
    this.boundOrgId = null;
    this.boundVehicleId = null;
    this.channels.dashboard.failureStreak = 0;
    this.channels.gps.failureStreak = 0;
  }

  abortAll(): void {
    for (const channel of Object.keys(this.channels) as TelemetryRequestChannel[]) {
      this.abortChannel(channel);
    }
  }

  abortChannel(channel: TelemetryRequestChannel): void {
    const state = this.channels[channel];
    state.abort?.abort();
    state.abort = null;
    state.inFlight = false;
  }

  snapshotBinding(): TelemetryRequestBinding {
    return {
      organizationId: this.boundOrgId ?? '',
      vehicleId: this.boundVehicleId ?? '',
      generation: this.generation,
    };
  }

  isBindingCurrent(binding: TelemetryRequestBinding): boolean {
    return (
      binding.generation === this.generation &&
      binding.organizationId === this.boundOrgId &&
      binding.vehicleId === this.boundVehicleId
    );
  }

  async run<T>(input: {
    channel: TelemetryRequestChannel;
    binding: TelemetryRequestBinding;
    normalIntervalMs: number;
    timeoutMs: number;
    execute: (signal: AbortSignal) => Promise<T>;
  }): Promise<TelemetryRequestRunResult<T>> {
    const state = this.channels[input.channel];

    if (!this.isBindingCurrent(input.binding)) {
      return {
        ok: false,
        stale: true,
        aborted: false,
        failureStreak: state.failureStreak,
        nextDelayMs: input.normalIntervalMs,
      };
    }

    if (state.inFlight) {
      return {
        ok: false,
        stale: false,
        aborted: false,
        failureStreak: state.failureStreak,
        nextDelayMs: input.normalIntervalMs,
      };
    }

    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.inFlight = true;

    const { signal, cleanup, wasTimeout } = combineAbortSignals(
      abort.signal,
      input.timeoutMs,
    );

    try {
      const data = await input.execute(signal);
      cleanup();

      if (!this.isBindingCurrent(input.binding)) {
        return {
          ok: false,
          stale: true,
          aborted: false,
          failureStreak: state.failureStreak,
          nextDelayMs: input.normalIntervalMs,
        };
      }

      state.failureStreak = 0;
      return {
        ok: true,
        data,
        stale: false,
        aborted: false,
        failureStreak: 0,
        nextDelayMs: input.normalIntervalMs,
      };
    } catch (err) {
      cleanup();

      if (!this.isBindingCurrent(input.binding)) {
        return {
          ok: false,
          stale: true,
          aborted: isAbortError(err),
          failureStreak: state.failureStreak,
          nextDelayMs: input.normalIntervalMs,
        };
      }

      if (isAbortError(err)) {
        if (wasTimeout()) {
          state.failureStreak += 1;
          const cappedAttempt = Math.min(
            state.failureStreak,
            VEHICLE_TELEMETRY_RETRY.MAX_ATTEMPTS,
          );
          const backoffMs = computeTelemetryBackoffMs(cappedAttempt);
          const policy: TelemetryRequestErrorPolicy = {
            kind: 'timeout',
            retryable: true,
            backoffMs,
            userMessage: telemetryUserMessage('timeout'),
          };
          const retryDelay =
            cappedAttempt >= VEHICLE_TELEMETRY_RETRY.MAX_ATTEMPTS
              ? input.normalIntervalMs
              : backoffMs;
          return {
            ok: false,
            stale: false,
            aborted: false,
            policy,
            failureStreak: state.failureStreak,
            nextDelayMs: retryDelay,
          };
        }

        return {
          ok: false,
          stale: false,
          aborted: true,
          failureStreak: state.failureStreak,
          nextDelayMs: input.normalIntervalMs,
        };
      }

      const policy = classifyTelemetryRequestError(err, state.failureStreak);
      if (!policy.retryable) {
        state.failureStreak += 1;
        return {
          ok: false,
          stale: false,
          aborted: false,
          policy,
          failureStreak: state.failureStreak,
          nextDelayMs: input.normalIntervalMs,
        };
      }

      state.failureStreak += 1;
      const cappedAttempt = Math.min(
        state.failureStreak,
        VEHICLE_TELEMETRY_RETRY.MAX_ATTEMPTS,
      );
      const retryDelay =
        cappedAttempt >= VEHICLE_TELEMETRY_RETRY.MAX_ATTEMPTS
          ? input.normalIntervalMs
          : policy.backoffMs;

      return {
        ok: false,
        stale: false,
        aborted: false,
        policy,
        failureStreak: state.failureStreak,
        nextDelayMs: retryDelay,
      };
    } finally {
      state.inFlight = false;
      if (state.abort === abort) {
        state.abort = null;
      }
    }
  }
}
