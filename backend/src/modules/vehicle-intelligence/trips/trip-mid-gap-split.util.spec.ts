import {
  classifyLiveMidGapDriftDecision,
  computeMidGapDriftEvidence,
  selectRoutePointAtOrAfter,
  selectRoutePointAtOrBefore,
} from './trip-mid-gap-split.util';

const MAX_DRIFT = 200;

function haversineStub(_lat1: number, _lon1: number, _lat2: number, _lon2: number) {
  return (_lat2 - _lat1) * 111_000;
}

describe('trip-mid-gap-split.util (R6 drift contract)', () => {
  it('A — drift 0m is WITHIN_THRESHOLD and eligible', () => {
    const evidence = computeMidGapDriftEvidence({
      pre: { latitude: 52.0, longitude: 13.0 },
      post: { latitude: 52.0, longitude: 13.0 },
      maxAllowedDriftM: MAX_DRIFT,
      haversineMeters: () => 0,
    });
    expect(evidence.state).toBe('WITHIN_THRESHOLD');
    expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT).decision).toBe(
      'ALLOW_SPLIT',
    );
  });

  it('B — drift 199.9m is eligible', () => {
    const evidence = computeMidGapDriftEvidence({
      pre: { latitude: 52.0, longitude: 13.0 },
      post: { latitude: 52.0, longitude: 13.0 },
      maxAllowedDriftM: MAX_DRIFT,
      haversineMeters: () => 199.9,
    });
    expect(evidence.state).toBe('WITHIN_THRESHOLD');
    expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT).decision).toBe(
      'ALLOW_SPLIT',
    );
  });

  it('C — drift exactly 200m remains eligible (inclusive boundary)', () => {
    const evidence = computeMidGapDriftEvidence({
      pre: { latitude: 52.0, longitude: 13.0 },
      post: { latitude: 52.0, longitude: 13.0 },
      maxAllowedDriftM: MAX_DRIFT,
      haversineMeters: () => 200,
    });
    expect(evidence.state).toBe('WITHIN_THRESHOLD');
    expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT).decision).toBe(
      'ALLOW_SPLIT',
    );
  });

  it('D — drift > 200m is rejected', () => {
    const evidence = computeMidGapDriftEvidence({
      pre: { latitude: 52.0, longitude: 13.0 },
      post: { latitude: 52.0, longitude: 13.0 },
      maxAllowedDriftM: MAX_DRIFT,
      haversineMeters: () => 200.1,
    });
    expect(evidence.state).toBe('EXCEEDS_THRESHOLD');
    expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT)).toMatchObject({
      decision: 'REJECTED',
      reason: 'excessive_drift',
    });
  });

  it('E/F/G — missing pre/post/both waypoints → UNKNOWN and reject live split', () => {
    for (const [pre, post] of [
      [null, { latitude: 52, longitude: 13 }],
      [{ latitude: 52, longitude: 13 }, null],
      [null, null],
    ] as const) {
      const evidence = computeMidGapDriftEvidence({
        pre,
        post,
        maxAllowedDriftM: MAX_DRIFT,
        haversineMeters: haversineStub,
      });
      expect(evidence.state).toBe('UNKNOWN');
      expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT)).toMatchObject({
        decision: 'REJECTED',
        reason: 'unknown_drift',
      });
    }
  });

  it('H — non-finite drift → UNKNOWN', () => {
    const evidence = computeMidGapDriftEvidence({
      pre: { latitude: 52, longitude: 13 },
      post: { latitude: 52, longitude: 13 },
      maxAllowedDriftM: MAX_DRIFT,
      haversineMeters: () => Number.NaN,
    });
    expect(evidence.state).toBe('UNKNOWN');
  });

  it('selectRoutePointAtOrBefore/After pick timestamp-bounded coordinates', () => {
    const boundary = new Date('2026-09-06T12:03:00.000Z');
    const points = [
      { timestamp: '2026-09-06T12:00:00.000Z', latitude: 1, longitude: 1 },
      { timestamp: '2026-09-06T12:02:59.000Z', latitude: 2, longitude: 2 },
      { timestamp: '2026-09-06T12:03:01.000Z', latitude: 3, longitude: 3 },
    ];
    expect(selectRoutePointAtOrBefore(points, boundary)?.latitude).toBe(2);
    expect(selectRoutePointAtOrAfter(points, boundary)?.latitude).toBe(3);
  });
});

describe.each(['ICE', 'EV', 'HYBRID', 'UNKNOWN'])(
  'profile-agnostic drift safety (%s)',
  () => {
    it('UNKNOWN drift never allows split', () => {
      const evidence = computeMidGapDriftEvidence({
        pre: null,
        post: null,
        maxAllowedDriftM: MAX_DRIFT,
        haversineMeters: haversineStub,
      });
      expect(classifyLiveMidGapDriftDecision(evidence, MAX_DRIFT).decision).toBe(
        'REJECTED',
      );
    });
  },
);
