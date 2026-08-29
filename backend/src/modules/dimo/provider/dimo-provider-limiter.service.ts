import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '@shared/redis/redis.service';
import {
  DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
  DIMO_PROVIDER_RATE_SCRIPT,
  dimoProviderInflightKey,
  dimoProviderRateKey,
} from './dimo-provider-limiter.redis-scripts';
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

@Injectable()
export class DimoProviderLimiterService {
  private readonly logger = new Logger(DimoProviderLimiterService.name);
  private readonly rateScriptSha = new Map<string, string>();

  constructor(private readonly redis: RedisService) {}

  async begin(input: DimoProviderLimiterBeginInput): Promise<DimoProviderLimiterBeginResult> {
    if (input.mode === 'off') {
      return {
        leaseId: null,
        mode: input.mode,
        rateDecision: DimoProviderLimiterDecision.BYPASS,
        inFlightDecision: DimoProviderLimiterDecision.BYPASS,
        rateWindowCount: 0,
        rateWindowLimit: input.rateLimitPerSecond + input.rateBurst,
        inFlightCount: 0,
        inFlightLimit: input.maxInFlight,
        redisFailOpen: false,
      };
    }

    const leaseId = randomUUID();
    const nowMs = Date.now();
    const expiryMs = nowMs + input.inFlightLeaseMs;
    const epochSecond = Math.floor(nowMs / 1000);
    const rateKey = dimoProviderRateKey(epochSecond);
    const inflightKey = dimoProviderInflightKey();
    const maxRate = input.rateLimitPerSecond + input.rateBurst;

    try {
      const [rateRaw, inflightRaw] = await Promise.all([
        this.redis.eval(
          DIMO_PROVIDER_RATE_SCRIPT,
          1,
          rateKey,
          String(maxRate),
        ) as Promise<[number, number, string]>,
        this.redis.eval(
          DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
          1,
          inflightKey,
          String(input.maxInFlight),
          leaseId,
          String(nowMs),
          String(expiryMs),
          input.mode,
        ) as Promise<[number, number, string, number]>,
      ]);

      const rateDecision = parseDecision(rateRaw[2]);
      const inFlightDecision = parseDecision(inflightRaw[2]);
      const inFlightCount = inflightRaw[3] ?? inflightRaw[0];

      return {
        leaseId,
        mode: input.mode,
        rateDecision,
        inFlightDecision,
        rateWindowCount: rateRaw[0],
        rateWindowLimit: rateRaw[1],
        inFlightCount,
        inFlightLimit: inflightRaw[1],
        redisFailOpen: false,
      };
    } catch (err) {
      this.logger.warn(
        `DIMO provider limiter Redis error (fail-open): ${(err as Error).message}`,
      );
      return {
        leaseId: null,
        mode: input.mode,
        rateDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        inFlightDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        rateWindowCount: 0,
        rateWindowLimit: maxRate,
        inFlightCount: 0,
        inFlightLimit: input.maxInFlight,
        redisFailOpen: true,
      };
    }
  }

  async end(leaseId: string | null): Promise<void> {
    if (!leaseId) return;
    try {
      await this.redis.eval(
        DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
        1,
        dimoProviderInflightKey(),
        leaseId,
      );
    } catch (err) {
      this.logger.warn(
        `DIMO provider limiter release failed lease=${leaseId}: ${(err as Error).message}`,
      );
    }
  }
}
