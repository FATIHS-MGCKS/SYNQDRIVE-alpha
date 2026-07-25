import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { RedisService } from '@shared/redis/redis.service';
import type { AiAgentLimitDecision } from './ai-agent-limit.types';
import type { LlmUsage } from '../llm/llm.types';

const CHECK_TOKEN_SCRIPT = `
local org_limit = tonumber(ARGV[1])
local user_limit = tonumber(ARGV[2])
local incr = tonumber(ARGV[3])
local org_current = tonumber(redis.call('GET', KEYS[1]) or '0')
local user_current = tonumber(redis.call('GET', KEYS[2]) or '0')
if org_current + incr > org_limit then
  return 0
end
if user_current + incr > user_limit then
  return 0
end
return 1
`;

const RECORD_TOKEN_SCRIPT = `
local incr = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local org_new = redis.call('INCRBY', KEYS[1], incr)
if org_new == incr then
  redis.call('PEXPIRE', KEYS[1], ttl_ms)
end
local user_new = redis.call('INCRBY', KEYS[2], incr)
if user_new == incr then
  redis.call('PEXPIRE', KEYS[2], ttl_ms)
end
return 1
`;

@Injectable()
export class AiAgentTokenBudgetService {
  private readonly logger = new Logger(AiAgentTokenBudgetService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly redis: RedisService,
  ) {}

  estimateTokensForCall(maxTokens?: number): number {
    const configured = this.aiConfiguration.agentMaxTokensPerLlmCall;
    const requested = maxTokens ?? configured;
    return Math.min(requested, configured);
  }

  async assertWithinBudget(input: {
    organizationId: string;
    userId: string;
    estimatedTokens: number;
  }): Promise<Extract<AiAgentLimitDecision, { allowed: false }> | null> {
    if (!this.aiConfiguration.agentLimitsEnabled || !this.aiConfiguration.agentTokenBudgetEnabled) {
      return null;
    }

    const day = utcDayBucket();
    const ttlMs = msUntilUtcMidnight() + 60_000;
    const orgKey = `synqdrive:ai-chat:tokens:org:${input.organizationId}:${day}`;
    const userKey = `synqdrive:ai-chat:tokens:user:${input.userId}:${day}`;

    try {
      const raw = (await this.redis.eval(
        CHECK_TOKEN_SCRIPT,
        2,
        orgKey,
        userKey,
        String(this.aiConfiguration.agentTokenBudgetPerOrgPerDay),
        String(this.aiConfiguration.agentTokenBudgetPerUserPerDay),
        String(input.estimatedTokens),
      )) as number;

      if (raw === 1) return null;

      return {
        allowed: false,
        kind: 'budget_exceeded',
        retryAfterSeconds: Math.ceil(msUntilUtcMidnight() / 1000),
        scope: 'organization',
        message: {
          de: 'Das tägliche KI-Budget ist erreicht. Bitte versuchen Sie es später erneut.',
          en: 'The daily AI budget has been reached. Please try again later.',
        },
      };
    } catch (err: unknown) {
      if (this.aiConfiguration.agentLimitsFailOpen) {
        this.logger.warn(
          `AI token budget check failed — fail-open: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return null;
      }
      throw err;
    }
  }

  async recordUsage(input: {
    organizationId: string;
    userId: string;
    usage?: LlmUsage;
  }): Promise<void> {
    if (!this.aiConfiguration.agentLimitsEnabled || !this.aiConfiguration.agentTokenBudgetEnabled) {
      return;
    }
    const actual = input.usage?.totalTokens ?? 0;
    if (actual <= 0) return;

    const day = utcDayBucket();
    const ttlMs = msUntilUtcMidnight() + 60_000;
    const orgKey = `synqdrive:ai-chat:tokens:org:${input.organizationId}:${day}`;
    const userKey = `synqdrive:ai-chat:tokens:user:${input.userId}:${day}`;

    try {
      await this.redis.eval(
        RECORD_TOKEN_SCRIPT,
        2,
        orgKey,
        userKey,
        String(actual),
        String(ttlMs),
      );
    } catch (err: unknown) {
      if (!this.aiConfiguration.agentLimitsFailOpen) {
        throw err;
      }
      this.logger.warn(
        `AI token budget record failed — swallowed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function utcDayBucket(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function msUntilUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, next - now);
}
