import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OneAutoProviderHttpContract } from '../catalog/oneauto-contract-types';
import { assertOneAutoAllowlistedPath } from './oneauto-allowlist';
import { ONEAUTO_HTTP_FETCH, type OneAutoHttpFetchImpl } from './oneauto-http-fetch.token';
import { normalizeVin } from './oneauto-vin.util';

export type OneAutoHttpResult = {
  httpStatus: number;
  providerStatusHeader: string | null;
  body: unknown;
  redactedRequestPath: string;
};

const ALLOWED_BASE_HOSTS = new Set(['sandbox.oneautoapi.com', 'api.oneautoapi.com']);

function assertAllowedBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error('One Auto base URL invalid'), { code: 'ONEAUTO_BASE_URL_INVALID' });
  }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('One Auto base URL must be https'), { code: 'ONEAUTO_BASE_URL_INVALID' });
  }
  if (!ALLOWED_BASE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw Object.assign(new Error('One Auto base URL host not allowlisted'), {
      code: 'ONEAUTO_BASE_URL_NOT_ALLOWLISTED',
    });
  }
}

@Injectable()
export class OneAutoHttpClient {
  private readonly logger = new Logger(OneAutoHttpClient.name);
  private readonly fetchImpl: OneAutoHttpFetchImpl;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(ONEAUTO_HTTP_FETCH) fetchImpl?: OneAutoHttpFetchImpl,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
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

  /**
   * Contract-driven GET — requires execution-verified contract (allowlisted path, official auth/VIN param).
   */
  async executeProviderGet(input: {
    contract: OneAutoProviderHttpContract;
    vin: string;
  }): Promise<OneAutoHttpResult> {
    this.assertOutboundAllowed();
    const contract = input.contract;
    if (contract.evidenceState !== 'EXECUTION_VERIFIED') {
      throw Object.assign(new Error('One Auto contract not execution-verified'), {
        code: 'CONTRACT_UNVERIFIED',
      });
    }
    if (contract.httpMethod !== 'GET') {
      throw Object.assign(new Error('One Auto unsupported HTTP method'), {
        code: 'ONEAUTO_METHOD_NOT_ALLOWLISTED',
      });
    }

    const vin = normalizeVin(input.vin);
    if (!vin) {
      throw Object.assign(new Error('Invalid VIN'), { code: 'ONEAUTO_INVALID_VIN' });
    }

    assertOneAutoAllowlistedPath(contract.httpMethod, contract.providerPathTemplate);

    const cfg = this.cfg();
    const base = (cfg?.baseUrl ?? '').replace(/\/+$/, '');
    assertAllowedBaseUrl(base.startsWith('http') ? base : `https://${base}`);

    const path = contract.providerPathTemplate.replace(/^\/+/, '');
    const vinParam = contract.vinQueryParameter;
    const url = `${base}/${path}?${encodeURIComponent(vinParam)}=${encodeURIComponent(vin)}`;

    const apiKey = process.env.ONEAUTO_API_KEY?.trim();
    if (!apiKey) {
      throw Object.assign(new Error('One Auto API key not configured'), { code: 'ONEAUTO_API_KEY_MISSING' });
    }

    const headerName = contract.authHeaderName;
    const attempts = 1;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg?.requestTimeoutMs ?? 30_000);
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          [headerName]: apiKey,
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
        `OneAuto GET ${path} http=${res.status} sandbox=${cfg?.sandbox === true} attempts=${attempts}`,
      );

      return {
        httpStatus: res.status,
        providerStatusHeader,
        body,
        redactedRequestPath: path,
      };
    } catch (err) {
      throw Object.assign(new Error('One Auto provider request failed'), {
        code: 'ONEAUTO_PROVIDER_TIMEOUT',
        cause: err,
      });
    }
  }

  /** @deprecated Use executeProviderGet with execution-verified contract */
  async getVinLookup(_input: {
    relativePath: string;
    vin: string;
    vinQueryParameter?: never;
  }): Promise<OneAutoHttpResult> {
    throw Object.assign(new Error('One Auto HTTP client requires execution-verified contract'), {
      code: 'CONTRACT_UNVERIFIED',
    });
  }
}
