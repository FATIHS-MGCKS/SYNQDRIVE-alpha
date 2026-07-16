import {
  buildRestMissedMeasurementIdempotencyKey,
  detectWakeFlankMeasurementIds,
  evaluateRestTargetOutcome,
  evaluateRestTargetRetryState,
  getRestTargetQualityWindowMs,
  isWakeAfterTargetWindow,
  REST_6H_QUALITY_WINDOW_MS,
  REST_60M_QUALITY_WINDOW_MS,
  selectRestTargetObservation,
} from './battery-rest-target-evaluation';
import { LV_REST_TARGET_TYPES } from './lv-rest-window-target.metadata';

const TARGET_60M = new Date('2026-07-16T11:00:00.000Z');
const TARGET_6H = new Date('2026-07-16T16:00:00.000Z');
const RETRY_GRACE_MS = 30 * 60_000;

function basePolicy(targetAt: Date, windowMs: number) {
  return {
    targetAt,
    windowBeforeMs: windowMs,
    windowAfterMs: windowMs,
    wakeVoltageThreshold: 13.8,
    maxRestingVoltage: 13.2,
    restRequiresEngineOff: true,
  };
}

function restingCandidate(
  id: string,
  observedAt: Date,
  numericValue: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    measurementId: id,
    observedAt,
    numericValue,
    providerTimestamp: observedAt,
    context: {
      speedKmh: 0,
      ignitionOn: false,
      engineRunning: false,
      hasActiveTrip: false,
      isLvCharging: false,
      isHvCharging: false,
      providerObservationOutcome: 'NEW_OBSERVATION',
      ...overrides,
    },
  };
}

describe('battery-rest-target-evaluation', () => {
  const policy60m = basePolicy(TARGET_60M, REST_60M_QUALITY_WINDOW_MS);
  const policy6h = basePolicy(TARGET_6H, REST_6H_QUALITY_WINDOW_MS);

  it('uses ±15m quality window for REST_60M and ±30m for REST_6H', () => {
    expect(getRestTargetQualityWindowMs(LV_REST_TARGET_TYPES.REST_60M)).toBe(
      REST_60M_QUALITY_WINDOW_MS,
    );
    expect(getRestTargetQualityWindowMs(LV_REST_TARGET_TYPES.REST_6H)).toBe(
      REST_6H_QUALITY_WINDOW_MS,
    );
  });

  it('selects observation closest to 60m target', () => {
    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'obs-a',
          new Date('2026-07-16T10:50:00.000Z'),
          12.4,
        ),
        restingCandidate(
          'obs-b',
          new Date('2026-07-16T11:02:00.000Z'),
          12.45,
        ),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected?.measurementId).toBe('obs-b');
  });

  it('accepts 6h observation within ±30m window', () => {
    const result = selectRestTargetObservation({
      policy: policy6h,
      candidates: [
        restingCandidate(
          'obs-6h-edge',
          new Date('2026-07-16T15:31:00.000Z'),
          12.38,
        ),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected?.measurementId).toBe('obs-6h-edge');
  });

  it('rejects 6h observation outside ±30m window', () => {
    const result = selectRestTargetObservation({
      policy: policy6h,
      candidates: [
        restingCandidate(
          'obs-too-early',
          new Date('2026-07-16T15:20:00.000Z'),
          12.38,
        ),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_eligible_observation_in_target_window');
  });

  it('selects separate observation for 6h excluding 60m source', () => {
    const sharedSnapshotId = 'obs-shared';
    const result = selectRestTargetObservation({
      policy: policy6h,
      constraints: { excludedSourceMeasurementIds: [sharedSnapshotId] },
      candidates: [
        restingCandidate(
          sharedSnapshotId,
          new Date('2026-07-16T15:58:00.000Z'),
          12.42,
        ),
        restingCandidate(
          'obs-6h',
          new Date('2026-07-16T16:01:00.000Z'),
          12.38,
        ),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected?.measurementId).toBe('obs-6h');
  });

  it('rejects wake voltage after target window end', () => {
    const afterWindow = new Date(
      TARGET_60M.getTime() + REST_60M_QUALITY_WINDOW_MS + 60_000,
    );
    expect(isWakeAfterTargetWindow(afterWindow, 14.1, policy60m)).toBe(true);

    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate('wake-late', afterWindow, 14.1),
        restingCandidate(
          'valid',
          new Date('2026-07-16T11:05:00.000Z'),
          12.4,
        ),
      ],
    });

    expect(result.selected?.measurementId).toBe('valid');
  });

  it('rejects wake flank when voltage crosses wake threshold', () => {
    const flankIds = detectWakeFlankMeasurementIds(
      [
        restingCandidate(
          'before-wake',
          new Date('2026-07-16T10:58:00.000Z'),
          12.35,
        ),
        restingCandidate(
          'wake-flank',
          new Date('2026-07-16T11:01:00.000Z'),
          14.05,
        ),
      ],
      policy60m.wakeVoltageThreshold,
    );

    expect(flankIds.has('wake-flank')).toBe(true);

    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'before-wake',
          new Date('2026-07-16T10:58:00.000Z'),
          12.35,
        ),
        restingCandidate(
          'wake-flank',
          new Date('2026-07-16T11:01:00.000Z'),
          14.05,
        ),
        restingCandidate(
          'valid',
          new Date('2026-07-16T11:04:00.000Z'),
          12.41,
        ),
      ],
    });

    expect(result.selected?.measurementId).toBe('before-wake');
  });

  it('wake flank leaves no eligible observation when only wake readings exist near target', () => {
    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'wake-flank',
          new Date('2026-07-16T11:01:00.000Z'),
          14.05,
        ),
      ],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects observation without provider timestamp', () => {
    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        {
          measurementId: 'no-provider-ts',
          observedAt: new Date('2026-07-16T11:00:00.000Z'),
          numericValue: 12.4,
          providerTimestamp: null,
          context: {
            speedKmh: 0,
            ignitionOn: false,
            engineRunning: false,
            hasActiveTrip: false,
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects stale duplicate provider observation', () => {
    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'stale-replay',
          new Date('2026-07-16T11:00:00.000Z'),
          12.4,
          { providerObservationOutcome: 'STALE_REPLAY' },
        ),
      ],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects observation after new trip start', () => {
    const tripStart = new Date('2026-07-16T10:59:00.000Z');
    const result = selectRestTargetObservation({
      policy: policy60m,
      constraints: { tripStartsAfterAnchor: [tripStart] },
      candidates: [
        restingCandidate(
          'after-trip',
          new Date('2026-07-16T11:01:00.000Z'),
          12.4,
        ),
      ],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects charging context and active trip', () => {
    const charging = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'charging',
          new Date('2026-07-16T11:00:00.000Z'),
          12.4,
          { isHvCharging: true },
        ),
      ],
    });
    expect(charging.ok).toBe(false);

    const activeTrip = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        restingCandidate(
          'active-trip',
          new Date('2026-07-16T11:00:00.000Z'),
          12.4,
          { hasActiveTrip: true },
        ),
      ],
    });
    expect(activeTrip.ok).toBe(false);
  });

  it('stays retryable during provider delay before retry window ends', () => {
    const retry = evaluateRestTargetRetryState({
      now: new Date(TARGET_60M.getTime() + REST_60M_QUALITY_WINDOW_MS + 5 * 60_000),
      targetAt: TARGET_60M,
      qualityWindowAfterMs: REST_60M_QUALITY_WINDOW_MS,
      retryGraceMs: RETRY_GRACE_MS,
      hasSelection: false,
    });

    expect(retry.retryable).toBe(true);
    expect(retry.missed).toBe(false);
  });

  it('marks MISSED only after retry window is exhausted', () => {
    const retry = evaluateRestTargetRetryState({
      now: new Date(
        TARGET_60M.getTime() + REST_60M_QUALITY_WINDOW_MS + RETRY_GRACE_MS + 1_000,
      ),
      targetAt: TARGET_60M,
      qualityWindowAfterMs: REST_60M_QUALITY_WINDOW_MS,
      retryGraceMs: RETRY_GRACE_MS,
      hasSelection: false,
    });

    expect(retry.retryable).toBe(false);
    expect(retry.missed).toBe(true);
  });

  it('evaluateRestTargetOutcome returns retryable for stale provider delay', () => {
    const outcome = evaluateRestTargetOutcome({
      candidates: [],
      policy: policy60m,
      now: new Date(TARGET_60M.getTime() + REST_60M_QUALITY_WINDOW_MS + 10 * 60_000),
      retryGraceMs: RETRY_GRACE_MS,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.retryable).toBe(true);
      expect(outcome.missed).toBe(false);
    }
  });

  it('builds stable missed idempotency key', () => {
    expect(
      buildRestMissedMeasurementIdempotencyKey({
        sessionId: 'sess-1',
        restTargetType: LV_REST_TARGET_TYPES.REST_60M,
      }),
    ).toBe('rest-missed:sess-1:REST_60M');
  });

  it('maps REST_6H measurement type distinctly from REST_60M', () => {
    expect(LV_REST_TARGET_TYPES.REST_6H).toBe('REST_6H');
    expect(LV_REST_TARGET_TYPES.REST_60M).not.toBe(LV_REST_TARGET_TYPES.REST_6H);
  });
});
