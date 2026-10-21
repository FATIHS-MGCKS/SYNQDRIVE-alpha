import type { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  evaluateBoundaryAdjustmentObservation,
  evaluateCandidateLatencyObservation,
  evaluateDurationObservation,
  evaluateRecognitionLatencyObservation,
  type TripTimingMetricName,
  type TripTimingSampleRejectReason,
} from './trip-fsm-timing.util';

type MetricsSink = Pick<
  TripMetricsService,
  | 'tripStartCandidateLatency'
  | 'tripStartRecognitionLatency'
  | 'tripStartBoundaryAdjustment'
  | 'tripEndCandidateLatency'
  | 'tripEndRecognitionLatency'
  | 'tripEndBoundaryAdjustment'
  | 'tripDuration'
  | 'tripTimingSampleRejected'
>;

function rejectSample(
  metrics: MetricsSink | null | undefined,
  metric: TripTimingMetricName,
  reason: TripTimingSampleRejectReason,
): void {
  metrics?.tripTimingSampleRejected?.inc({ metric, reason });
}

export function observeStartCandidateLatency(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    clockSource: string;
    candidateAt: Date | null | undefined;
    enteredAt: Date | null | undefined;
  },
): void {
  const result = evaluateCandidateLatencyObservation({
    candidateAt: params.candidateAt,
    enteredAt: params.enteredAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'start_candidate_latency', result.rejectReason);
    }
    return;
  }
  metrics?.tripStartCandidateLatency?.observe(
    { profile: params.profile, clock_source: params.clockSource },
    result.latencySec!,
  );
}

export function observeStartRecognitionLatency(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    mode: string;
    outcome: 'create' | 'merge' | 'recovery';
    recognizedAt: Date;
    canonicalStartAt: Date;
  },
): void {
  const result = evaluateRecognitionLatencyObservation({
    recognizedAt: params.recognizedAt,
    canonicalBoundaryAt: params.canonicalStartAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'start_recognition_latency', result.rejectReason);
    }
    return;
  }
  metrics?.tripStartRecognitionLatency?.observe(
    {
      profile: params.profile,
      mode: params.mode,
      outcome: params.outcome,
    },
    result.latencySec!,
  );
}

export function observeStartBoundaryAdjustment(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    source: string;
    outcome: 'create' | 'merge';
    initialCandidateAt: Date | null | undefined;
    effectiveStartAt: Date;
  },
): void {
  const result = evaluateBoundaryAdjustmentObservation({
    initialBoundaryAt: params.initialCandidateAt,
    finalBoundaryAt: params.effectiveStartAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'start_boundary_adjustment', result.rejectReason);
    }
    return;
  }
  metrics?.tripStartBoundaryAdjustment?.observe(
    {
      profile: params.profile,
      source: params.source,
      direction: result.direction,
      outcome: params.outcome,
    },
    result.latencySec!,
  );
}

export function observeEndCandidateLatency(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    evidencePath: string;
    clockSource: string;
    candidateAt: Date | null | undefined;
    enteredAt: Date | null | undefined;
  },
): void {
  const result = evaluateCandidateLatencyObservation({
    candidateAt: params.candidateAt,
    enteredAt: params.enteredAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'end_candidate_latency', result.rejectReason);
    }
    return;
  }
  metrics?.tripEndCandidateLatency?.observe(
    {
      profile: params.profile,
      evidence_path: params.evidencePath,
      clock_source: params.clockSource,
    },
    result.latencySec!,
  );
}

export function observeEndRecognitionLatency(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    commitConfirmation: 'direct' | 'durable';
    recognizedAt: Date;
    canonicalEndAt: Date;
  },
): void {
  const result = evaluateRecognitionLatencyObservation({
    recognizedAt: params.recognizedAt,
    canonicalBoundaryAt: params.canonicalEndAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'end_recognition_latency', result.rejectReason);
    }
    return;
  }
  metrics?.tripEndRecognitionLatency?.observe(
    {
      profile: params.profile,
      commit_confirmation: params.commitConfirmation,
    },
    result.latencySec!,
  );
}

export function observeEndBoundaryAdjustment(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    endSource: string;
    candidateAt: Date | null | undefined;
    canonicalEndAt: Date;
  },
): void {
  const result = evaluateBoundaryAdjustmentObservation({
    initialBoundaryAt: params.candidateAt,
    finalBoundaryAt: params.canonicalEndAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'end_boundary_adjustment', result.rejectReason);
    }
    return;
  }
  metrics?.tripEndBoundaryAdjustment?.observe(
    {
      profile: params.profile,
      end_source: params.endSource,
      direction: result.direction,
    },
    result.latencySec!,
  );
}

export function observeTripDuration(
  metrics: MetricsSink | null | undefined,
  params: {
    profile: string;
    startAt: Date;
    endAt: Date;
  },
): void {
  const result = evaluateDurationObservation({
    startAt: params.startAt,
    endAt: params.endAt,
  });
  if (!result.observed) {
    if (result.rejectReason) {
      rejectSample(metrics, 'trip_duration', result.rejectReason);
    }
    return;
  }
  metrics?.tripDuration?.observe({ profile: params.profile }, result.latencySec!);
}
