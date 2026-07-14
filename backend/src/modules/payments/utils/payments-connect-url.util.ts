import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

type ConnectRedirectConfigKey = 'stripe.connectReturnUrl' | 'stripe.connectRefreshUrl';

function parseJsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Validates Connect onboarding redirect URLs against configured defaults and CORS allowlist.
 * Rejects arbitrary client-supplied origins (open-redirect protection).
 */
export function resolveAllowedConnectRedirectUrl(
  configService: ConfigService,
  requested: string | undefined,
  configKey: ConnectRedirectConfigKey,
): string {
  const configured = configService.get<string>(configKey);
  const portalFallback = configService.get<string>('stripe.portalReturnUrl');
  const fallback = configured?.trim() || portalFallback?.trim() || 'http://localhost:5173/rental/settings';

  if (!requested?.trim()) {
    return fallback;
  }

  const url = requested.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Redirect URL must use http or https');
    }

    const allowedOrigins = configService.get<string[]>('app.corsOrigins', []);
    const originAllowed = allowedOrigins.some((allowed) => {
      try {
        return new URL(allowed).origin === parsed.origin;
      } catch {
        return false;
      }
    });

    if (originAllowed) {
      return url;
    }

    const configuredCandidates = [configured, portalFallback].filter(Boolean) as string[];
    for (const candidate of configuredCandidates) {
      try {
        if (new URL(candidate).origin === parsed.origin) {
          return url;
        }
      } catch {
        // ignore invalid configured URL
      }
    }

    throw new BadRequestException('Redirect URL origin is not allowed');
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Invalid redirect URL');
  }
}

export { parseJsonStringArray };
