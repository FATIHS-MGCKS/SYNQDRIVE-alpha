import {
  DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
  isWakeAfterTargetWindow,
  selectRestTargetObservation,
} from './battery-rest-target-evaluation';
import { LV_REST_TARGET_TYPES } from './lv-rest-window-target.metadata';

const TARGET_60M = new Date('2026-07-16T11:00:00.000Z');
const TARGET_6H = new Date('2026-07-16T16:00:00.000Z');

describe('battery-rest-target-evaluation', () => {
  const policy60m = {
    targetAt: TARGET_60M,
    windowBeforeMs: DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
    windowAfterMs: DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
    wakeVoltageThreshold: 13.8,
    maxRestingVoltage: 13.2,
  };

  const policy6h = {
    ...policy60m,
    targetAt: TARGET_6H,
  };

  it('selects observation closest to 60m target', () => {
    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        {
          measurementId: 'obs-a',
          observedAt: new Date('2026-07-16T10:50:00.000Z'),
          numericValue: 12.4,
          providerTimestamp: null,
        },
        {
          measurementId: 'obs-b',
          observedAt: new Date('2026-07-16T11:02:00.000Z'),
          numericValue: 12.45,
          providerTimestamp: null,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected?.measurementId).toBe('obs-b');
  });

  it('selects separate observation for 6h excluding 60m source', () => {
    const sharedSnapshotId = 'obs-shared';
    const result = selectRestTargetObservation({
      policy: policy6h,
      excludedSourceMeasurementIds: [sharedSnapshotId],
      candidates: [
        {
          measurementId: sharedSnapshotId,
          observedAt: new Date('2026-07-16T15:58:00.000Z'),
          numericValue: 12.42,
          providerTimestamp: null,
        },
        {
          measurementId: 'obs-6h',
          observedAt: new Date('2026-07-16T16:01:00.000Z'),
          numericValue: 12.38,
          providerTimestamp: null,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.selected?.measurementId).toBe('obs-6h');
  });

  it('rejects wake voltage after target window end', () => {
    const afterWindow = new Date(
      TARGET_60M.getTime() + DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS + 60_000,
    );
    expect(isWakeAfterTargetWindow(afterWindow, 14.1, policy60m)).toBe(true);

    const result = selectRestTargetObservation({
      policy: policy60m,
      candidates: [
        {
          measurementId: 'wake-late',
          observedAt: afterWindow,
          numericValue: 14.1,
          providerTimestamp: null,
        },
        {
          measurementId: 'valid',
          observedAt: new Date('2026-07-16T11:05:00.000Z'),
          numericValue: 12.4,
          providerTimestamp: null,
        },
      ],
    });

    expect(result.selected?.measurementId).toBe('valid');
  });

  it('maps REST_6H measurement type distinctly from REST_60M', () => {
    expect(LV_REST_TARGET_TYPES.REST_6H).toBe('REST_6H');
    expect(LV_REST_TARGET_TYPES.REST_60M).not.toBe(LV_REST_TARGET_TYPES.REST_6H);
  });
});
