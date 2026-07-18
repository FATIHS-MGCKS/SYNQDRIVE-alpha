import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ELEVENLABS_API_KEY_ENV,
  ELEVENLABS_PROVIDER_DEFAULTS,
} from './elevenlabs-provider.config';
import { mapElevenLabsSdkError } from './elevenlabs-provider-error.mapper';
import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsProviderError,
  ElevenLabsProviderUnavailableError,
  ElevenLabsRateLimitedError,
} from './elevenlabs-provider.errors';
import { sanitizeElevenLabsLogMessage } from './elevenlabs-provider.redaction';

export type ElevenLabsFetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ElevenLabsHttpRequestOptions = {
  timeoutMs?: number;
  retries?: number;
  allowEmptyBody?: boolean;
};

@Injectable()
export class ElevenLabsProviderHttpClient {
  private readonly logger = new Logger(ElevenLabsProviderHttpClient.name);
  private readonly fetchFn: ElevenLabsFetchFn;

  constructor(private readonly config: ConfigService) {
    this.fetchFn = fetch;
  }

  /** Test helper — production code uses global fetch. */
  static createForTest(config: ConfigService, fetchFn: ElevenLabsFetchFn): ElevenLabsProviderHttpClient {
    const client = new ElevenLabsProviderHttpClient(config);
    Object.assign(client, { fetchFn });
    return client;
  }

  getApiKey(): string {
    return this.config.get<string>(ELEVENLABS_API_KEY_ENV, '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  getBaseUrl(): string {
    return (
      this.config.get<string>('ELEVENLABS_BASE_URL', ELEVENLABS_PROVIDER_DEFAULTS.baseUrl).trim() ||
      ELEVENLABS_PROVIDER_DEFAULTS.baseUrl
    );
  }

  getRequiredRegion(): string | null {
    const region = this.config.get<string>('ELEVENLABS_REGION', '').trim();
    return region || null;
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ElevenLabsInvalidConfigurationError(
        'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
      );
    }
  }

  async requestJson<T>(
    path: string,
    init?: RequestInit,
    options?: ElevenLabsHttpRequestOptions,
  ): Promise<T> {
    this.assertConfigured();
    const response = await this.request(path, init, options);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async request(
    path: string,
    init?: RequestInit,
    options?: ElevenLabsHttpRequestOptions,
  ): Promise<Response> {
    this.assertConfigured();
    const timeoutMs = options?.timeoutMs ?? ELEVENLABS_PROVIDER_DEFAULTS.requestTimeoutMs;
    const retries = options?.retries ?? ELEVENLABS_PROVIDER_DEFAULTS.maxRetries;
    const url = `${this.getBaseUrl()}${path}`;

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= retries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchFn(url, {
          ...init,
          headers: {
            'xi-api-key': this.getApiKey(),
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
          signal: controller.signal,
        });

        if (this.shouldRetry(response.status) && attempt < retries) {
          await this.delay(ELEVENLABS_PROVIDER_DEFAULTS.retryDelayMs * (attempt + 1));
          attempt += 1;
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          const message = sanitizeElevenLabsLogMessage(
            `ElevenLabs ${init?.method ?? 'GET'} ${path} failed (${response.status})${
              text ? `: ${text.slice(0, 200)}` : ''
            }`,
          );
          this.logger.warn(message);
          throw mapElevenLabsSdkError({ status: response.status, message });
        }

        return response;
      } catch (err: unknown) {
        lastError = err;
        if (err instanceof ElevenLabsProviderError) {
          if (
            (err instanceof ElevenLabsRateLimitedError ||
              err instanceof ElevenLabsProviderUnavailableError) &&
            attempt < retries
          ) {
            await this.delay(ELEVENLABS_PROVIDER_DEFAULTS.retryDelayMs * (attempt + 1));
            attempt += 1;
            continue;
          }
          throw err;
        }

        const message = sanitizeElevenLabsLogMessage(
          err instanceof Error ? err.message : 'Unknown ElevenLabs transport error',
        );
        if (attempt < retries) {
          await this.delay(ELEVENLABS_PROVIDER_DEFAULTS.retryDelayMs * (attempt + 1));
          attempt += 1;
          continue;
        }
        throw new ElevenLabsProviderUnavailableError(message);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw mapElevenLabsSdkError(lastError);
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
