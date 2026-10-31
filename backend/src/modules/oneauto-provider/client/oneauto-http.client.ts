import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertOneAutoAllowlistedPath } from './oneauto-allowlist';
import { normalizeVin } from './oneauto-vin.util';

export type OneAutoHttpResult = {
  httpStatus: number;
  providerStatusHeader: string | null;
  body: unknown;
  redactedRequestPath: string;
};

export type OneAutoHttpClientDeps = {
  fetchImpl?: typeof fetch;
};

@Injectable()
export class OneAutoHttpClient {
  private readonly logger = new Logger(OneAutoHttpClient.name);
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: ConfigService,
    deps: OneAutoHttpClientDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  private cfg() {
    return this.config.get<{
      enabled?: boolean;
      sandbox?: boolean;
      apiKeyPresent?: boolean;
      baseUrl?: string;
      requestTimeoutMs?: number;
      maxRetries?: number;
    }>('oneautoProvider');
  }

  assertOutboundAllowed(): void {
    const cfg = this.cfg();
    if (!cfg?.enabled) {
      throw Object.assign(new Error('One Auto provider disabled'), { code: 'ONEAUTO_DISABLED' });
    }
    if (!cfg.apiKeyPresent) {
      throw Object.assign(new Error('One Auto API key not configured'), { code: 'ONEAUTO_API_KEY_MISSING' });
    }
  }

  async getVinLookup(input: {
    relativePath: string;
    vin: string;
    vinQueryParameter?: 'vin';
  }): Promise<OneAutoHttpResult> {
    this.assertOutboundAllowed();
    const vin = normalizeVin(input.vin);
    if (!vin) {
      throw Object.assign(new Error('Invalid VIN'), { code: 'ONEAUTO_INVALID_VIN' });
    }
    assertOneAutoAllowlistedPath('GET', input.relativePath);

    const cfg = this.cfg();
    const base = (cfg?.baseUrl ?? '').replace(/\/+$/, '');
    const path = input.relativePath.replace(/^\/+/, '');
    const vinParam = input.vinQueryParameter ?? 'vin';
    const url = `${base}/${path}?${encodeURIComponent(vinParam)}=${encodeURIComponent(vin)}`;

    const apiKey = process.env.ONEAUTO_API_KEY?.trim();
    if (!apiKey) {
      throw Object.assign(new Error('One Auto API key not configured'), { code: 'ONEAUTO_API_KEY_MISSING' });
    }

    let lastError: unknown;
    const attempts = Math.max(1, (cfg?.maxRetries ?? 0) + 1);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), cfg?.requestTimeoutMs ?? 30_000);
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: apiKey,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const providerStatusHeader = res.headers.get('status') ?? res.headers.get('Status');
        let body: unknown = null;
        const text = await res.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = { _rawPreview: text.slice(0, 512) };
          }
        }

        this.logger.log(
          `OneAuto GET ${path} http=${res.status} sandbox=${cfg?.sandbox === true} attempt=${attempt}`,
        );

        return {
          httpStatus: res.status,
          providerStatusHeader,
          body,
          redactedRequestPath: path,
        };
      } catch (err) {
        lastError = err;
        if (attempt >= attempts) break;
      }
    }

    throw Object.assign(new Error('One Auto provider request failed'), {
      code: 'ONEAUTO_PROVIDER_TIMEOUT',
      cause: lastError,
    });
  }
}
