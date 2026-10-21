import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';

export function recordShutdownEvidenceObservationCreated(
  metrics: TripMetricsService | undefined,
  input: {
    evidenceClass: BatteryShutdownEvidenceClass;
    confidenceClass: BatteryShutdownEvidenceConfidenceClass;
    stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  },
): void {
  metrics?.batteryShutdownEvidenceObservationCreatedTotal.inc({
    evidence_class: input.evidenceClass,
    confidence_class: input.confidenceClass,
    state_alignment_class: input.stateAlignmentClass,
  });
}

export function recordShutdownEvidenceDuplicateSuppressed(
  metrics: TripMetricsService | undefined,
): void {
  metrics?.batteryShutdownEvidenceDuplicateSuppressedTotal.inc();
}

export function recordShutdownContextCreated(
  metrics: TripMetricsService | undefined,
  input: {
    stateAlignmentClass: BatteryShutdownStateAlignmentClass;
    stateCompleteness: string;
  },
): void {
  metrics?.batteryShutdownContextCreatedTotal.inc({
    state_alignment_class: input.stateAlignmentClass,
    state_completeness: input.stateCompleteness,
  });
}

export function recordShutdownContextMissingState(
  metrics: TripMetricsService | undefined,
): void {
  metrics?.batteryShutdownContextMissingStateTotal.inc();
}

export function recordShutdownPostEngineOffCandidate(
  metrics: TripMetricsService | undefined,
  confirmed: boolean,
): void {
  if (confirmed) {
    metrics?.batteryShutdownPostEngineOffConfirmedTotal.inc();
  } else {
    metrics?.batteryShutdownPostEngineOffCandidateTotal.inc();
  }
}
