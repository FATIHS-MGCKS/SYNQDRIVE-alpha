import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';

interface HmTokenCache {
  accessToken: string;
  expiresAt: number;
}

/**
 * HighMobilityTelemetryAppAuthService
 *
 * Manages OAuth2 client-credentials token lifecycle exclusively for the
 * HM Telemetry-APP container. Uses HM_TELEMETRY_APP_CLIENT_ID / CLIENT_SECRET only.
 *
 * NEVER shares tokens with HealthAppAuthService.
 */
@Injectable()
export class HighMobilityTelemetryAppAuthService {
  private readonly logger = new Logger(HighMobilityTelemetryAppAuthService.name);
  private tokenCache: HmTokenCache | null = null;

  constructor(private readonly hmConfig: HighMobilityAppConfigService) {}

  async getAccessToken(): Promise<string | null> {
    const { clientId, clientSecret, tokenUrl, requestTimeoutMs } = this.hmConfig.telemetryApp;

    if (!clientId || !clientSecret) {
      this.logger.warn('[HM Telemetry-APP] OAuth credentials not configured — skipping token fetch');
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
      this.logger.log(`[HM Telemetry-APP] OAuth token refreshed (expires in ${expires_in ?? 300}s)`);
      return access_token;
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
      this.logger.error(`[HM Telemetry-APP] Token fetch failed [${status ?? 'network'}]: ${detail}`);
      return null;
    }
  }

  async authHeaders(): Promise<Record<string, string> | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  isConfigured(): boolean {
    return this.hmConfig.isTelemetryAppOAuthReady();
  }

  flushTokenCache(): void {
    this.tokenCache = null;
  }
}
