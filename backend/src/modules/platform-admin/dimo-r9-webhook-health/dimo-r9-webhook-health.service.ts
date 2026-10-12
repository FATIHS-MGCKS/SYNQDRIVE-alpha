import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHash } from 'node:crypto';
import dimoR9WebhookHealthConfig from '@config/dimo-r9-webhook-health.config';
import { DimoTriggersService } from '../../dimo/dimo-triggers.service';
import { RedisService } from '@shared/redis/redis.service';
import {
  R9_DEFINITION_CONTRACTS,
  R9_IGNITION_ID,
  R9_SPEED_ID,
  classifyDimoApiError,
  evaluateR9DefinitionHealth,
  parseSubscriberList,
} from './dimo-r9-webhook-health.evaluator';
import type {
  DimoProviderAccessState,
  DimoR9WebhookAlertDto,
  DimoR9WebhookChannelDto,
  DimoR9WebhookDefinitionDto,
  DimoR9WebhookHealthDto,
  DimoR9WebhookOverallState,
} from './dimo-r9-webhook-health.types';

interface CachedSnapshot {
  payload: DimoR9WebhookHealthDto;
  storedAtMs: number;
}

function stableId(id: string): string {
  return createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

function pickDefinition(raw: Record<string, unknown> | null | undefined): DimoR9WebhookDefinitionDto | null {
  if (!raw || raw.id == null) return null;
  const id = String(raw.id);
  const metricName = raw.metricName != null ? String(raw.metricName) : null;
  let triggerSemantics = 'DIMO Vehicle Trigger';
  if (metricName === 'vss.speed') triggerSemantics = 'Geschwindigkeit > 3 km/h (R9 Wake)';
  if (metricName === 'vss.isIgnitionOn') triggerSemantics = 'Zündung AN (R9 Wake)';
  return {
    id,
    stableId: stableId(id),
    displayName: raw.displayName != null ? String(raw.displayName) : null,
    metricName,
    service: raw.service != null ? String(raw.service) : null,
    condition: raw.condition != null ? String(raw.condition) : null,
    coolDownPeriod:
      typeof raw.coolDownPeriod === 'number' && !Number.isNaN(raw.coolDownPeriod)
        ? raw.coolDownPeriod
        : null,
    status: raw.status != null ? String(raw.status) : null,
    failureCount:
      typeof raw.failureCount === 'number' && !Number.isNaN(raw.failureCount)
        ? raw.failureCount
        : null,
    triggerSemantics,
  };
}

function mapProviderState(classified: ReturnType<typeof classifyDimoApiError>): DimoProviderAccessState {
  switch (classified.state) {
    case 'AUTH_ERROR':
      return 'AUTH_ERROR';
    case 'RATE_LIMIT':
      return 'RATE_LIMIT';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'PROVIDER_5XX':
      return 'PROVIDER_5XX';
    case 'ERROR':
      return 'ERROR';
    default:
      return 'UNKNOWN';
  }
}

function channelStateFromAlerts(
  healthy: boolean,
  providerOk: boolean,
  isStale: boolean,
): DimoR9WebhookOverallState {
  if (!providerOk && isStale) return 'STALE';
  if (!providerOk) return 'UNKNOWN';
  if (healthy) return 'HEALTHY';
  return 'CRITICAL';
}

function aggregateOverall(
  speed: DimoR9WebhookChannelDto,
  ignition: DimoR9WebhookChannelDto,
  providerAccessState: DimoProviderAccessState,
  isStale: boolean,
): DimoR9WebhookOverallState {
  if (providerAccessState === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (isStale) return 'STALE';
  if (providerAccessState !== 'OK') return 'UNKNOWN';
  const states = [speed.state, ignition.state];
  if (states.includes('CRITICAL')) return 'CRITICAL';
  if (states.includes('STALE')) return 'STALE';
  if (states.every((s) => s === 'HEALTHY')) return 'HEALTHY';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  return 'DEGRADED';
}

@Injectable()
export class DimoR9WebhookHealthService {
  private readonly logger = new Logger(DimoR9WebhookHealthService.name);
  private memoryCache: CachedSnapshot | null = null;
  private inFlight: Promise<DimoR9WebhookHealthDto> | null = null;

  constructor(
    private readonly triggers: DimoTriggersService,
    @Inject(dimoR9WebhookHealthConfig.KEY)
    private readonly config: ConfigType<typeof dimoR9WebhookHealthConfig>,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async getHealth(options: { forceRefresh?: boolean } = {}): Promise<DimoR9WebhookHealthDto> {
    const nowMs = Date.now();
    const forceRefresh = options.forceRefresh === true;

    if (!forceRefresh) {
      const cached = await this.readCache(nowMs);
      if (cached) return cached;
    }

    if (forceRefresh) {
      const rate = await this.checkRateLimit(nowMs);
      if (!rate.allowed) {
        const cached = await this.readCache(nowMs, true);
        if (cached) {
          return {
            ...cached,
            rateLimitRetryAfterMs: rate.retryAfterMs,
            diagnostics: [
              ...cached.diagnostics,
              'Manuelle Aktualisierung rate-limitiert — angezeigte Daten können veraltet sein.',
            ],
          };
        }
        throw new ServiceUnavailableException({
          code: 'RATE_LIMIT_ENFORCED',
          retryAfterMs: rate.retryAfterMs,
        });
      }
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchAndCache(nowMs, forceRefresh).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readCache(nowMs: number, allowStale = false): Promise<DimoR9WebhookHealthDto | null> {
    const mem = this.memoryCache;
    if (mem && mem.storedAtMs + this.config.cacheTtlMs > nowMs) {
      return { ...mem.payload, servedFromCache: true };
    }

    if (!this.redis) return null;

    try {
      const raw = await this.redis.get(this.config.redisCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DimoR9WebhookHealthDto;
      const checkedMs = parsed.checkedAt ? Date.parse(parsed.checkedAt) : 0;
      const fresh = checkedMs > 0 && nowMs - checkedMs <= this.config.cacheTtlMs;
      if (fresh || allowStale) {
        this.memoryCache = { payload: parsed, storedAtMs: nowMs };
        const isStale =
          checkedMs > 0 && nowMs - checkedMs > this.config.staleAfterMs;
        return {
          ...parsed,
          isStale: isStale || parsed.isStale,
          servedFromCache: true,
        };
      }
    } catch (err) {
      this.logger.warn(`dimo_r9_webhook_health_cache_read_failed: ${String(err)}`);
    }
    return null;
  }

  private async checkRateLimit(nowMs: number): Promise<{ allowed: boolean; retryAfterMs: number | null }> {
    const minMs = this.config.minProviderFetchIntervalMs;
    if (minMs <= 0) return { allowed: true, retryAfterMs: null };

    let lastFetch = this.memoryCache?.storedAtMs ?? 0;
    if (this.redis) {
      try {
        const v = await this.redis.get(this.config.redisLastFetchKey);
        if (v) lastFetch = Math.max(lastFetch, Number(v) || 0);
      } catch {
        /* ignore */
      }
    }
    if (lastFetch > 0 && nowMs - lastFetch < minMs) {
      return { allowed: false, retryAfterMs: minMs - (nowMs - lastFetch) };
    }
    return { allowed: true, retryAfterMs: null };
  }

  private async acquireFetchLock(): Promise<boolean> {
    if (!this.redis) return true;
    try {
      const res = await this.redis.set(this.config.redisLockKey, '1', 'EX', 25, 'NX');
      return res === 'OK';
    } catch {
      return true;
    }
  }

  private async releaseFetchLock(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.config.redisLockKey);
    } catch {
      /* ignore */
    }
  }

  private async fetchAndCache(nowMs: number, forceRefresh: boolean): Promise<DimoR9WebhookHealthDto> {
    const lockOk = await this.acquireFetchLock();
    if (!lockOk) {
      const cached = await this.readCache(nowMs, true);
      if (cached) return cached;
    }

    try {
      const snapshot = await this.probeProvider(nowMs);
      await this.storeCache(snapshot, nowMs);
      return snapshot;
    } finally {
      if (lockOk) await this.releaseFetchLock();
    }
  }

  private async storeCache(snapshot: DimoR9WebhookHealthDto, nowMs: number): Promise<void> {
    this.memoryCache = { payload: snapshot, storedAtMs: nowMs };
    if (!this.redis) return;
    try {
      const ttlSec = Math.max(1, Math.ceil(this.config.cacheTtlMs / 1000));
      await this.redis.setex(this.config.redisCacheKey, ttlSec, JSON.stringify(snapshot));
      await this.redis.set(this.config.redisLastFetchKey, String(nowMs));
    } catch (err) {
      this.logger.warn(`dimo_r9_webhook_health_cache_write_failed: ${String(err)}`);
    }
  }

  private async probeProvider(nowMs: number): Promise<DimoR9WebhookHealthDto> {
    const generatedAt = new Date(nowMs).toISOString();
    const expected = [...this.config.authorizedCohortTokenIds];
    const excluded = [...this.config.excludedTokenIds];
    const cohortOptions = { expectedCohort: expected, excludedTokens: excluded };

    const emptyChannel = (
      kind: 'speed' | 'ignition',
      webhookId: string,
      state: DimoR9WebhookOverallState,
    ): DimoR9WebhookChannelDto => ({
      webhookId,
      kind,
      state,
      healthy: false,
      definition: null,
      subscriberTokenIds: [],
      expectedSubscriberTokenIds: expected,
      subscriberCount: 0,
      alerts: [],
    });

    let providerAccessState: DimoProviderAccessState = 'UNKNOWN';
    let lastProviderError: DimoR9WebhookHealthDto['lastProviderError'] = null;
    let lastSuccessfulProviderCheckAt: string | null = null;
    const diagnostics: string[] = [];

    try {
      const listResult = await this.triggers.listWebhooksDetailed();
      if (listResult.error) {
        providerAccessState = 'UNAVAILABLE';
        lastProviderError = {
          state: 'UNAVAILABLE',
          message: listResult.error.message.slice(0, 200),
          at: generatedAt,
        };
        diagnostics.push('DIMO Webhook-Liste nicht lesbar.');
        return this.buildResponse({
          generatedAt,
          checkedAt: generatedAt,
          providerAccessState,
          lastProviderError,
          lastSuccessfulProviderCheckAt,
          diagnostics,
          expected,
          excluded,
          speed: emptyChannel('speed', R9_SPEED_ID, 'UNKNOWN'),
          ignition: emptyChannel('ignition', R9_IGNITION_ID, 'UNKNOWN'),
          nowMs,
        });
      }

      providerAccessState = 'OK';
      lastSuccessfulProviderCheckAt = generatedAt;
      const byId = new Map(
        listResult.webhooks.map((w) => [String(w.id), w as Record<string, unknown>]),
      );

      const speedRaw = byId.get(R9_SPEED_ID);
      const ignRaw = byId.get(R9_IGNITION_ID);
      const speedDef = pickDefinition(speedRaw ?? null);
      const ignDef = pickDefinition(ignRaw ?? null);

      const [speedSubs, ignSubs] = await Promise.all([
        this.triggers.getWebhookSubscriberEntries(R9_SPEED_ID),
        this.triggers.getWebhookSubscriberEntries(R9_IGNITION_ID),
      ]);

      const speedParsed = speedSubs.entries
        ? parseSubscriberList(speedSubs.entries)
        : { ok: false as const, error: 'SUBSCRIBERS_FETCH_FAILED', tokenIds: [] as number[] };
      const ignParsed = ignSubs.entries
        ? parseSubscriberList(ignSubs.entries)
        : { ok: false as const, error: 'SUBSCRIBERS_FETCH_FAILED', tokenIds: [] as number[] };

      if (speedSubs.error) {
        providerAccessState = mapProviderState(
          classifyDimoApiError({ response: { status: speedSubs.error.httpStatus }, message: speedSubs.error.message }),
        );
      }

      const speedEval = evaluateR9DefinitionHealth(
        speedRaw ?? null,
        speedParsed.ok ? speedParsed.tokenIds : [],
        R9_DEFINITION_CONTRACTS.speed,
        cohortOptions,
      );
      const ignEval = evaluateR9DefinitionHealth(
        ignRaw ?? null,
        ignParsed.ok ? ignParsed.tokenIds : [],
        R9_DEFINITION_CONTRACTS.ignition,
        cohortOptions,
      );

      const speedAlerts: DimoR9WebhookAlertDto[] = [...speedEval.alerts];
      const ignAlerts: DimoR9WebhookAlertDto[] = [...ignEval.alerts];
      if (!speedParsed.ok) {
        speedAlerts.push({ code: speedParsed.error ?? 'SUBSCRIBERS_PARSE_FAILED', severity: 'CRITICAL' });
      }
      if (!ignParsed.ok) {
        ignAlerts.push({ code: ignParsed.error ?? 'SUBSCRIBERS_PARSE_FAILED', severity: 'CRITICAL' });
      }

      const speedChannel: DimoR9WebhookChannelDto = {
        webhookId: R9_SPEED_ID,
        kind: 'speed',
        healthy: speedEval.healthy && speedParsed.ok,
        state: channelStateFromAlerts(
          speedEval.healthy && speedParsed.ok,
          providerAccessState === 'OK',
          false,
        ),
        definition: speedDef,
        subscriberTokenIds: speedParsed.ok ? speedParsed.tokenIds : [],
        expectedSubscriberTokenIds: expected,
        subscriberCount: speedParsed.ok ? speedParsed.tokenIds.length : 0,
        alerts: speedAlerts,
      };
      const ignChannel: DimoR9WebhookChannelDto = {
        webhookId: R9_IGNITION_ID,
        kind: 'ignition',
        healthy: ignEval.healthy && ignParsed.ok,
        state: channelStateFromAlerts(
          ignEval.healthy && ignParsed.ok,
          providerAccessState === 'OK',
          false,
        ),
        definition: ignDef,
        subscriberTokenIds: ignParsed.ok ? ignParsed.tokenIds : [],
        expectedSubscriberTokenIds: expected,
        subscriberCount: ignParsed.ok ? ignParsed.tokenIds.length : 0,
        alerts: ignAlerts,
      };

      return this.buildResponse({
        generatedAt,
        checkedAt: generatedAt,
        providerAccessState,
        lastProviderError,
        lastSuccessfulProviderCheckAt,
        diagnostics,
        expected,
        excluded,
        speed: speedChannel,
        ignition: ignChannel,
        nowMs,
      });
    } catch (err: unknown) {
      const classified = classifyDimoApiError(err as { response?: { status?: number }; message?: string });
      providerAccessState = mapProviderState(classified);
      lastProviderError = {
        state: providerAccessState,
        message: classified.message?.slice(0, 200) ?? 'provider_error',
        at: generatedAt,
      };
      diagnostics.push('DIMO konnte nicht abgefragt werden.');
      return this.buildResponse({
        generatedAt,
        checkedAt: generatedAt,
        providerAccessState,
        lastProviderError,
        lastSuccessfulProviderCheckAt,
        diagnostics,
        expected,
        excluded,
        speed: emptyChannel('speed', R9_SPEED_ID, 'UNKNOWN'),
        ignition: emptyChannel('ignition', R9_IGNITION_ID, 'UNKNOWN'),
        nowMs,
      });
    }
  }

  private buildResponse(input: {
    generatedAt: string;
    checkedAt: string;
    providerAccessState: DimoProviderAccessState;
    lastProviderError: DimoR9WebhookHealthDto['lastProviderError'];
    lastSuccessfulProviderCheckAt: string | null;
    diagnostics: string[];
    expected: number[];
    excluded: number[];
    speed: DimoR9WebhookChannelDto;
    ignition: DimoR9WebhookChannelDto;
    nowMs: number;
  }): DimoR9WebhookHealthDto {
    const excludedSubscribed = [
      ...new Set(
        [...input.speed.subscriberTokenIds, ...input.ignition.subscriberTokenIds].filter((t) =>
          input.excluded.includes(t),
        ),
      ),
    ];

    const overall = aggregateOverall(
      input.speed,
      input.ignition,
      input.providerAccessState,
      false,
    );

    return {
      generatedAt: input.generatedAt,
      checkedAt: input.checkedAt,
      cacheExpiresAt: new Date(input.nowMs + this.config.cacheTtlMs).toISOString(),
      isStale: false,
      staleReason: null,
      overall,
      providerAccessState: input.providerAccessState,
      lastSuccessfulProviderCheckAt: input.lastSuccessfulProviderCheckAt,
      lastProviderError: input.lastProviderError,
      refreshCadenceMs: 60_000,
      minManualRefreshIntervalMs: this.config.minProviderFetchIntervalMs,
      rateLimitRetryAfterMs: null,
      servedFromCache: false,
      wakePipelineEvidence: 'NOT_EVALUATED',
      cohort: {
        expectedTokenIds: input.expected,
        excludedTokenIds: input.excluded,
        excludedSubscribedTokenIds: excludedSubscribed,
      },
      speed: input.speed,
      ignition: input.ignition,
      diagnostics: input.diagnostics,
    };
  }
}
