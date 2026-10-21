import { Injectable, Logger } from '@nestjs/common';
import { DimoProviderBudgetService } from './dimo-provider-budget.service';
import {
  computeExponentialBackoffMs,
  DimoProviderBudgetError,
  DimoRateLimitedError,
  isNonRetryableDimoHttpError,
  isRetryableDimoHttpError,
  readRetryAfterMsFromError,
  sleep,
} from './dimo-http-error.util';
import type {
  DimoProviderCategory,
  DimoRequestContext,
} from './dimo-provider-category.types';
import {
  getDimoRequestContext,
  isInsideDimoBudgetedCall,
  setActiveDimoPermit,
} from './dimo-request-context';

export interface DimoExecuteOptions<T> {
  category?: DimoProviderCategory;
  priority?: DimoRequestContext['priority'];
  bypassBudget?: boolean;
  acquireTimeoutMs?: number;
  maxRetries?: number;
  execute: () => Promise<T>;
}

/**
 * Canonical DIMO provider request wrapper — single ownership of global permits.
 */
@Injectable()
export class DimoRequestExecutor {
  private readonly logger = new Logger(DimoRequestExecutor.name);

  constructor(private readonly budget: DimoProviderBudgetService) {}

  async execute<T>(options: DimoExecuteOptions<T>): Promise<T> {
    const context = getDimoRequestContext();
    const category = options.category ?? context.category;
    const priority = options.priority ?? context.priority;
    const bypassBudget = options.bypassBudget ?? context.bypassBudget ?? false;

    if (bypassBudget) {
      this.logger.warn(`DIMO budget bypass for category=${category}`);
      return this.executeWithRetry(options.execute, category, options.maxRetries);
    }

    if (isInsideDimoBudgetedCall()) {
      return this.executeWithRetry(options.execute, category, options.maxRetries);
    }

    const permit = await this.budget.acquirePermit({
      category,
      priority,
      acquireTimeoutMs: options.acquireTimeoutMs,
    });

    setActiveDimoPermit({ token: permit.token, category });
    try {
      return await this.executeWithRetry(options.execute, category, options.maxRetries);
    } finally {
      setActiveDimoPermit(undefined);
      await this.budget.releasePermit(permit);
    }
  }

  private async executeWithRetry<T>(
    execute: () => Promise<T>,
    category: DimoProviderCategory,
    maxRetriesOverride?: number,
  ): Promise<T> {
    const config = this.budget.getConfig();
    const maxRetries = maxRetriesOverride ?? config.globalMaxRetries;
    const metrics = this.budget.getMetrics();
    let attempt = 0;

    while (true) {
      const started = Date.now();
      try {
        const result = await execute();
        metrics.requestsTotal.inc({ category, result: 'success' });
        metrics.requestDurationSeconds.observe(
          { category },
          (Date.now() - started) / 1000,
        );
        return result;
      } catch (error) {
        metrics.requestDurationSeconds.observe(
          { category },
          (Date.now() - started) / 1000,
        );

        if (isNonRetryableDimoHttpError(error)) {
          metrics.requestsTotal.inc({ category, result: 'client_error' });
          throw error;
        }

        const retryAfterMs = readRetryAfterMsFromError(
          error,
          config.globalRetryAfterMaxMs,
        );
        const status = (error as { response?: { status?: number } })?.response?.status;

        if (status === 429) {
          metrics.requestsTotal.inc({ category, result: 'rate_limited' });
          const delayMs = retryAfterMs ?? computeExponentialBackoffMs(attempt, 1_000);
          await this.budget.record429(category, delayMs);
          if (attempt >= maxRetries) {
            throw new DimoRateLimitedError(
              `DIMO rate limited (${category}) after ${attempt + 1} attempts`,
              delayMs,
              category,
            );
          }
          attempt += 1;
          await sleep(delayMs);
          continue;
        }

        if (!isRetryableDimoHttpError(error) || attempt >= maxRetries) {
          metrics.requestsTotal.inc({
            category,
            result: isRetryableDimoHttpError(error) ? 'retry_exhausted' : 'error',
          });
          throw error;
        }

        metrics.requestsTotal.inc({ category, result: 'retry' });
        const delayMs = computeExponentialBackoffMs(attempt);
        attempt += 1;
        await sleep(delayMs);
      }
    }
  }

  /**
   * Maps budget failures to retryable errors for BullMQ workers.
   */
  mapBudgetFailure(error: unknown): never {
    if (error instanceof DimoProviderBudgetError) {
      if (error.code === 'REDIS_UNAVAILABLE' || error.code === 'ACQUIRE_TIMEOUT') {
        throw new DimoRetryableBudgetError(error.message, error.code, error.category);
      }
    }
    throw error;
  }
}

export class DimoRetryableBudgetError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly category?: string,
  ) {
    super(message);
    this.name = 'DimoRetryableBudgetError';
  }
}
