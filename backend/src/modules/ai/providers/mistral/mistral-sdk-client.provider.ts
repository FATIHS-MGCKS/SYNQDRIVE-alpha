import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import aiConfig from '@config/ai.config';

const DEFAULT_CLIENT_TIMEOUT_MS = 120_000;

/**
 * Shared, lazily-initialized Mistral SDK client for chat/JSON and OCR adapters.
 * One client instance per process — avoids uncontrolled per-request instantiation.
 */
@Injectable()
export class MistralSdkClientProvider {
  private client: Mistral | null = null;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.mistralApiKey?.trim());
  }

  getClient(): Mistral {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Mistral is not configured. Set MISTRAL_API_KEY on the server.',
      );
    }
    if (!this.client) {
      this.client = new Mistral({
        apiKey: this.config.mistralApiKey,
        ...(this.config.mistralBaseUrl ? { serverURL: this.config.mistralBaseUrl } : {}),
        timeoutMs: DEFAULT_CLIENT_TIMEOUT_MS,
      });
    }
    return this.client;
  }
}
