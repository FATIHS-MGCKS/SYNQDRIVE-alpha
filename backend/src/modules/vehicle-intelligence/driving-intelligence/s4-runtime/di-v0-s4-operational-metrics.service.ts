import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderElectionService } from '@shared/scheduler-leader/scheduler-leader-election.service';
import { DiV0S4fReconciliationService } from '../s4f-observability/di-v0-s4f-reconciliation.service';
import { countDiV0S4AllowlistViolationWorkItems } from './di-v0-s4-allowlist-violation-count';
import {
  classifyDiV0S4RuntimeAttestationState,
  evaluateDiV0S4RuntimeConfigAttestationFromProcess,
} from './di-v0-s4-runtime-config-attestation';
import {
  publishDiV0S4OperationalPrometheusMetrics,
  registerDiV0S4OperationalPrometheusMetrics,
  type DiV0S4OperationalPrometheusHandles,
} from './di-v0-s4-operational-prometheus.metrics';

const REFRESH_INTERVAL_MS = 60_000;

/** Leader-only DB aggregates for unattended S4 alerting (low-cardinality gauges). */
@Injectable()
export class DiV0S4OperationalMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4OperationalMetricsService.name);
  private handles!: DiV0S4OperationalPrometheusHandles;
  private timer: NodeJS.Timeout | null = null;
  private readonly reconciliation = new DiV0S4fReconciliationService(this.prisma);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripMetrics: TripMetricsService,
    private readonly leaderElection: SchedulerLeaderElectionService,
  ) {}

  onModuleInit(): void {
    this.handles = registerDiV0S4OperationalPrometheusMetrics(this.tripMetrics.registry);
    this.timer = setInterval(() => {
      void this.refreshIfLeader();
    }, REFRESH_INTERVAL_MS);
    void this.refreshIfLeader();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async refreshIfLeader(): Promise<void> {
    if (!this.leaderElection.isLeader()) return;
    try {
      const [snapshot, allowlistViolations] = await Promise.all([
        this.reconciliation.buildObservabilitySnapshot({
          workBatchLimit: 5,
          beyondHorizonBatchLimit: 5,
        }),
        countDiV0S4AllowlistViolationWorkItems(this.prisma),
      ]);
      const attestation = evaluateDiV0S4RuntimeConfigAttestationFromProcess();
      const staged = classifyDiV0S4RuntimeAttestationState(process.env) === 'STAGED';
      publishDiV0S4OperationalPrometheusMetrics(
        this.handles,
        snapshot,
        allowlistViolations,
        staged || attestation.state === 'STAGED',
      );
    } catch (error) {
      this.logger.warn(`S4 operational metrics refresh failed: ${String(error)}`);
    }
  }
}
