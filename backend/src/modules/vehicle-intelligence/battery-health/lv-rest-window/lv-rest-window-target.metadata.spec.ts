import {
  isLvRestTargetAlreadyScheduled,
  LV_REST_TARGET_JOB_STATUS,
  LV_REST_TARGET_TYPES,
  mergeLvRestTargetJobMetadata,
} from './lv-rest-window-target.metadata';

describe('lv-rest-window-target.metadata', () => {
  it('detects already scheduled REST_60M targets', () => {
    const metadata = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_60M, {
      idempotencyKey: 'battery-rest:veh:window:60m',
      scheduledFor: '2026-07-16T11:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
    });

    expect(isLvRestTargetAlreadyScheduled(metadata, LV_REST_TARGET_TYPES.REST_60M)).toBe(true);
  });

  it('merges cancellation metadata for scheduled targets', () => {
    const base = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_60M, {
      idempotencyKey: 'battery-rest:veh:window:60m',
      scheduledFor: '2026-07-16T11:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
    });

    const cancelled = mergeLvRestTargetJobMetadata(base, LV_REST_TARGET_TYPES.REST_60M, {
      status: LV_REST_TARGET_JOB_STATUS.CANCELLED,
      cancelReason: 'wake_detected',
      completedAt: '2026-07-16T10:45:00.000Z',
    });

    expect(cancelled).toEqual(
      expect.objectContaining({
        scheduledTargets: {
          REST_60M: expect.objectContaining({
            status: LV_REST_TARGET_JOB_STATUS.CANCELLED,
            cancelReason: 'wake_detected',
          }),
        },
      }),
    );
  });
});
