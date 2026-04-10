import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { RedisService } from '@shared/redis/redis.service';
import { Wallet } from 'ethers';
import axios from 'axios';
import * as crypto from 'crypto';
import dimoConfig from '@config/dimo.config';

const DEVELOPER_JWT_KEY = 'dimo:developer:jwt';
const VEHICLE_JWT_PREFIX = 'dimo:vehicle:jwt:';
const VEHICLE_JWT_LOCK_PREFIX = 'dimo:vehicle:jwt:lock:';
const LOCK_TTL_SECONDS = 30;
const LOCK_RETRY_DELAY_MS = 500;
const MAX_LOCK_RETRIES = 10;

const MAX_EVENT_LOG = 100;

export interface TokenEvent {
  timestamp: string;
  type: 'DEVELOPER_JWT' | 'VEHICLE_JWT';
  action: 'FETCH' | 'CACHE_HIT' | 'REFRESH' | 'EXPIRED';
  success: boolean;
  tokenId?: number;
  durationMs?: number;
  errorMessage?: string;
  errorCode?: string;
  httpStatus?: number;
  expiresAt?: string;
  ttlSeconds?: number;
  source?: 'redis' | 'memory' | 'api';
}

export interface TokenHealthSnapshot {
  developer: {
    status: 'VALID' | 'EXPIRED' | 'ERROR' | 'NEVER_ACQUIRED';
    lastAcquiredAt: string | null;
    expiresAt: string | null;
    ttlRemainingSeconds: number | null;
    totalFetches: number;
    totalSuccesses: number;
    totalFailures: number;
    consecutiveFailures: number;
    lastErrorAt: string | null;
    lastError: string | null;
    lastErrorHttpStatus: number | null;
    avgFetchDurationMs: number | null;
  };
  vehicles: Record<
    number,
    {
      status: 'VALID' | 'EXPIRED' | 'ERROR' | 'NEVER_ACQUIRED';
      lastAcquiredAt: string | null;
      expiresAt: string | null;
      ttlRemainingSeconds: number | null;
      totalFetches: number;
      totalSuccesses: number;
      totalFailures: number;
      consecutiveFailures: number;
      lastErrorAt: string | null;
      lastError: string | null;
      lastErrorHttpStatus: number | null;
      avgFetchDurationMs: number | null;
    }
  >;
  recentEvents: TokenEvent[];
  dimoEndpoints: {
    authUrl: string;
    tokenExchangeUrl: string;
    telemetryApiUrl: string;
    identityApiUrl: string;
  };
  config: {
    clientId: string;
    nftContractAddress: string;
    signerWallet: string;
    vehicleJwtTtlConfigured: number;
    vehicleJwtRefreshMargin: number;
    requestTimeoutMs: number;
  };
}

interface TokenStats {
  lastAcquiredAt: number | null;
  expiresAt: number | null;
  totalFetches: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastErrorAt: number | null;
  lastError: string | null;
  lastErrorHttpStatus: number | null;
  fetchDurations: number[];
}

@Injectable()
export class DimoAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DimoAuthService.name);
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly memoryCache = new Map<string, { jwt: string; expiresAt: number }>();

  private readonly developerStats: TokenStats = this.emptyStats();
  private readonly vehicleStats = new Map<number, TokenStats>();
  private readonly eventLog: TokenEvent[] = [];

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    private readonly redis: RedisService,
  ) {
    if (!this.conf.clientId) {
      this.logger.warn('DIMO_CLIENT_ID not set — DIMO auth will fail until configured');
    }
    if (!this.conf.privateKey) {
      this.logger.warn('DIMO_PRIVATE_KEY not set — DIMO auth will fail until configured');
    }
    this.logger.log(
      `DimoAuthService initialised — client=${this.conf.clientId || '(not set)'}, NFT contract=${this.conf.vehicleNftContractAddress}`,
    );
  }

  onModuleInit() {
    // Pre-warm the Developer JWT immediately on startup so the refresh timer
    // is set from the very first second — no reactive delay on first request.
    if (this.conf.clientId && this.conf.privateKey) {
      this.getDeveloperJwt().catch((err) =>
        this.logger.warn(`Startup Developer JWT pre-warm failed: ${(err as Error).message}`),
      );
    }
  }

  onModuleDestroy() {
    for (const [key, timer] of this.refreshTimers) {
      clearTimeout(timer);
      this.refreshTimers.delete(key);
    }
    this.logger.log('Cleared all refresh timers');
  }

  // ─── Health snapshot (read-only, for monitoring) ─────────────────

  getHealthSnapshot(): TokenHealthSnapshot {
    const now = Math.floor(Date.now() / 1000);

    const devExp = this.developerStats.expiresAt;
    const devStatus: TokenHealthSnapshot['developer']['status'] =
      this.developerStats.totalFetches === 0
        ? 'NEVER_ACQUIRED'
        : devExp && devExp > now
          ? 'VALID'
          : this.developerStats.consecutiveFailures > 0
            ? 'ERROR'
            : 'EXPIRED';

    const vehicles: TokenHealthSnapshot['vehicles'] = {};
    for (const [tokenId, s] of this.vehicleStats) {
      const vExp = s.expiresAt;
      vehicles[tokenId] = {
        status:
          s.totalFetches === 0
            ? 'NEVER_ACQUIRED'
            : vExp && vExp > now
              ? 'VALID'
              : s.consecutiveFailures > 0
                ? 'ERROR'
                : 'EXPIRED',
        lastAcquiredAt: s.lastAcquiredAt ? new Date(s.lastAcquiredAt * 1000).toISOString() : null,
        expiresAt: s.expiresAt ? new Date(s.expiresAt * 1000).toISOString() : null,
        ttlRemainingSeconds: vExp ? Math.max(vExp - now, 0) : null,
        totalFetches: s.totalFetches,
        totalSuccesses: s.totalSuccesses,
        totalFailures: s.totalFailures,
        consecutiveFailures: s.consecutiveFailures,
        lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt * 1000).toISOString() : null,
        lastError: s.lastError,
        lastErrorHttpStatus: s.lastErrorHttpStatus,
        avgFetchDurationMs: s.fetchDurations.length
          ? Math.round(s.fetchDurations.reduce((a, b) => a + b, 0) / s.fetchDurations.length)
          : null,
      };
    }

    return {
      developer: {
        status: devStatus,
        lastAcquiredAt: this.developerStats.lastAcquiredAt
          ? new Date(this.developerStats.lastAcquiredAt * 1000).toISOString()
          : null,
        expiresAt: devExp ? new Date(devExp * 1000).toISOString() : null,
        ttlRemainingSeconds: devExp ? Math.max(devExp - now, 0) : null,
        totalFetches: this.developerStats.totalFetches,
        totalSuccesses: this.developerStats.totalSuccesses,
        totalFailures: this.developerStats.totalFailures,
        consecutiveFailures: this.developerStats.consecutiveFailures,
        lastErrorAt: this.developerStats.lastErrorAt
          ? new Date(this.developerStats.lastErrorAt * 1000).toISOString()
          : null,
        lastError: this.developerStats.lastError,
        lastErrorHttpStatus: this.developerStats.lastErrorHttpStatus,
        avgFetchDurationMs: this.developerStats.fetchDurations.length
          ? Math.round(
              this.developerStats.fetchDurations.reduce((a, b) => a + b, 0) /
                this.developerStats.fetchDurations.length,
            )
          : null,
      },
      vehicles,
      recentEvents: [...this.eventLog].reverse(),
      dimoEndpoints: {
        authUrl: this.conf.authUrl,
        tokenExchangeUrl: this.conf.tokenExchangeUrl ?? 'https://token-exchange-api.dimo.zone',
        telemetryApiUrl: this.conf.telemetryApiUrl,
        identityApiUrl: this.conf.apiUrl,
      },
      config: {
        clientId: this.conf.clientId ? this.conf.clientId.substring(0, 10) + '…' : '(not set)',
        nftContractAddress: this.conf.vehicleNftContractAddress,
        signerWallet: this.conf.privateKey ? '(configured)' : '(not set)',
        vehicleJwtTtlConfigured: this.conf.vehicleJwtTtlSeconds,
        vehicleJwtRefreshMargin: this.conf.vehicleJwtRefreshMarginSeconds,
        requestTimeoutMs: this.conf.requestTimeoutMs,
      },
    };
  }

  // ─── Developer JWT ──────────────────────────────────────────────

  async getDeveloperJwt(): Promise<string> {
    if (!this.conf.clientId || !this.conf.privateKey) {
      throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set in .env. Get them from https://console.dimo.org');
    }
    const cached = await this.safeRedisGet(DEVELOPER_JWT_KEY);
    if (cached) {
      // After a restart the timer is gone — re-arm it so the token is refreshed
      // proactively before it expires, without waiting for a live request.
      this.ensureRefreshTimer(DEVELOPER_JWT_KEY, cached, () => this.fetchAndCacheDeveloperJwt());
      this.syncStatsFromCachedToken('developer', cached);
      this.pushEvent({ type: 'DEVELOPER_JWT', action: 'CACHE_HIT', success: true, source: 'redis' });
      return cached;
    }
    const mem = this.memoryCache.get(DEVELOPER_JWT_KEY);
    if (mem && mem.expiresAt > Date.now() / 1000 + 60) {
      this.ensureRefreshTimer(DEVELOPER_JWT_KEY, mem.jwt, () => this.fetchAndCacheDeveloperJwt());
      this.syncStatsFromCachedToken('developer', mem.jwt);
      this.pushEvent({ type: 'DEVELOPER_JWT', action: 'CACHE_HIT', success: true, source: 'memory' });
      return mem.jwt;
    }
    return this.fetchAndCacheDeveloperJwt();
  }

  private async fetchAndCacheDeveloperJwt(): Promise<string> {
    const { clientId, privateKey, requestTimeoutMs } = this.conf;
    const domain = this.conf.redirectUri || 'https://auth.dimo.zone';
    const authUrl = 'https://auth.dimo.zone';
    const start = Date.now();

    try {
      this.logger.debug(`Requesting Developer JWT — client=${clientId}, address=client_id (SDK flow)`);

      // Step 1: Generate challenge — address MUST be the client_id (the developer license address),
      // not the signer's derived address. This is what the official DIMO SDK does.
      const challengeRes = await axios.post<{ challenge: string; state: string }>(
        `${authUrl}/auth/web3/generate_challenge`,
        null,
        {
          params: {
            client_id: clientId,
            domain,
            scope: 'openid email',
            response_type: 'code',
            address: clientId,
          },
          headers: { 'Content-Type': 'application/json' },
          timeout: requestTimeoutMs,
        },
      );

      const { challenge, state } = challengeRes.data;
      if (!challenge || !state) {
        throw new Error('DIMO generate_challenge returned no challenge or state');
      }

      // Step 2: Sign the challenge with the private key (API key from DIMO console).
      // The SDK normalises the key as: '0x' + Buffer.from(private_key, 'utf8')
      // which for a hex string is identical to '0x' + privateKey.
      const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const wallet = new Wallet(normalizedKey);
      this.logger.debug(`Signing challenge — signer=${wallet.address}`);
      const signature = await wallet.signMessage(challenge);

      // Step 3: Submit signature — SDK extracts the 'developer_jwt' field from response
      const submitBody = new URLSearchParams({
        client_id: clientId,
        domain,
        grant_type: 'authorization_code',
        state,
        signature,
      });

      const submitRes = await axios.post<{ developer_jwt?: string; access_token?: string; token?: string }>(
        `${authUrl}/auth/web3/submit_challenge`,
        submitBody.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: requestTimeoutMs,
        },
      );

      const token =
        submitRes.data?.developer_jwt ?? submitRes.data?.access_token ?? submitRes.data?.token;
      if (!token) {
        throw new Error(
          `DIMO submit_challenge returned no token. Response: ${JSON.stringify(submitRes.data).substring(0, 300)}`,
        );
      }

      const durationMs = Date.now() - start;
      const ttlSeconds = this.cacheJwtInRedis(DEVELOPER_JWT_KEY, token);
      this.scheduleRefresh(DEVELOPER_JWT_KEY, ttlSeconds, () => this.fetchAndCacheDeveloperJwt());

      const expAt = this.decodeExp(token);
      this.developerStats.lastAcquiredAt = Math.floor(Date.now() / 1000);
      this.developerStats.expiresAt = expAt;
      this.developerStats.totalFetches++;
      this.developerStats.totalSuccesses++;
      this.developerStats.consecutiveFailures = 0;
      this.developerStats.fetchDurations.push(durationMs);
      if (this.developerStats.fetchDurations.length > 50) this.developerStats.fetchDurations.shift();

      this.pushEvent({
        type: 'DEVELOPER_JWT',
        action: 'FETCH',
        success: true,
        durationMs,
        ttlSeconds,
        expiresAt: new Date(expAt * 1000).toISOString(),
        source: 'api',
      });

      this.logger.log(`Developer JWT acquired via SDK (${durationMs}ms)`);
      return token;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const httpStatus = err.response?.status ?? err.statusCode ?? null;
      const errMsg = this.extractErrorMessage(err);
      const errBody = err.response?.data
        ? JSON.stringify(err.response.data).substring(0, 300)
        : String(err.message);

      this.developerStats.totalFetches++;
      this.developerStats.totalFailures++;
      this.developerStats.consecutiveFailures++;
      this.developerStats.lastErrorAt = Math.floor(Date.now() / 1000);
      this.developerStats.lastError = errMsg;
      this.developerStats.lastErrorHttpStatus = httpStatus;

      this.pushEvent({
        type: 'DEVELOPER_JWT',
        action: 'FETCH',
        success: false,
        durationMs,
        errorMessage: errMsg,
        errorCode: err.code,
        httpStatus,
        source: 'api',
      });

      this.logger.error(
        `Developer JWT acquisition failed (HTTP ${httpStatus ?? 'N/A'}): ${errMsg} | body: ${errBody}`,
      );
      throw err;
    }
  }

  // ─── Vehicle JWT (unchanged) ────────────────────────────────────

  async getVehicleJwt(tokenId: number, privileges: number[] = [1, 2, 3, 4, 5, 6]): Promise<string> {
    const sortedPrivs = [...privileges].sort((a, b) => a - b);
    const cacheKey = this.vehicleCacheKey(tokenId, sortedPrivs);

    const cached = await this.safeRedisGet(cacheKey);
    if (cached) {
      this.ensureRefreshTimer(cacheKey, cached, () =>
        this.fetchVehicleJwtWithLock(tokenId, sortedPrivs, cacheKey),
      );
      this.pushEvent({ type: 'VEHICLE_JWT', action: 'CACHE_HIT', success: true, tokenId, source: 'redis' });
      return cached;
    }
    const mem = this.memoryCache.get(cacheKey);
    if (mem && mem.expiresAt > Date.now() / 1000 + 60) {
      this.ensureRefreshTimer(cacheKey, mem.jwt, () =>
        this.fetchVehicleJwtWithLock(tokenId, sortedPrivs, cacheKey),
      );
      this.pushEvent({ type: 'VEHICLE_JWT', action: 'CACHE_HIT', success: true, tokenId, source: 'memory' });
      return mem.jwt;
    }

    return this.fetchVehicleJwtWithLock(tokenId, sortedPrivs, cacheKey);
  }

  private async fetchVehicleJwtWithLock(
    tokenId: number,
    privileges: number[],
    cacheKey: string,
    retries = 0,
  ): Promise<string> {
    const lockKey = `${VEHICLE_JWT_LOCK_PREFIX}${tokenId}:${this.privilegesHash(privileges)}`;
    let acquired: string | null = null;
    let redisDown = false;
    try {
      acquired = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    } catch {
      redisDown = true;
      this.logger.warn('Redis lock unavailable, fetching vehicle JWT without lock');
    }

    if (!redisDown && acquired !== 'OK') {
      if (retries >= MAX_LOCK_RETRIES) {
        throw new Error(`Failed to acquire lock for vehicle JWT (tokenId=${tokenId}) after ${MAX_LOCK_RETRIES} retries`);
      }
      await this.delay(LOCK_RETRY_DELAY_MS);
      const cached = await this.safeRedisGet(cacheKey);
      if (cached) return cached;
      const mem = this.memoryCache.get(cacheKey);
      if (mem && mem.expiresAt > Date.now() / 1000 + 60) return mem.jwt;
      return this.fetchVehicleJwtWithLock(tokenId, privileges, cacheKey, retries + 1);
    }

    const start = Date.now();
    const stats = this.getOrCreateVehicleStats(tokenId);

    try {
      const cachedAfterLock = await this.safeRedisGet(cacheKey);
      if (cachedAfterLock) return cachedAfterLock;
      const memAfter = this.memoryCache.get(cacheKey);
      if (memAfter && memAfter.expiresAt > Date.now() / 1000 + 60) return memAfter.jwt;

      const developerJwt = await this.getDeveloperJwt();
      const tokenExchangeUrl = this.conf.tokenExchangeUrl ?? 'https://token-exchange-api.dimo.zone';
      const { requestTimeoutMs } = this.conf;

      this.logger.debug(`Exchanging vehicle JWT at ${tokenExchangeUrl} for tokenId=${tokenId}, privileges=[${privileges}]`);
      const response = await axios.post<{ token?: string; access_token?: string; jwt?: string }>(
        `${tokenExchangeUrl}/v1/tokens/exchange`,
        { nftContractAddress: this.conf.vehicleNftContractAddress, privileges, tokenId },
        {
          headers: {
            Authorization: `Bearer ${developerJwt}`,
            'Content-Type': 'application/json',
          },
          timeout: requestTimeoutMs,
        },
      );

      const vehicleJwt = response.data?.token ?? response.data?.access_token ?? response.data?.jwt;
      if (!vehicleJwt) {
        throw new Error(`DIMO token exchange returned no JWT for tokenId=${tokenId}`);
      }

      const durationMs = Date.now() - start;
      const ttlSeconds = this.cacheJwtInRedis(cacheKey, vehicleJwt);
      this.scheduleRefresh(cacheKey, ttlSeconds, () =>
        this.fetchVehicleJwtWithLock(tokenId, privileges, cacheKey),
      );

      const expAt = this.decodeExp(vehicleJwt);
      stats.lastAcquiredAt = Math.floor(Date.now() / 1000);
      stats.expiresAt = expAt;
      stats.totalFetches++;
      stats.totalSuccesses++;
      stats.consecutiveFailures = 0;
      stats.fetchDurations.push(durationMs);
      if (stats.fetchDurations.length > 50) stats.fetchDurations.shift();

      this.pushEvent({
        type: 'VEHICLE_JWT',
        action: 'FETCH',
        success: true,
        tokenId,
        durationMs,
        ttlSeconds,
        expiresAt: new Date(expAt * 1000).toISOString(),
        source: 'api',
      });

      this.logger.log(`Vehicle JWT acquired for tokenId=${tokenId}`);
      return vehicleJwt;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const httpStatus = err.response?.status;
      const errMsg = this.extractErrorMessage(err);

      stats.totalFetches++;
      stats.totalFailures++;
      stats.consecutiveFailures++;
      stats.lastErrorAt = Math.floor(Date.now() / 1000);
      stats.lastError = errMsg;
      stats.lastErrorHttpStatus = httpStatus ?? null;

      this.pushEvent({
        type: 'VEHICLE_JWT',
        action: 'FETCH',
        success: false,
        tokenId,
        durationMs,
        errorMessage: errMsg,
        errorCode: err.code,
        httpStatus,
        source: 'api',
      });

      this.logger.error(`Failed to get vehicle JWT for tokenId=${tokenId}: ${(err as Error).message}`);
      throw err;
    } finally {
      try {
        await this.redis.del(lockKey);
      } catch {
        // ignore Redis errors on cleanup
      }
    }
  }

  // ─── JWT caching helpers ────────────────────────────────────────

  private cacheJwtInRedis(key: string, jwt: string): number {
    const expSeconds = this.decodeExp(jwt);
    const margin = this.conf.vehicleJwtRefreshMarginSeconds;
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(expSeconds - now - margin, 10);

    this.safeRedisSet(key, jwt, ttl);
    this.memoryCache.set(key, { jwt, expiresAt: expSeconds });
    return ttl;
  }

  private async safeRedisGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Redis GET failed (${key}), using memory fallback: ${(err as Error).message}`);
      return null;
    }
  }

  private safeRedisSet(key: string, value: string, ttlSeconds: number): void {
    this.redis.set(key, value, 'EX', ttlSeconds).catch((err) =>
      this.logger.warn(`Redis SET failed (${key}), using memory fallback: ${(err as Error).message}`),
    );
  }

  private scheduleRefresh(key: string, ttlSeconds: number, refreshFn: () => Promise<string>) {
    const existing = this.refreshTimers.get(key);
    if (existing) clearTimeout(existing);

    const refreshMs = Math.max((ttlSeconds - 5) * 1000, 5000);

    const timer = setTimeout(async () => {
      this.refreshTimers.delete(key);
      try {
        this.logger.debug(`Proactive refresh for ${key}`);
        await refreshFn();
      } catch (err) {
        this.logger.error(`Proactive refresh failed for ${key}: ${(err as Error).message}`);
      }
    }, refreshMs);

    timer.unref();
    this.refreshTimers.set(key, timer);
  }

  /**
   * Re-arms the proactive refresh timer from a cached token (e.g. after a restart).
   * Only schedules if no timer is already running for this key.
   */
  private ensureRefreshTimer(key: string, jwt: string, refreshFn: () => Promise<string>): void {
    if (this.refreshTimers.has(key)) return;
    const exp = this.decodeExp(jwt);
    const now = Math.floor(Date.now() / 1000);
    const ttlRemaining = exp - now - this.conf.vehicleJwtRefreshMarginSeconds;
    if (ttlRemaining > 10) {
      this.logger.debug(`Re-arming refresh timer for ${key} (fires in ${ttlRemaining}s)`);
      this.scheduleRefresh(key, ttlRemaining, refreshFn);
    } else {
      // Token about to expire — refresh immediately in the background
      this.logger.debug(`Token for ${key} nearly expired (${ttlRemaining}s), triggering immediate refresh`);
      refreshFn().catch((err) =>
        this.logger.error(`Immediate refresh failed for ${key}: ${(err as Error).message}`),
      );
    }
  }

  /**
   * Populates in-memory stats from a cached token so the health snapshot
   * shows VALID instead of NEVER_ACQUIRED after a process restart.
   * Only updates if the stats have not yet been set by a live fetch.
   */
  private syncStatsFromCachedToken(type: 'developer', jwt: string): void {
    if (this.developerStats.expiresAt !== null) return; // already set by a live fetch
    const exp = this.decodeExp(jwt);
    this.developerStats.expiresAt = exp;
    // lastAcquiredAt is unknown (persisted in Redis), use now as a lower-bound
    if (this.developerStats.lastAcquiredAt === null) {
      this.developerStats.lastAcquiredAt = Math.floor(Date.now() / 1000);
    }
    // Mark as one implicit success so status resolves to VALID
    if (this.developerStats.totalFetches === 0) {
      this.developerStats.totalFetches = 1;
      this.developerStats.totalSuccesses = 1;
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────

  private decodeExp(jwt: string): number {
    try {
      const payload = jwt.split('.')[1];
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (typeof decoded.exp !== 'number') {
        throw new Error('JWT missing exp claim');
      }
      return decoded.exp;
    } catch {
      this.logger.warn('Could not decode JWT exp; falling back to 5 min TTL');
      return Math.floor(Date.now() / 1000) + 300;
    }
  }

  private vehicleCacheKey(tokenId: number, privileges: number[]): string {
    return `${VEHICLE_JWT_PREFIX}${tokenId}:${this.privilegesHash(privileges)}`;
  }

  private privilegesHash(privileges: number[]): string {
    return crypto.createHash('sha256').update(privileges.join(',')).digest('hex').slice(0, 12);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emptyStats(): TokenStats {
    return {
      lastAcquiredAt: null,
      expiresAt: null,
      totalFetches: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      lastErrorAt: null,
      lastError: null,
      lastErrorHttpStatus: null,
      fetchDurations: [],
    };
  }

  private getOrCreateVehicleStats(tokenId: number): TokenStats {
    let s = this.vehicleStats.get(tokenId);
    if (!s) {
      s = this.emptyStats();
      this.vehicleStats.set(tokenId, s);
    }
    return s;
  }

  private pushEvent(partial: Omit<TokenEvent, 'timestamp'>) {
    const event: TokenEvent = { timestamp: new Date().toISOString(), ...partial };
    this.eventLog.push(event);
    if (this.eventLog.length > MAX_EVENT_LOG) this.eventLog.shift();
  }

  private extractErrorMessage(err: any): string {
    if (err.response?.data) {
      const d = err.response.data;
      if (typeof d === 'string') {
        const match = d.match(/<p>(.*?)<\/p>/);
        return match ? match[1] : d.substring(0, 200);
      }
      if (typeof d === 'object' && d.message) return d.message;
    }
    if (err.body?.message) return err.body.message;
    return err.message ?? String(err);
  }
}
