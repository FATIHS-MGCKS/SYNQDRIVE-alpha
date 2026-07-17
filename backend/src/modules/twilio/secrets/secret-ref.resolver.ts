import { Injectable } from '@nestjs/common';
import { TwilioInvalidConfigurationError } from '../errors/twilio-provider.errors';
import { assertValidTwilioCredentialShape } from '../errors/twilio-provider-error.mapper';
import type { TwilioSubaccountCredentials } from './twilio-credential.types';

const ENV_JSON_PREFIX = 'env-json://';

const memoryJsonStore = new Map<string, string>();

export function resetSecretMemoryStoreForTests(): void {
  memoryJsonStore.clear();
}

@Injectable()
export class SecretRefResolver {
  /**
   * Registers JSON credentials in the process-local memory store and returns an env-json ref.
   * Production vault integration can replace this path without changing callers.
   */
  registerMemoryJson(envKey: string, value: Record<string, unknown>): string {
    const normalizedKey = envKey.trim();
    if (!normalizedKey) {
      throw new TwilioInvalidConfigurationError('Secret env key is missing.');
    }
    memoryJsonStore.set(normalizedKey, JSON.stringify(value));
    return `${ENV_JSON_PREFIX}${normalizedKey}`;
  }

  /**
   * Resolves opaque secret references server-side. Supported schemes:
   * - `env-json://ENV_VAR_NAME` — JSON object in process.env (VPS / runtime secret injection)
   *   or the in-memory store populated by `registerMemoryJson`.
   *
   * Never logs or persists resolved secret values.
   */
  async resolveJson<T extends Record<string, unknown>>(secretRef: string): Promise<T> {
    const trimmed = secretRef.trim();
    if (!trimmed) {
      throw new TwilioInvalidConfigurationError('Secret reference is empty.');
    }

    if (trimmed.startsWith(ENV_JSON_PREFIX)) {
      const envKey = trimmed.slice(ENV_JSON_PREFIX.length).trim();
      if (!envKey) {
        throw new TwilioInvalidConfigurationError('Secret reference env key is missing.');
      }
      const memoryRaw = memoryJsonStore.get(envKey);
      const raw = memoryRaw ?? process.env[envKey];
      if (!raw?.trim()) {
        throw new TwilioInvalidConfigurationError(`Secret env var is not configured: ${envKey}`);
      }
      try {
        const parsed = JSON.parse(raw) as T;
        if (!parsed || typeof parsed !== 'object') {
          throw new TwilioInvalidConfigurationError(`Secret env var is not a JSON object: ${envKey}`);
        }
        return parsed;
      } catch (err) {
        if (err instanceof TwilioInvalidConfigurationError) {
          throw err;
        }
        throw new TwilioInvalidConfigurationError(`Secret env var is not valid JSON: ${envKey}`);
      }
    }

    const scheme = trimmed.includes('://') ? trimmed.split('://', 1)[0] : 'unknown';
    throw new TwilioInvalidConfigurationError(`Unsupported secret reference scheme: ${scheme}`);
  }

  async resolveTwilioSubaccountCredentials(secretRef: string): Promise<TwilioSubaccountCredentials> {
    const resolved = await this.resolveJson<Record<string, unknown>>(secretRef);
    assertValidTwilioCredentialShape(resolved);
    return {
      accountSid: resolved.accountSid.trim(),
      apiKeySid: resolved.apiKeySid.trim(),
      apiKeySecret: resolved.apiKeySecret.trim(),
    };
  }
}
