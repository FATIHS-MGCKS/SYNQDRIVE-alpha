import {
  classifyBoundaryAdjustment,
  classifyTimingTimestamp,
  evaluateBoundaryAdjustmentObservation,
  evaluateCandidateLatencyObservation,
  evaluateDurationObservation,
  evaluateRecognitionLatencyObservation,
} from './trip-fsm-timing.util';
import { observeEndCandidateLatency } from './trip-fsm-timing-observability.util';
import { TripMetricsService } from '../../observability/trip-metrics.service';

describe('trip-fsm-timing.util', () => {
  it('computes independent candidate, recognition, and boundary values (R8.22)', () => {
    const physicalEnd = new Date('2026-09-06T14:30:00.000Z');
    const possibleEndEntered = new Date('2026-09-06T14:32:00.000Z');
    const canonicalEnd = new Date('2026-09-06T14:30:05.000Z');
    const endRecognized = new Date('2026-09-06T14:34:00.000Z');

    const candidate = evaluateCandidateLatencyObservation({
      candidateAt: physicalEnd,
      enteredAt: possibleEndEntered,
    });
    const recognition = evaluateRecognitionLatencyObservation({
      recognizedAt: endRecognized,
      canonicalBoundaryAt: canonicalEnd,
    });
    const boundary = classifyBoundaryAdjustment(physicalEnd, canonicalEnd);

    expect(candidate.observed).toBe(true);
    expect(candidate.latencySec).toBe(120);
    expect(recognition.observed).toBe(true);
    expect(recognition.latencySec).toBe(235);
    expect(boundary.adjustmentSec).toBe(5);
    expect(boundary.direction).toBe('later');
  });
});

describe('trip-fsm-timing.util R8A classifier', () => {
  it('classifyTimingTimestamp distinguishes MISSING vs INVALID vs VALID', () => {
    expect(classifyTimingTimestamp(null)).toBe('MISSING');
    expect(classifyTimingTimestamp(undefined)).toBe('MISSING');
    expect(classifyTimingTimestamp(new Date(Number.NaN))).toBe('INVALID');
    expect(classifyTimingTimestamp(new Date('2026-09-06T12:00:00.000Z'))).toBe(
      'VALID',
    );
  });
});

describe('trip-fsm-timing.util R8A invalid timestamp matrix', () => {
  it('A — candidateAt null → missing_anchor', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: null,
      enteredAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(result.rejectReason).toBe('missing_anchor');
  });

  it('B — enteredAt undefined → missing_anchor', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: new Date('2026-09-06T12:00:00.000Z'),
      enteredAt: undefined,
    });
    expect(result.rejectReason).toBe('missing_anchor');
  });

  it('C — candidateAt NaN → invalid_timestamp', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: new Date(Number.NaN),
      enteredAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('D — enteredAt NaN → invalid_timestamp', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: new Date('2026-09-06T12:00:00.000Z'),
      enteredAt: new Date(Number.NaN),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('E — recognizedAt invalid → invalid_timestamp', () => {
    const result = evaluateRecognitionLatencyObservation({
      recognizedAt: new Date(Number.NaN),
      canonicalBoundaryAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('F — canonicalBoundaryAt invalid → invalid_timestamp', () => {
    const result = evaluateRecognitionLatencyObservation({
      recognizedAt: new Date('2026-09-06T12:00:05.000Z'),
      canonicalBoundaryAt: new Date(Number.NaN),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('G — boundary adjustment initial invalid → invalid_timestamp', () => {
    const result = evaluateBoundaryAdjustmentObservation({
      initialBoundaryAt: new Date(Number.NaN),
      finalBoundaryAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('H — boundary adjustment final invalid → invalid_timestamp', () => {
    const result = evaluateBoundaryAdjustmentObservation({
      initialBoundaryAt: new Date('2026-09-06T12:00:00.000Z'),
      finalBoundaryAt: new Date(Number.NaN),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('I — trip duration start invalid → invalid_timestamp', () => {
    const result = evaluateDurationObservation({
      startAt: new Date(Number.NaN),
      endAt: new Date('2026-09-06T12:30:00.000Z'),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('J — trip duration end invalid → invalid_timestamp', () => {
    const result = evaluateDurationObservation({
      startAt: new Date('2026-09-06T12:00:00.000Z'),
      endAt: new Date(Number.NaN),
    });
    expect(result.rejectReason).toBe('invalid_timestamp');
  });

  it('K — valid future candidate producing negative delta → negative_delta', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: new Date('2026-09-06T14:00:10.000Z'),
      enteredAt: new Date('2026-09-06T14:00:00.000Z'),
    });
    expect(result.rejectReason).toBe('negative_delta');
  });

  it('emits invalid_timestamp on Prometheus rejection counter', async () => {
    const metrics = new TripMetricsService();
    observeEndCandidateLatency(metrics, {
      profile: 'ICE',
      evidencePath: 'CONTINUITY',
      clockSource: 'PROVIDER_EVENT_TIME',
      candidateAt: new Date(Number.NaN),
      enteredAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    const serialized = await metrics.registry.metrics();
    expect(serialized).toContain(
      'synqdrive_trip_timing_sample_rejected_total{metric="end_candidate_latency",reason="invalid_timestamp"} 1',
    );
  });
});
