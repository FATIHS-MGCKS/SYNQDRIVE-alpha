import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';

interface HmTokenCache {
  accessToken: string;
  expiresAt: number;
}

export type HmHealthAuthFailureReason = 'MISSING_CREDENTIALS' | 'TOKEN_FETCH_FAILED';

/**
 * HighMobilityHealthAppAuthService
 *
 * Manages OAuth2 client-credentials token lifecycle exclusively for the
 * HM Health-APP container. Uses HM_HEALTH_APP_CLIENT_ID / CLIENT_SECRET only.
 *
 * NEVER shares tokens with TelemetryAppAuthService.
 */
@Injectable()
export class HighMobilityHealthAppAuthService {
  private readonly logger = new Logger(HighMobilityHealthAppAuthService.name);
  private tokenCache: HmTokenCache | null = null;
  private lastFailureReason: HmHealthAuthFailureReason | null = null;
  private lastFailureStatus: string | null = null;
  private lastFailureDetail: string | null = null;

  constructor(private readonly hmConfig: HighMobilityAppConfigService) {}

  async getAccessToken(): Promise<string | null> {
    const { clientId, clientSecret, tokenUrl, requestTimeoutMs } = this.hmConfig.healthApp;

    if (!clientId || !clientSecret) {
      this.logger.warn('[HM Health-APP] OAuth credentials not configured — skipping token fetch');
      this.lastFailureReason = 'MISSING_CREDENTIALS';
      this.lastFailureStatus = null;
      this.lastFailureDetail = null;
      return null;
    }

    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.accessToken;
    }

    try {
      const res = await axios.post(
        tokenUrl,
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: requestTimeoutMs },
      );

      const { access_token, expires_in } = res.data as { access_token: string; expires_in: number };
      this.tokenCache = { accessToken: access_token, expiresAt: now + (expires_in ?? 300) * 1000 };
      this.lastFailureReason = null;
      this.lastFailureStatus = null;
      this.lastFailureDetail = null;
      this.logger.log(`[HM Health-APP] OAuth token refreshed (expires in ${expires_in ?? 300}s)`);
      return access_token;
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
      this.lastFailureReason = 'TOKEN_FETCH_FAILED';
      this.lastFailureStatus = status != null ? String(status) : 'network';
      this.lastFailureDetail = err?.message ?? null;
      this.logger.error(`[HM Health-APP] Token fetch failed [${status ?? 'network'}]: ${detail}`);
      return null;
    }
  }

  async authHeaders(): Promise<Record<string, string> | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  isConfigured(): boolean {
    return this.hmConfig.isHealthAppOAuthReady();
  }

  flushTokenCache(): void {
    this.tokenCache = null;
  }

  getLastFailureContext(): {
    reason: HmHealthAuthFailureReason | null;
    status: string | null;
    detail: string | null;
  } {
    return {
      reason: this.lastFailureReason,
      status: this.lastFailureStatus,
      detail: this.lastFailureDetail,
    };
  }
}
