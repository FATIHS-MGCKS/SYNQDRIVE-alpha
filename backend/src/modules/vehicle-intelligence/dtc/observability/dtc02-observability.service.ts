import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { PrismaService } from '@shared/database/prisma.service';
import { collectDtc02SourceTrustSnapshot, type Dtc02SourceTrustSnapshot } from './dtc02-source-trust.snapshot';
import { classifyProviderFailure } from './dtc02-prometheus.metrics';
import {
  normalizeFanOutSkipReason,
  normalizePollOutcome,
  normalizePollPath,
  normalizeWebhookSkipReason,
  registerDtc02Metrics,
  safeMetricCall,
  type Dtc02MetricsHandles,
} from './dtc02-prometheus.metrics';

@Injectable()
export class Dtc02ObservabilityService implements OnModuleInit {
  private handles: Dtc02MetricsHandles | null = null;

  constructor(@Optional() private readonly tripMetrics?: TripMetricsService) {}

  onModuleInit(): void {
    if (!this.tripMetrics?.registry) return;
    this.handles = registerDtc02Metrics(this.tripMetrics.registry);
  }

  recordSchedulerTick(result: 'success' | 'skipped_backpressure'): void {
    safeMetricCall(() => {
      this.handles?.schedulerTickTotal.inc({ result });
    });
  }

  recordFanOutEligible(totalDimoLinked: number, enqueued: number): void {
    safeMetricCall(() => {
      this.handles?.fanOutVehiclesTotal.inc({ disposition: 'eligible' }, totalDimoLinked);
      this.handles?.fanOutVehiclesTotal.inc({ disposition: 'enqueued' }, enqueued);
      const skipped = Math.max(0, totalDimoLinked - enqueued);
      if (skipped > 0) {
        this.handles?.fanOutVehiclesTotal.inc({ disposition: 'skipped' }, skipped);
      }
    });
  }

  recordFanOutSkip(reason: string): void {
    safeMetricCall(() => {
      this.handles?.fanOutSkipTotal.inc({ reason: normalizeFanOutSkipReason(reason) });
    });
  }

  recordPollAttempt(path: 'legacy' | 'safety01a' | 'unknown'): void {
    safeMetricCall(() => {
      this.handles?.pollTotal.inc({ path: normalizePollPath(path), phase: 'attempt' });
    });
  }

  recordPollOutcome(path: 'legacy' | 'safety01a' | 'unknown', outcome: string): void {
    safeMetricCall(() => {
      const normalized = normalizePollOutcome(outcome);
      this.handles?.pollOutcomeTotal.inc({
        path: normalizePollPath(path),
        outcome: normalized,
      });
      const result = normalized.includes('failure') || normalized.includes('rejected')
        ? 'failure'
        : 'success';
      this.handles?.pollTotal.inc({ path: normalizePollPath(path), phase: result });
    });
  }

  recordProviderPollRequest(result: 'attempt' | 'success' | 'failure'): void {
    safeMetricCall(() => {
      this.handles?.providerRequestTotal.inc({ ingress: 'poll', result });
    });
  }

  observePollDuration(
    path: 'legacy' | 'safety01a' | 'unknown',
    result: 'success' | 'failure',
    seconds: number,
  ): void {
    safeMetricCall(() => {
      this.handles?.pollDurationSeconds.observe(
        { path: normalizePollPath(path), result },
        seconds,
      );
    });
  }

  recordWebhookPhase(
    phase: 'received' | 'admitted' | 'rejected' | 'processed' | 'error',
  ): void {
    safeMetricCall(() => {
      this.handles?.webhookTotal.inc({ phase });
    });
  }

  recordWebhookSkip(reason: string): void {
    safeMetricCall(() => {
      this.handles?.webhookSkipTotal.inc({ reason: normalizeWebhookSkipReason(reason) });
    });
  }

  recordWebhookEvidence(evidence: 'legacy' | 'partial' | 'complete' | 'unknown'): void {
    safeMetricCall(() => {
      this.handles?.webhookEvidenceTotal.inc({ evidence });
    });
  }

  recordProviderFailureAsOutcome(
    path: 'legacy' | 'safety01a' | 'unknown',
    errorMessage: string,
  ): void {
    const bucket = classifyProviderFailure(errorMessage);
    this.recordPollOutcome(path, bucket);
    this.recordProviderPollRequest('failure');
  }

  async refreshSourceTrustFromDb(prisma: PrismaService): Promise<Dtc02SourceTrustSnapshot | null> {
    try {
      const snapshot = await collectDtc02SourceTrustSnapshot(prisma);
      safeMetricCall(() => {
        if (!this.handles) return;
        this.handles.outboxPending.set(snapshot.outboxPending);
        this.handles.outboxUnprocessedErrors.set(snapshot.outboxUnprocessedErrors);
        this.handles.headVlsDivergenceVehicles.set(snapshot.headVlsDivergenceVehicles);
        for (const row of snapshot.fleetFreshness) {
          this.handles.fleetFreshnessVehicles.set(
            { lifecycle: row.lifecycle, freshness: row.freshness },
            row.count,
          );
        }
      });
      return snapshot;
    } catch {
      return null;
    }
  }
}
