import {
  classifyBoundaryAdjustment,
  evaluateCandidateLatencyObservation,
  evaluateRecognitionLatencyObservation,
} from './trip-fsm-timing.util';

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

  it('rejects negative candidate latency without clamping (R8.23)', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: new Date('2026-09-06T14:00:10.000Z'),
      enteredAt: new Date('2026-09-06T14:00:00.000Z'),
    });
    expect(result.observed).toBe(false);
    expect(result.rejectReason).toBe('negative_delta');
  });

  it('rejects missing anchor', () => {
    const result = evaluateCandidateLatencyObservation({
      candidateAt: null,
      enteredAt: new Date(),
    });
    expect(result.observed).toBe(false);
    expect(result.rejectReason).toBe('missing_anchor');
  });
});
