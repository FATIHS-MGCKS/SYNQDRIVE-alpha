import { Logger } from '@nestjs/common';
import type { AxiosError } from 'axios';
import type { DimoTelemetryService } from '../dimo-telemetry.service';
import type { DimoRechargeSegmentGraphQLPage } from './dimo-recharge-segments.types';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAxiosError(error: unknown): boolean {
  const axiosError = error as AxiosError | undefined;
  const status = axiosError?.response?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  const code = axiosError?.code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

function isSourceFilterGraphQLError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('signalfilter') ||
    normalized.includes('signal filter') ||
    normalized.includes('unknown argument') ||
    normalized.includes('source')
  );
}

export interface ExecuteDimoRechargeGraphQLOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface ExecuteDimoRechargeGraphQLResult {
  data: DimoRechargeSegmentGraphQLPage;
  retries: number;
  sourceFilterDropped: boolean;
}

/**
 * Executes recharge segment GraphQL with retry/backoff and optional source-filter fallback.
 * Never logs JWTs — only tokenId is passed to the logger context.
 */
export async function executeDimoRechargeSegmentsGraphQL(
  telemetry: DimoTelemetryService,
  logger: Logger,
  vehicleJwt: string,
  tokenId: number,
  buildQuery: (includeSourceFilter: boolean) => string,
  options?: ExecuteDimoRechargeGraphQLOptions,
): Promise<ExecuteDimoRechargeGraphQLResult> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let retries = 0;
  let includeSourceFilter = true;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const query = buildQuery(includeSourceFilter);
      const response = await telemetry.queryGraphQL(vehicleJwt, query);
      const segments = Array.isArray(response?.data?.segments)
        ? response.data.segments
        : [];

      return {
        data: {
          segments,
          errors: Array.isArray(response?.errors) ? response.errors : undefined,
        },
        retries,
        sourceFilterDropped: !includeSourceFilter,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (includeSourceFilter && isSourceFilterGraphQLError(message)) {
        logger.debug(
          `DIMO recharge segments source filter unsupported tokenId=${tokenId}; retrying without filter`,
        );
        includeSourceFilter = false;
        continue;
      }

      if (attempt < maxRetries && isRetryableAxiosError(error)) {
        retries += 1;
        const delayMs = baseDelayMs * 2 ** attempt;
        logger.warn(
          `DIMO recharge segments retry tokenId=${tokenId} attempt=${attempt + 1}/${maxRetries} delayMs=${delayMs}`,
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`DIMO recharge segments query exhausted retries tokenId=${tokenId}`);
}
