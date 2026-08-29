import { Injectable } from '@nestjs/common';
import type {
  DimoProviderExecuteParams,
} from './dimo-provider-gateway.types';

/**
 * Canonical outbound DIMO provider gateway (P1.3).
 *
 * S1: semantic pass-through only — no limiter, backpressure, circuit breaker,
 * retries, or error translation. Future slices attach Redis limiter + metrics here.
 */
@Injectable()
export class DimoProviderGateway {
  async execute<T>(params: DimoProviderExecuteParams<T>): Promise<T> {
    // S1 extension point: operation = params.operation, context = params.requestContext
    return params.invoke();
  }
}
