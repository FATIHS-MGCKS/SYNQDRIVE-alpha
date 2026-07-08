import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

function parseBool(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

export interface MetricsConfigShape {
  enabled: boolean;
  requireToken: boolean;
  token: string | null;
  allowedIps: string[];
}

export default registerAs('metrics', (): MetricsConfigShape => {
  const logger = new Logger('MetricsConfig');
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const enabled = parseBool(process.env.METRICS_ENABLED, true);
  const requireToken = parseBool(process.env.METRICS_REQUIRE_TOKEN, isProd);
  const token = process.env.METRICS_TOKEN?.trim() || null;
  const allowedIps = (process.env.METRICS_ALLOWED_IPS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (enabled && requireToken && !token) {
    logger.warn(
      'METRICS_REQUIRE_TOKEN=true but METRICS_TOKEN is not set — /metrics will reject all scrapes until a token is configured (fail-closed).',
    );
  }

  if (enabled && isProd && !requireToken) {
    logger.warn(
      'METRICS_REQUIRE_TOKEN=false in production — /api/v1/metrics is reachable without a scrape token. Set METRICS_REQUIRE_TOKEN=true and METRICS_TOKEN, or restrict via reverse proxy / METRICS_ALLOWED_IPS.',
    );
  }

  return {
    enabled,
    requireToken,
    token,
    allowedIps,
  };
});
