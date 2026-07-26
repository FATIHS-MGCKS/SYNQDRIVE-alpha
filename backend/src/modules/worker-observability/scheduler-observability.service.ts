import { Injectable } from '@nestjs/common';
import { WorkerObservabilityMetrics } from './worker-observability.metrics';

@Injectable()
export class SchedulerObservabilityService {
  constructor(private readonly metrics: WorkerObservabilityMetrics) {}

  async run<T>(scheduler: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.metrics.recordSchedulerSuccess(scheduler, (Date.now() - started) / 1000);
      return result;
    } catch (err) {
      this.metrics.recordSchedulerFailure(scheduler, (Date.now() - started) / 1000);
      throw err;
    }
  }
}
