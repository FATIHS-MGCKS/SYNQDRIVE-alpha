import { Injectable, OnModuleInit } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { evaluateDiV0S4RuntimeConfigAttestationFromProcess } from './di-v0-s4-runtime-config-attestation';
import {
  publishDiV0S4RuntimeConfigAttestationMetric,
  registerDiV0S4RuntimeConfigAttestationMetrics,
  type DiV0S4RuntimeConfigAttestationMetricHandles,
} from './di-v0-s4-runtime-config-attestation.metrics';

/**
 * Read-only runtime attestation published once at module init (no timers / DB / Redis / provider).
 */
@Injectable()
export class DiV0S4RuntimeConfigAttestationService implements OnModuleInit {
  private handles!: DiV0S4RuntimeConfigAttestationMetricHandles;

  constructor(private readonly tripMetrics: TripMetricsService) {}

  onModuleInit(): void {
    this.handles = registerDiV0S4RuntimeConfigAttestationMetrics(this.tripMetrics.registry);
    publishDiV0S4RuntimeConfigAttestationMetric(
      this.handles,
      evaluateDiV0S4RuntimeConfigAttestationFromProcess(),
    );
  }
}
