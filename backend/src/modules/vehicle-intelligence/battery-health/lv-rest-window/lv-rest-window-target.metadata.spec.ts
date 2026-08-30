import {
  isLvRestTargetAlreadyScheduled,
  isLvRestTargetAwaitingReconciliationReschedule,
  isLvRestTargetTerminal,
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

  it('treats ENQUEUED as non-terminal so reconciliation can rescue stuck targets', () => {
    const metadata = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_60M, {
      idempotencyKey: 'battery-rest:veh:window:60m',
      scheduledFor: '2026-07-16T11:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
    });

    expect(isLvRestTargetTerminal(metadata, LV_REST_TARGET_TYPES.REST_60M)).toBe(false);
    expect(isLvRestTargetAlreadyScheduled(metadata, LV_REST_TARGET_TYPES.REST_60M)).toBe(true);
    expect(
      isLvRestTargetAwaitingReconciliationReschedule(metadata, LV_REST_TARGET_TYPES.REST_60M),
    ).toBe(false);
  });

  it('PENDING_EVALUATION is not already-scheduled but awaits reconciliation reschedule', () => {
    const metadata = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_60M, {
      idempotencyKey: 'battery-rest:veh:window:60m',
      scheduledFor: '2026-07-16T11:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION,
    });

    expect(isLvRestTargetAlreadyScheduled(metadata, LV_REST_TARGET_TYPES.REST_60M)).toBe(
      false,
    );
    expect(
      isLvRestTargetAwaitingReconciliationReschedule(metadata, LV_REST_TARGET_TYPES.REST_60M),
    ).toBe(true);
    expect(isLvRestTargetTerminal(metadata, LV_REST_TARGET_TYPES.REST_60M)).toBe(false);
  });

  it('treats COMPLETED and MISSED as terminal', () => {
    const completed = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_60M, {
      idempotencyKey: 'battery-rest:veh:window:60m',
      scheduledFor: '2026-07-16T11:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
    });
    const missed = mergeLvRestTargetJobMetadata(null, LV_REST_TARGET_TYPES.REST_6H, {
      idempotencyKey: 'battery-rest:veh:window:6h',
      scheduledFor: '2026-07-16T16:00:00.000Z',
      status: LV_REST_TARGET_JOB_STATUS.MISSED,
    });

    expect(isLvRestTargetTerminal(completed, LV_REST_TARGET_TYPES.REST_60M)).toBe(true);
    expect(isLvRestTargetTerminal(missed, LV_REST_TARGET_TYPES.REST_6H)).toBe(true);
  });
});
