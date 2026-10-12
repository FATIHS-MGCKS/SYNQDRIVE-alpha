import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHash } from 'node:crypto';
import dimoR9WebhookHealthConfig from '@config/dimo-r9-webhook-health.config';
import { DimoTriggersService } from '../../dimo/dimo-triggers.service';
import {
  RedisDistributedLockService,
  type DistributedLockHandle,
} from '@shared/redis/redis-distributed-lock.service';
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

const PROVIDER_STATE_RANK: Record<DimoProviderAccessState, number> = {
  OK: 0,
  UNKNOWN: 1,
  ERROR: 2,
  TIMEOUT: 3,
  RATE_LIMIT: 4,
  AUTH_ERROR: 5,
  PROVIDER_5XX: 6,
  UNAVAILABLE: 7,
  NOT_CONFIGURED: 8,
};

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

function mergeProviderAccessState(
  current: DimoProviderAccessState,
  next: DimoProviderAccessState,
): DimoProviderAccessState {
  if (current === 'NOT_CONFIGURED' || next === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (current === 'OK') return next;
  if (next === 'OK') return current;
  return (PROVIDER_STATE_RANK[next] ?? 0) >= (PROVIDER_STATE_RANK[current] ?? 0) ? next : current;
}

function channelStateFromAlerts(
  healthy: boolean,
  channelProviderOk: boolean,
  isStale: boolean,
): DimoR9WebhookOverallState {
  if (isStale && !healthy) return 'STALE';
  if (isStale && healthy) return 'STALE';
  if (!channelProviderOk) return 'UNKNOWN';
  if (healthy) return 'HEALTHY';
  return 'CRITICAL';
}

function staleChannelState(state: DimoR9WebhookOverallState): DimoR9WebhookOverallState {
  if (state === 'HEALTHY' || state === 'DEGRADED') return 'STALE';
  return state;
}

function aggregateOverall(
  speed: DimoR9WebhookChannelDto,
  ignition: DimoR9WebhookChannelDto,
  providerAccessState: DimoProviderAccessState,
  isStale: boolean,
): DimoR9WebhookOverallState {
  if (providerAccessState === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (isStale) {
    const states = [speed.state, ignition.state];
    if (states.includes('CRITICAL')) return 'CRITICAL';
    return 'STALE';
  }
  if (providerAccessState !== 'OK') return 'UNKNOWN';
  const states = [speed.state, ignition.state];
  if (states.includes('CRITICAL')) return 'CRITICAL';
  if (states.includes('STALE')) return 'STALE';
  if (states.every((s) => s === 'HEALTHY')) return 'HEALTHY';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  return 'DEGRADED';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    @Optional() private readonly distributedLock?: RedisDistributedLockService,
  ) {}

  applyFreshnessPolicy(snapshot: DimoR9WebhookHealthDto, nowMs: number): DimoR9WebhookHealthDto {
    const checkedMs = snapshot.checkedAt ? Date.parse(snapshot.checkedAt) : 0;
    const ageMs = checkedMs > 0 ? nowMs - checkedMs : Number.POSITIVE_INFINITY;
    const isStale = ageMs > this.config.staleAfterMs;

    if (!isStale) {
      return { ...snapshot, isStale: false, staleReason: snapshot.staleReason ?? null };
    }

    const staleReason =
      snapshot.staleReason ??
      (ageMs === Number.POSITIVE_INFINITY ? 'MISSING_PROVIDER_CHECK_TIMESTAMP' : 'PROVIDER_CHECK_AGE_EXCEEDED');

    const speed: DimoR9WebhookChannelDto = {
      ...snapshot.speed,
      state: staleChannelState(snapshot.speed.state),
      healthy: false,
    };
    const ignition: DimoR9WebhookChannelDto = {
      ...snapshot.ignition,
      state: staleChannelState(snapshot.ignition.state),
      healthy: false,
    };

    const overall = aggregateOverall(
      speed,
      ignition,
      snapshot.providerAccessState,
      true,
    );

    return {
      ...snapshot,
      isStale: true,
      staleReason,
      overall,
      speed,
      ignition,
    };
  }

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
          return this.applyFreshnessPolicy(
            {
              ...cached,
              rateLimitRetryAfterMs: rate.retryAfterMs,
              diagnostics: [
                ...cached.diagnostics,
                'Manuelle Aktualisierung rate-limitiert — angezeigte Daten können veraltet sein.',
              ],
            },
            nowMs,
          );
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

  private async readCache(nowMs: number, allowExpiredTtl = false): Promise<DimoR9WebhookHealthDto | null> {
    const fromMem = this.readMemoryCache(nowMs, allowExpiredTtl);
    if (fromMem) return fromMem;

    if (!this.redis) return null;

    try {
      const raw = await this.redis.get(this.config.redisCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DimoR9WebhookHealthDto;
      const checkedMs = parsed.checkedAt ? Date.parse(parsed.checkedAt) : 0;
      const withinServeTtl =
        checkedMs > 0 && nowMs - checkedMs <= this.config.cacheTtlMs;
      if (!withinServeTtl && !allowExpiredTtl) return null;

      this.memoryCache = { payload: parsed, storedAtMs: nowMs };
      return this.applyFreshnessPolicy(
        { ...parsed, servedFromCache: true },
        nowMs,
      );
    } catch (err) {
      this.logger.warn(`dimo_r9_webhook_health_cache_read_failed: ${String(err)}`);
    }
    return null;
  }

  private readMemoryCache(nowMs: number, allowExpiredTtl: boolean): DimoR9WebhookHealthDto | null {
    const mem = this.memoryCache;
    if (!mem) return null;
    const checkedMs = mem.payload.checkedAt ? Date.parse(mem.payload.checkedAt) : 0;
    const withinServeTtl =
      checkedMs > 0 && nowMs - checkedMs <= this.config.cacheTtlMs;
    if (!withinServeTtl && !allowExpiredTtl) return null;
    return this.applyFreshnessPolicy({ ...mem.payload, servedFromCache: true }, nowMs);
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

  private async acquireDistributedFetchLock(): Promise<
    | { acquired: true; handle: DistributedLockHandle | null }
    | { acquired: false; reason: 'contended' | 'redis_unavailable' }
  > {
    if (!this.redis || !this.distributedLock) {
      return { acquired: true, handle: null };
    }
    const result = await this.distributedLock.acquire(
      this.config.redisLockKey,
      this.config.redisLockTtlMs,
    );
    if (result.acquired) {
      return { acquired: true, handle: result.handle };
    }
    return { acquired: false, reason: result.reason };
  }

  private async releaseDistributedFetchLock(handle: DistributedLockHandle | null): Promise<void> {
    if (!handle || !this.distributedLock) return;
    await this.distributedLock.release(handle);
  }

  private async waitForPeerCache(nowMs: number): Promise<DimoR9WebhookHealthDto | null> {
    const deadline = nowMs + this.config.lockContentionWaitMs;
    while (Date.now() < deadline) {
      const cached = await this.readCache(Date.now(), true);
      if (cached) return cached;
      await sleep(100);
    }
    return null;
  }

  private async fetchAndCache(nowMs: number, forceRefresh: boolean): Promise<DimoR9WebhookHealthDto> {
    const lock = await this.acquireDistributedFetchLock();
    if (!lock.acquired) {
      const peer = await this.waitForPeerCache(nowMs);
      if (peer) return peer;
      const stale = await this.readCache(nowMs, true);
      if (stale) return stale;
      return this.buildLockContentionFallback(nowMs);
    }

    try {
      const snapshot = await this.probeProvider(nowMs);
      await this.storeCache(snapshot, nowMs);
      return snapshot;
    } finally {
      if (lock.acquired) {
        await this.releaseDistributedFetchLock(lock.handle);
      }
    }
  }

  private buildLockContentionFallback(nowMs: number): DimoR9WebhookHealthDto {
    const generatedAt = new Date(nowMs).toISOString();
    const expected = [...this.config.authorizedCohortTokenIds];
    const excluded = [...this.config.excludedTokenIds];
    const empty = (kind: 'speed' | 'ignition', webhookId: string): DimoR9WebhookChannelDto => ({
      webhookId,
      kind,
      state: 'UNKNOWN',
      healthy: false,
      definition: null,
      subscriberTokenIds: [],
      expectedSubscriberTokenIds: expected,
      subscriberCount: 0,
      alerts: [{ code: 'PROVIDER_FETCH_LOCK_CONTENTION', severity: 'HIGH' }],
    });
    return this.applyFreshnessPolicy(
      this.buildResponse({
        generatedAt,
        checkedAt: null,
        providerAccessState: 'UNKNOWN',
        lastProviderError: null,
        lastSuccessfulProviderCheckAt: null,
        diagnostics: ['Provider-Abfrage durch andere Replica — keine aktuellen Daten.'],
        expected,
        excluded,
        speed: empty('speed', R9_SPEED_ID),
        ignition: empty('ignition', R9_IGNITION_ID),
        nowMs,
        servedFromCache: false,
      }),
      nowMs,
    );
  }

  private async storeCache(snapshot: DimoR9WebhookHealthDto, nowMs: number): Promise<void> {
    this.memoryCache = { payload: snapshot, storedAtMs: nowMs };
    if (!this.redis) return;
    try {
      const ttlSec = Math.max(1, Math.ceil(this.config.cacheTtlMs / 1000));
      await this.redis.setex(this.config.redisCacheKey, ttlSec, JSON.stringify(snapshot));
      if (snapshot.lastSuccessfulProviderCheckAt) {
        await this.redis.set(this.config.redisLastFetchKey, String(nowMs));
      }
    } catch (err) {
      this.logger.warn(`dimo_r9_webhook_health_cache_write_failed: ${String(err)}`);
    }
  }

  private subscriberFetchError(
    kind: 'speed' | 'ignition',
    error: { code: string; message: string; httpStatus?: number },
    at: string,
  ): { access: DimoProviderAccessState; lastError: DimoR9WebhookHealthDto['lastProviderError'] } {
    const access = mapProviderState(
      classifyDimoApiError({ response: { status: error.httpStatus }, message: error.message }),
    );
    return {
      access,
      lastError: {
        state: access,
        message: `${kind}: ${error.message.slice(0, 180)}`,
        at,
      },
    };
  }

  private async probeProvider(nowMs: number): Promise<DimoR9WebhookHealthDto> {
    const generatedAt = new Date(nowMs).toISOString();
    const expected = [...this.config.authorizedCohortTokenIds];
    const excluded = [...this.config.excludedTokenIds];
    const cohortOptions = { expectedCohort: expected, excludedTokens: excluded };

    const cohortValid = this.config.cohortConfigValid !== false;
    const cohortErrors = this.config.cohortConfigErrors ?? [];

    const emptyChannel = (
      kind: 'speed' | 'ignition',
      webhookId: string,
      state: DimoR9WebhookOverallState,
      alerts: DimoR9WebhookAlertDto[] = [],
    ): DimoR9WebhookChannelDto => ({
      webhookId,
      kind,
      state,
      healthy: false,
      definition: null,
      subscriberTokenIds: [],
      expectedSubscriberTokenIds: expected,
      subscriberCount: 0,
      alerts,
    });

    if (!cohortValid) {
      return this.buildResponse({
        generatedAt,
        checkedAt: generatedAt,
        providerAccessState: 'NOT_CONFIGURED',
        lastProviderError: {
          state: 'NOT_CONFIGURED',
          message: cohortErrors.join('; ') || 'invalid_cohort_config',
          at: generatedAt,
        },
        lastSuccessfulProviderCheckAt: null,
        diagnostics: [
          'Ungültige R9-Cohort-Konfiguration — Provider-Paritätsprüfung ausgesetzt.',
          ...cohortErrors.map((e) => `cohort:${e}`),
        ],
        expected,
        excluded,
        speed: emptyChannel('speed', R9_SPEED_ID, 'NOT_CONFIGURED', [
          { code: 'INVALID_COHORT_CONFIG', severity: 'CRITICAL' },
        ]),
        ignition: emptyChannel('ignition', R9_IGNITION_ID, 'NOT_CONFIGURED', [
          { code: 'INVALID_COHORT_CONFIG', severity: 'CRITICAL' },
        ]),
        nowMs,
      });
    }

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

      if (speedSubs.error) {
        const err = this.subscriberFetchError('speed', speedSubs.error, generatedAt);
        providerAccessState = mergeProviderAccessState(providerAccessState, err.access);
        lastProviderError = err.lastError;
        diagnostics.push('Speed-Webhook-Abonnements nicht lesbar.');
      }
      if (ignSubs.error) {
        const err = this.subscriberFetchError('ignition', ignSubs.error, generatedAt);
        providerAccessState = mergeProviderAccessState(providerAccessState, err.access);
        lastProviderError = err.lastError;
        diagnostics.push('Ignition-Webhook-Abonnements nicht lesbar.');
      }

      const speedParsed = speedSubs.entries
        ? parseSubscriberList(speedSubs.entries)
        : { ok: false as const, error: 'SUBSCRIBERS_FETCH_FAILED', tokenIds: [] as number[] };
      const ignParsed = ignSubs.entries
        ? parseSubscriberList(ignSubs.entries)
        : { ok: false as const, error: 'SUBSCRIBERS_FETCH_FAILED', tokenIds: [] as number[] };

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
        speedAlerts.push({
          code: speedParsed.error ?? 'SUBSCRIBERS_PARSE_FAILED',
          severity: 'CRITICAL',
        });
      }
      if (!ignParsed.ok) {
        ignAlerts.push({
          code: ignParsed.error ?? 'SUBSCRIBERS_PARSE_FAILED',
          severity: 'CRITICAL',
        });
      }

      const speedChannelOk = !speedSubs.error && speedParsed.ok;
      const ignChannelOk = !ignSubs.error && ignParsed.ok;

      const speedHealthy = speedEval.healthy && speedChannelOk;
      const ignHealthy = ignEval.healthy && ignChannelOk;

      const speedChannel: DimoR9WebhookChannelDto = {
        webhookId: R9_SPEED_ID,
        kind: 'speed',
        healthy: speedHealthy,
        state: channelStateFromAlerts(speedEval.healthy && speedParsed.ok, speedChannelOk, false),
        definition: speedDef,
        subscriberTokenIds: speedParsed.ok ? speedParsed.tokenIds : [],
        expectedSubscriberTokenIds: expected,
        subscriberCount: speedParsed.ok ? speedParsed.tokenIds.length : 0,
        alerts: speedAlerts,
      };
      const ignChannel: DimoR9WebhookChannelDto = {
        webhookId: R9_IGNITION_ID,
        kind: 'ignition',
        healthy: ignHealthy,
        state: channelStateFromAlerts(ignEval.healthy && ignParsed.ok, ignChannelOk, false),
        definition: ignDef,
        subscriberTokenIds: ignParsed.ok ? ignParsed.tokenIds : [],
        expectedSubscriberTokenIds: expected,
        subscriberCount: ignParsed.ok ? ignParsed.tokenIds.length : 0,
        alerts: ignAlerts,
      };

      const fullReadOk =
        providerAccessState === 'OK' &&
        speedChannelOk &&
        ignChannelOk &&
        speedEval.healthy &&
        ignEval.healthy;

      if (fullReadOk) {
        lastSuccessfulProviderCheckAt = generatedAt;
      } else {
        lastSuccessfulProviderCheckAt = null;
        if (providerAccessState === 'OK' && (!speedChannelOk || !ignChannelOk)) {
          providerAccessState = 'ERROR';
        }
      }

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
    checkedAt: string | null;
    providerAccessState: DimoProviderAccessState;
    lastProviderError: DimoR9WebhookHealthDto['lastProviderError'];
    lastSuccessfulProviderCheckAt: string | null;
    diagnostics: string[];
    expected: number[];
    excluded: number[];
    speed: DimoR9WebhookChannelDto;
    ignition: DimoR9WebhookChannelDto;
    nowMs: number;
    servedFromCache?: boolean;
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

    const snapshot: DimoR9WebhookHealthDto = {
      generatedAt: input.generatedAt,
      checkedAt: input.checkedAt,
      cacheExpiresAt: input.checkedAt
        ? new Date(input.nowMs + this.config.cacheTtlMs).toISOString()
        : null,
      isStale: false,
      staleReason: null,
      overall,
      providerAccessState: input.providerAccessState,
      lastSuccessfulProviderCheckAt: input.lastSuccessfulProviderCheckAt,
      lastProviderError: input.lastProviderError,
      refreshCadenceMs: 60_000,
      minManualRefreshIntervalMs: this.config.minProviderFetchIntervalMs,
      rateLimitRetryAfterMs: null,
      servedFromCache: input.servedFromCache ?? false,
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

    return this.applyFreshnessPolicy(snapshot, input.nowMs);
  }
}
