import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';
import euromasterConfig from '@config/euromaster.config';
import { EuromasterAuthToken } from './euromaster.types';
import { EuromasterAuthError, EuromasterConfigError } from './euromaster.errors';

/**
 * Manages Euromaster API authentication.
 *
 * AUTH STRATEGY NOTES:
 * The exact Euromaster fleet API auth mechanism is not yet confirmed.
 * This service supports two patterns:
 *   1. Static API key (sent as header) — simplest, no token exchange
 *   2. OAuth2 client_credentials flow — if Euromaster uses OAuth
 *
 * When production credentials and docs are provided, finalize the
 * getAuthHeaders() method to match the real auth contract.
 */
@Injectable()
export class EuromasterAuthService {
  private readonly logger = new Logger(EuromasterAuthService.name);
  private cachedToken: EuromasterAuthToken | null = null;

  constructor(
    @Inject(euromasterConfig.KEY) private readonly conf: ConfigType<typeof euromasterConfig>,
  ) {
    if (!conf.apiKey && !conf.clientId) {
      this.logger.warn('No Euromaster credentials configured — live API calls will fail');
    }
  }

  isConfigured(): boolean {
    return !!(this.conf.apiKey || (this.conf.clientId && this.conf.clientSecret));
  }

  /**
   * Returns authorization headers for Euromaster API requests.
   * Chooses between static API key and OAuth token based on config.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.conf.apiKey) {
      return { 'X-Api-Key': this.conf.apiKey };
    }

    if (this.conf.clientId && this.conf.clientSecret) {
      const token = await this.getOrRefreshToken();
      return { Authorization: `Bearer ${token.accessToken}` };
    }

    throw new EuromasterConfigError('No API key or client credentials configured');
  }

  /**
   * OAuth2 client_credentials token exchange.
   * NOTE: The token endpoint URL is a placeholder — must be updated when
   * the real Euromaster OAuth endpoint is confirmed.
   */
  private async getOrRefreshToken(): Promise<EuromasterAuthToken> {
    if (this.cachedToken && this.cachedToken.expiresAt.getTime() > Date.now() + 60_000) {
      return this.cachedToken;
    }

    const tokenUrl = `${this.conf.baseUrl}/oauth/token`;
    const start = Date.now();

    try {
      this.logger.debug(`Requesting Euromaster OAuth token from ${tokenUrl}`);

      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.conf.clientId,
          client_secret: this.conf.clientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: this.conf.requestTimeoutMs,
        },
      );

      const { access_token, expires_in, token_type } = response.data;
      if (!access_token) {
        throw new EuromasterAuthError('Token response missing access_token');
      }

      this.cachedToken = {
        accessToken: access_token,
        expiresAt: new Date(Date.now() + (expires_in ?? 3600) * 1000),
        tokenType: token_type ?? 'Bearer',
      };

      this.logger.log(`Euromaster OAuth token acquired in ${Date.now() - start}ms`);
      return this.cachedToken;
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error_description ?? err.message;
      this.logger.error(`Euromaster OAuth failed (${status}): ${msg}`);
      this.cachedToken = null;
      throw new EuromasterAuthError(msg, status);
    }
  }

  clearCachedToken(): void {
    this.cachedToken = null;
  }
}
