import { Injectable, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class AdaptivePollingShadowMetricsService {
  constructor(@Optional() private readonly tripMetrics?: TripMetricsService) {}

  setEnabled(enabled: boolean): void {
    this.tripMetrics?.apdShadowEnabled?.set(enabled ? 1 : 0);
  }

  setCohortMemberCount(count: number): void {
    this.tripMetrics?.apdShadowCohortMemberCount?.set(count);
  }

  setCohortConfigFingerprint(_sha256: string): void {
    // Fingerprint is exposed via AdaptivePollingShadowService.getCohortVerificationSummary()
    // for replica parity checks — not emitted as a Prometheus label.
  }

  recordCohortExcluded(reason: string): void {
    this.tripMetrics?.apdShadowCohortExcludedTotal?.inc({ reason });
  }

  recordDecision(policy: string, decision: string, reason: string): void {
    this.tripMetrics?.apdShadowDecisionsTotal?.inc({ policy, decision, reason });
    if (decision === 'WOULD_POLL') {
      this.tripMetrics?.apdShadowWouldPollTotal?.inc({ policy });
    }
    if (decision === 'WOULD_SKIP') {
      this.tripMetrics?.apdShadowWouldSkipTotal?.inc({ policy });
    }
    if (decision.startsWith('FORCED_') || decision === 'IMMEDIATE_SNAPSHOT_REQUIRED') {
      this.tripMetrics?.apdShadowForcedFallbackTotal?.inc({ policy, reason });
    }
  }

  recordFailure(stage: string): void {
    this.tripMetrics?.apdShadowFailureTotal?.inc({ stage });
  }

  recordProfileInvalidated(reason: string): void {
    this.tripMetrics?.apdShadowProfileInvalidatedTotal?.inc({ reason });
  }

  recordProfileRecovered(): void {
    this.tripMetrics?.apdShadowProfileRecoveredTotal?.inc();
  }

  recordInformativeRealPoll(source: string): void {
    this.tripMetrics?.apdShadowInformativeRealPollTotal?.inc({ source });
  }

  recordSkippedInformative(policy: string, source: string): void {
    this.tripMetrics?.apdShadowSkippedInformativePollTotal?.inc({ policy, source });
  }
}
