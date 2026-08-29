import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import { DimoProviderAdmissionTimeoutError } from './dimo-provider-admission.errors';
import {
  DimoProviderLimiterService,
  isDimoProviderAdmissionGranted,
} from './dimo-provider-limiter.service';
import { DimoProviderMetricsService } from './dimo-provider-metrics.service';
import {
  DimoProviderLimiterDecision,
  type DimoProviderLimiterBeginInput,
  type DimoProviderLimiterBeginResult,
} from './dimo-provider-limiter.types';
import { isLivePriority, providerPriorityRank } from './dimo-provider-priority.model';

export interface DimoProviderAdmissionAcquireOptions {
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function admissionRejectionReason(
  begin: DimoProviderLimiterBeginResult,
): 'rate' | 'inflight' | 'cooldown' | 'combined' {
  if (begin.providerCooldownActive) return 'cooldown';
  const rateBlocked = begin.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT ||
    begin.rateDecision === DimoProviderLimiterDecision.WOULD_WAIT;
  const inflightBlocked =
    begin.inFlightDecision === DimoProviderLimiterDecision.WOULD_REJECT ||
    begin.inFlightDecision === DimoProviderLimiterDecision.WOULD_WAIT;
  if (rateBlocked && inflightBlocked) return 'combined';
  if (inflightBlocked) return 'inflight';
  return 'rate';
}

@Injectable()
export class DimoProviderAdmissionService {
  constructor(
    @Inject(dimoProviderLimiterConfig.KEY)
    private readonly config: ConfigType<typeof dimoProviderLimiterConfig>,
    private readonly limiter: DimoProviderLimiterService,
    @Optional() private readonly metrics?: DimoProviderMetricsService,
  ) {}

  async acquire(
    input: DimoProviderLimiterBeginInput,
    options: DimoProviderAdmissionAcquireOptions = {},
  ): Promise<DimoProviderLimiterBeginResult> {
    if (input.mode !== 'enforce') {
      return this.limiter.begin(input);
    }

    const sleep = options.sleep ?? defaultSleep;
    const maxWaitMs = this.config.maxWaitMsByPriority[input.priority] ?? this.config.maxWaitMs;
    const startedAt = Date.now();
    const deadline = startedAt + maxWaitMs;
    let attempts = 0;

    while (true) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error('DIMO provider admission aborted');
      }

      const begin = await this.limiter.begin(input);
      if (isDimoProviderAdmissionGranted(begin)) {
        const waitedMs = Date.now() - startedAt;
        if (waitedMs > 0) {
          this.metrics?.recordAdmissionWait({
            category: input.category,
            priority: input.priority,
            waitedMs,
            outcome: 'granted',
          });
        }
        return begin;
      }

      const now = Date.now();
      if (now >= deadline) {
        const waitedMs = now - startedAt;
        this.metrics?.recordAdmissionWait({
          category: input.category,
          priority: input.priority,
          waitedMs,
          outcome: 'timeout',
        });
        throw new DimoProviderAdmissionTimeoutError(
          input.category,
          input.priority,
          waitedMs,
          admissionRejectionReason(begin),
        );
      }

      this.metrics?.recordBackpressure({
        category: input.category,
        priority: input.priority,
        reason: admissionRejectionReason(begin),
      });

      const pollDelay = this.computePollDelay(input.priority, attempts, begin.wouldDelayMs, deadline - now);
      await sleep(pollDelay);
      attempts += 1;
    }
  }

  computePollDelay(
    priority: DimoProviderLimiterBeginInput['priority'],
    attempts: number,
    suggestedDelayMs: number | undefined,
    remainingMs: number,
  ): number {
    const rank = providerPriorityRank(priority);
    const liveBias = isLivePriority(priority) ? 0.5 : 1;
    const base = Math.min(
      this.config.admissionPollMaxMs,
      Math.max(
        this.config.admissionPollMinMs,
        Math.floor(this.config.admissionPollMinMs * liveBias * (1 + attempts * 0.25)),
      ),
    );
    const suggested = suggestedDelayMs ?? 0;
    return Math.min(remainingMs, Math.max(base, Math.min(suggested, this.config.admissionPollMaxMs)));
  }
}
