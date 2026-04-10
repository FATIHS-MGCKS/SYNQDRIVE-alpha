import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface HmTokenCache {
  accessToken: string;
  expiresAt: number; // Unix ms
}

/**
 * Handles OAuth2 client-credentials token lifecycle for High Mobility.
 * Token endpoint: HM_TOKEN_URL or ${apiBaseUrl}/access_tokens
 * Token lifespan: 300 seconds (5 min) — auto-refreshed with 30s safety margin.
 * Never exposes client_secret to frontend — all calls are server-side only.
 */
@Injectable()
export class HighMobilityAuthService {
  private readonly logger = new Logger(HighMobilityAuthService.name);
  private tokenCache: HmTokenCache | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get cfg() {
    return this.configService.get('highMobility') as {
      apiBaseUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      env: string;
      requestTimeoutMs: number;
    };
  }

  async getAccessToken(): Promise<string | null> {
    const { clientId, clientSecret, tokenUrl, requestTimeoutMs } = this.cfg;

    if (!clientId || !clientSecret) {
      this.logger.warn('HM credentials not configured — skipping token fetch');
      return null;
    }

    const now = Date.now();
    // Refresh 30s before expiry (important: HM tokens expire in 300s)
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.accessToken;
    }

    try {
      const res = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: requestTimeoutMs,
        },
      );

      const { access_token, expires_in } = res.data as { access_token: string; expires_in: number };
      this.tokenCache = {
        accessToken: access_token,
        expiresAt: now + (expires_in ?? 300) * 1000,
      };
      this.logger.log(`HM OAuth token refreshed (expires in ${expires_in ?? 300}s) via ${tokenUrl}`);
      return access_token;
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
      this.logger.error(`HM token fetch failed [${status ?? 'network'}]: ${detail}`);
      return null;
    }
  }

  /** Build Axios headers with Bearer token; returns null if unconfigured */
  async authHeaders(): Promise<Record<string, string> | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  isConfigured(): boolean {
    const { clientId, clientSecret } = this.cfg;
    return Boolean(clientId && clientSecret);
  }

  /** Flush token cache — forces a fresh fetch on next call */
  flushTokenCache(): void {
    this.tokenCache = null;
    this.logger.debug('HM token cache flushed');
  }
}
