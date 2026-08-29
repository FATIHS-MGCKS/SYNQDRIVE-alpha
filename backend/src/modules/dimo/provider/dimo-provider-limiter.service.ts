import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '@shared/redis/redis.service';
import type { DimoProviderRateAlgorithm } from '@config/dimo-provider-limiter.config';
import {
  DIMO_PROVIDER_COOLDOWN_SET_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
  DIMO_PROVIDER_RATE_SCRIPT,
  DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT,
  dimoProviderCooldownKey,
  dimoProviderInflightKey,
  dimoProviderRateKey,
  dimoProviderTokenBucketKey,
} from './dimo-provider-limiter.redis-scripts';
import {
  inflightMember,
  providerPriorityRank,
} from './dimo-provider-priority.model';
import {
  DimoProviderLimiterDecision,
  type DimoProviderLimiterBeginInput,
  type DimoProviderLimiterBeginResult,
} from './dimo-provider-limiter.types';

function parseDecision(raw: string): DimoProviderLimiterDecision {
  switch (raw) {
    case 'would_reject':
      return DimoProviderLimiterDecision.WOULD_REJECT;
    case 'would_wait':
      return DimoProviderLimiterDecision.WOULD_WAIT;
    case 'allow':
    default:
      return DimoProviderLimiterDecision.ALLOW;
  }
}

function isAdmitted(result: DimoProviderLimiterBeginResult): boolean {
  if (result.redisFailOpen) return true;
  return (
    result.rateDecision !== DimoProviderLimiterDecision.WOULD_REJECT &&
    result.inFlightDecision !== DimoProviderLimiterDecision.WOULD_REJECT &&
    result.rateDecision !== DimoProviderLimiterDecision.WOULD_WAIT &&
    result.inFlightDecision !== DimoProviderLimiterDecision.WOULD_WAIT
  );
}

@Injectable()
export class DimoProviderLimiterService {
  private readonly logger = new Logger(DimoProviderLimiterService.name);

  constructor(private readonly redis: RedisService) {}

  async begin(input: DimoProviderLimiterBeginInput): Promise<DimoProviderLimiterBeginResult> {
    if (input.mode === 'off') {
      return this.bypassResult(input);
    }

    const leaseId = randomUUID();
    const nowMs = Date.now();
    const expiryMs = nowMs + input.inFlightLeaseMs;
    const inflightKey = dimoProviderInflightKey();
    const capacity = input.rateLimitPerSecond + input.rateBurst;
    const priorityRank = providerPriorityRank(input.priority);

    try {
      const cooldownRemainingMs = await this.getProviderCooldownRemainingMs(nowMs);
      if (cooldownRemainingMs > 0) {
        return {
          leaseId: null,
          inFlightMember: null,
          mode: input.mode,
          rateDecision: DimoProviderLimiterDecision.WOULD_WAIT,
          inFlightDecision: DimoProviderLimiterDecision.WOULD_WAIT,
          rateWindowCount: 0,
          rateWindowLimit: capacity,
          inFlightCount: 0,
          inFlightLimit: input.maxInFlight,
          redisFailOpen: false,
          wouldDelayMs: cooldownRemainingMs,
          providerCooldownActive: true,
          rateAlgorithm: input.rateAlgorithm,
        };
      }

      const rateRaw = await this.acquireRateBudget(input, nowMs, capacity);
      const inflightRaw = (await this.redis.eval(
        DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
        1,
        inflightKey,
        String(input.maxInFlight),
        leaseId,
        String(nowMs),
        String(expiryMs),
        input.mode,
        String(priorityRank),
        String(input.reservedHighPrioritySlots),
      )) as [number, number, string, number, number];

      const rateDecision = parseDecision(rateRaw[2]);
      const inFlightDecision = parseDecision(inflightRaw[2]);
      const inFlightCount = inflightRaw[3] ?? inflightRaw[0];
      const member =
        inFlightDecision === DimoProviderLimiterDecision.WOULD_REJECT
          ? null
          : inflightMember(input.priority, leaseId);

      const result: DimoProviderLimiterBeginResult = {
        leaseId: member ? leaseId : null,
        inFlightMember: member,
        mode: input.mode,
        rateDecision,
        inFlightDecision,
        rateWindowCount: rateRaw[0],
        rateWindowLimit: rateRaw[1],
        inFlightCount,
        inFlightLimit: inflightRaw[1],
        redisFailOpen: false,
        tokensRemaining: rateRaw[3],
        rateAlgorithm: input.rateAlgorithm,
      };

      if (!isAdmitted(result) && input.mode === 'shadow') {
        // Shadow: record decision but do not block — no lease retained on reject.
        return result;
      }

      return result;
    } catch (err) {
      this.logger.warn(
        `DIMO provider limiter Redis error (fail-open): ${(err as Error).message}`,
      );
      return {
        leaseId: null,
        inFlightMember: null,
        mode: input.mode,
        rateDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        inFlightDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        rateWindowCount: 0,
        rateWindowLimit: capacity,
        inFlightCount: 0,
        inFlightLimit: input.maxInFlight,
        redisFailOpen: true,
        rateAlgorithm: input.rateAlgorithm,
      };
    }
  }

  private async acquireRateBudget(
    input: DimoProviderLimiterBeginInput,
    nowMs: number,
    capacity: number,
  ): Promise<[number, number, string, number?]> {
    if (input.rateAlgorithm === 'fixed_window') {
      const epochSecond = Math.floor(nowMs / 1000);
      const rateKey = dimoProviderRateKey(epochSecond);
      const raw = (await this.redis.eval(
        DIMO_PROVIDER_RATE_SCRIPT,
        1,
        rateKey,
        String(capacity),
      )) as [number, number, string];
      return [raw[0], raw[1], raw[2]];
    }

    const raw = (await this.redis.eval(
      DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT,
      1,
      dimoProviderTokenBucketKey(),
      String(nowMs),
      String(input.rateLimitPerSecond),
      String(capacity),
    )) as [number, number, string, number];
    return [raw[0], raw[1], raw[2], raw[3]];
  }

  async end(inFlightMember: string | null): Promise<void> {
    if (!inFlightMember) return;
    try {
      await this.redis.eval(
        DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
        1,
        dimoProviderInflightKey(),
        inFlightMember,
      );
    } catch (err) {
      this.logger.warn(
        `DIMO provider limiter release failed member=${inFlightMember}: ${(err as Error).message}`,
      );
    }
  }

  async setProviderCooldown(retryAfterSeconds: number, maxSeconds: number): Promise<void> {
    const bounded = Math.max(1, Math.min(retryAfterSeconds, maxSeconds));
    const endsAtMs = Date.now() + bounded * 1000;
    try {
      await this.redis.eval(
        DIMO_PROVIDER_COOLDOWN_SET_SCRIPT,
        1,
        dimoProviderCooldownKey(),
        String(endsAtMs),
        String(bounded),
      );
    } catch (err) {
      this.logger.warn(
        `DIMO provider cooldown set failed: ${(err as Error).message}`,
      );
    }
  }

  async getProviderCooldownRemainingMs(nowMs = Date.now()): Promise<number> {
    try {
      const raw = await this.redis.get(dimoProviderCooldownKey());
      if (!raw) return 0;
      const endsAt = Number.parseInt(raw, 10);
      if (!Number.isFinite(endsAt)) return 0;
      return Math.max(0, endsAt - nowMs);
    } catch {
      return 0;
    }
  }

  private bypassResult(input: DimoProviderLimiterBeginInput): DimoProviderLimiterBeginResult {
    return {
      leaseId: null,
      inFlightMember: null,
      mode: input.mode,
      rateDecision: DimoProviderLimiterDecision.BYPASS,
      inFlightDecision: DimoProviderLimiterDecision.BYPASS,
      rateWindowCount: 0,
      rateWindowLimit: input.rateLimitPerSecond + input.rateBurst,
      inFlightCount: 0,
      inFlightLimit: input.maxInFlight,
      redisFailOpen: false,
      rateAlgorithm: input.rateAlgorithm,
    };
  }
}

export function isDimoProviderAdmissionGranted(
  begin: DimoProviderLimiterBeginResult,
): boolean {
  if (begin.redisFailOpen || begin.mode !== 'enforce') {
    return true;
  }
  return isAdmitted(begin);
}
