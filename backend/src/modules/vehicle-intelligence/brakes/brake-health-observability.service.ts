import { Injectable, Logger } from '@nestjs/common';
import { BrakeMetricsService } from './brake-metrics.service';

@Injectable()
export class BrakeHealthObservabilityService {
  private readonly logger = new Logger(BrakeHealthObservabilityService.name);

  constructor(private readonly metrics: BrakeMetricsService) {}

  recordRecalculation(args: {
    result: 'success' | 'failed' | 'skipped' | 'deduplicated';
    durationMs?: number;
    skipReason?: string | null;
    errorCode?: string | null;
    trigger?: string;
    vehicleId?: string;
  }): void {
    const line = [
      'brake_recalculation',
      `result=${args.result}`,
      args.trigger ? `trigger=${args.trigger}` : null,
      args.vehicleId ? `vehicle=${args.vehicleId}` : null,
      args.skipReason ? `skip=${args.skipReason}` : null,
      args.errorCode ? `error=${args.errorCode}` : null,
      args.durationMs != null ? `durationMs=${args.durationMs}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (args.result === 'failed') {
      this.logger.warn(line);
    } else if (args.result === 'deduplicated') {
      this.logger.debug(line);
    } else {
      this.logger.log(line);
    }

    this.metrics.recalculationTotal.inc({ result: args.result });
    if (args.result === 'failed') {
      this.metrics.recalculationFailedTotal.inc({
        error_code: args.errorCode ?? 'unknown',
      });
    }
    if (args.result === 'deduplicated') {
      this.metrics.recalculationDeduplicatedTotal.inc({
        reason: args.skipReason ?? 'identical_input_fingerprint',
      });
    }
    if (args.durationMs != null) {
      this.metrics.recalculationDuration.observe(
        { result: args.result },
        args.durationMs / 1000,
      );
    }
  }
}
