import { Logger } from '@nestjs/common';
import type { AxiosError } from 'axios';
import type { DimoTelemetryService } from '../dimo-telemetry.service';
import type {
  DimoRechargeSegmentFetchError,
  DimoRechargeSegmentGraphQLPage,
} from './dimo-recharge-segments.types';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAxiosStatus(error: unknown): number | undefined {
  const axiosError = error as AxiosError | undefined;
  return axiosError?.response?.status;
}

function readGraphqlErrors(error: unknown): Array<{ message?: string }> | undefined {
  const axiosError = error as AxiosError<{ errors?: Array<{ message?: string }> }> | undefined;
  const errors = axiosError?.response?.data?.errors;
  return Array.isArray(errors) ? errors : undefined;
}

export function isRetryableDimoAxiosError(error: unknown): boolean {
  const status = readAxiosStatus(error);
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  const axiosError = error as AxiosError | undefined;
  const code = axiosError?.code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

export function buildDimoRechargeFetchError(
  error: unknown,
): DimoRechargeSegmentFetchError {
  const message = error instanceof Error ? error.message : String(error);
  const httpStatus = readAxiosStatus(error);
  const graphqlErrors = readGraphqlErrors(error);
  return {
    message,
    httpStatus,
    retryable: isRetryableDimoAxiosError(error),
    graphqlErrors,
  };
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
      const fetchError = buildDimoRechargeFetchError(error);
      const graphqlDetail = fetchError.graphqlErrors
        ?.map((entry) => entry.message)
        .filter(Boolean)
        .join('; ');

      if (includeSourceFilter && isSourceFilterGraphQLError(fetchError.message)) {
        logger.debug(
          `DIMO recharge segments source filter unsupported tokenId=${tokenId} mechanism=recharge httpStatus=${fetchError.httpStatus ?? 'n/a'}; retrying without filter`,
        );
        includeSourceFilter = false;
        continue;
      }

      if (attempt < maxRetries && fetchError.retryable) {
        retries += 1;
        const delayMs = baseDelayMs * 2 ** attempt;
        logger.warn(
          `DIMO recharge segments retry tokenId=${tokenId} mechanism=recharge httpStatus=${fetchError.httpStatus ?? 'n/a'} retryable=true attempt=${attempt + 1}/${maxRetries} delayMs=${delayMs}${graphqlDetail ? ` graphqlErrors="${graphqlDetail}"` : ''}`,
        );
        await sleep(delayMs);
        continue;
      }

      logger.warn(
        `DIMO recharge segments fetch failed tokenId=${tokenId} mechanism=recharge httpStatus=${fetchError.httpStatus ?? 'n/a'} retryable=${fetchError.retryable}${graphqlDetail ? ` graphqlErrors="${graphqlDetail}"` : ''} message="${fetchError.message}"`,
      );
      throw error;
    }
  }

  throw new Error(`DIMO recharge segments query exhausted retries tokenId=${tokenId}`);
}
