import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { ClickHouseCircuitBreaker } from '@modules/clickhouse/clickhouse-circuit-breaker';
import { AiAgentLimitException } from './ai-agent-limit.errors';

@Injectable()
export class AiLlmCircuitBreakerService {
  private readonly breaker: ClickHouseCircuitBreaker;

  constructor(@Inject(aiConfig.KEY) private readonly aiConfiguration: ConfigType<typeof aiConfig>) {
    this.breaker = new ClickHouseCircuitBreaker({
      failureThreshold: this.aiConfiguration.agentCircuitBreakerFailureThreshold,
      cooldownMs: this.aiConfiguration.agentCircuitBreakerCooldownMs,
    });
  }

  assertCanInvokeLlm(): void {
    if (!this.aiConfiguration.agentLimitsEnabled) {
      return;
    }
    if (!this.breaker.canExecute()) {
      throw AiAgentLimitException.fromKind('circuit_breaker_open', 60);
    }
  }

  recordSuccess(): void {
    this.breaker.recordSuccess();
  }

  recordFailure(): void {
    this.breaker.recordFailure();
  }

  getSnapshot() {
    return this.breaker.getSnapshot();
  }
}
