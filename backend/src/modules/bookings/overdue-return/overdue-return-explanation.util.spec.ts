import type { BookingStatus } from '@prisma/client';
import { buildOverdueReturnExplanation } from './overdue-return-explanation.util';
import {
  BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES,
  OVERDUE_RETURN_REASON_CODE,
  OVERDUE_RETURN_INCONSISTENCY_FLAG,
} from './overdue-return-explanation.constants';

const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';

function baseBooking(overrides: Partial<{
  id: string;
  vehicleId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}> = {}) {
  const start = new Date('2026-07-20T08:00:00.000Z');
  const end = new Date('2026-07-24T10:00:00.000Z');
  return {
    id: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    status: 'ACTIVE' as BookingStatus,
    startDate: start,
    endDate: end,
    completedAt: null,
    cancelledAt: null,
    pickupStationId: 'station-pickup',
    returnStationId: 'station-return',
    actualReturnStationId: null,
    ...overrides,
  };
}

describe('buildOverdueReturnExplanation', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('explains normal overdue return for ACTIVE booking without return protocol', () => {
    const result = buildOverdueReturnExplanation({
      booking: baseBooking(),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now,
    });

    expect(result.isMarkedOverdue).toBe(true);
    expect(result.gracePeriodMinutes).toBe(BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES);
    expect(result.scheduledReturnAt).toBe('2026-07-24T10:00:00.000Z');
    expect(result.overdueSince).toBe('2026-07-24T10:00:00.000Z');
    expect(result.overdueDurationMinutes).toBe(120);
    expect(result.actualReturnAt).toBeNull();
    expect(result.handoverStatus).toBe('PICKUP_COMPLETED');
    expect(result.returnStatus).toBe('PENDING');
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        OVERDUE_RETURN_REASON_CODE.RETURN_DEADLINE_PASSED,
        OVERDUE_RETURN_REASON_CODE.GRACE_PERIOD_EXCEEDED,
        OVERDUE_RETURN_REASON_CODE.RETURN_NOT_COMPLETED,
        OVERDUE_RETURN_REASON_CODE.HANDOVER_STILL_ACTIVE,
      ]),
    );
    expect(result.blockingFacts).toContain('return_handover_protocol_missing=true');
  });

  it('does not mark overdue when return deadline not passed yet', () => {
    const result = buildOverdueReturnExplanation({
      booking: baseBooking({
        endDate: new Date('2026-07-25T10:00:00.000Z'),
      }),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now,
    });

    expect(result.isMarkedOverdue).toBe(false);
    expect(result.overdueSince).toBeNull();
    expect(result.reasonCodes).toContain(OVERDUE_RETURN_REASON_CODE.RETURN_NOT_DUE_YET);
  });

  it('does not mark overdue when approved extension moved endDate forward', () => {
    const originalEnd = new Date('2026-07-24T10:00:00.000Z');
    const extendedEnd = new Date('2026-07-25T10:00:00.000Z');
    const result = buildOverdueReturnExplanation({
      booking: baseBooking({ endDate: extendedEnd }),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now,
      originalScheduledReturnAt: originalEnd,
    });

    expect(result.extensionStatus).toBe('APPLIED_VIA_END_DATE_PATCH');
    expect(result.approvedExtensionUntil).toBe(extendedEnd.toISOString());
    expect(result.isMarkedOverdue).toBe(false);
    expect(result.reasonCodes).not.toContain(OVERDUE_RETURN_REASON_CODE.NO_APPROVED_EXTENSION);
  });

  it('flags inconsistency when return protocol exists but overdue still computed', () => {
    const result = buildOverdueReturnExplanation({
      booking: baseBooking(),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: { performedAt: new Date('2026-07-24T11:00:00.000Z') },
      orgTimezone: 'Europe/Berlin',
      now,
      fleetActiveIsOverdue: true,
    });

    expect(result.inconsistencyFlags).toContain(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.RETURN_PROTOCOL_EXISTS_BUT_MARKED_OVERDUE,
    );
    expect(result.inconsistencyFlags).toContain(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.RETURN_COMPLETED_BOOKING_STILL_ACTIVE,
    );
    expect(result.reasonCodes).toContain(
      OVERDUE_RETURN_REASON_CODE.RETURN_COMPLETED_BUT_RUNTIME_STALE,
    );
    expect(result.actualReturnAt).toBe('2026-07-24T11:00:00.000Z');
    expect(result.returnStatus).toBe('COMPLETED');
  });

  it('flags cancelled booking marked overdue', () => {
    const result = buildOverdueReturnExplanation({
      booking: baseBooking({
        status: 'CANCELLED',
        cancelledAt: new Date('2026-07-24T09:00:00.000Z'),
      }),
      pickupProtocol: null,
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now,
      runtimeMarkedOverdue: true,
    });

    expect(result.inconsistencyFlags).toContain(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.CANCELLED_BOOKING_MARKED_OVERDUE,
    );
    expect(result.reasonCodes).toContain(
      OVERDUE_RETURN_REASON_CODE.BOOKING_CANCELLED_BUT_MARKED_OVERDUE,
    );
  });

  it('flags fleet context divergence when fleet flag disagrees with canonical ACTIVE overdue', () => {
    const result = buildOverdueReturnExplanation({
      booking: baseBooking({ endDate: new Date('2026-07-25T10:00:00.000Z') }),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now,
      fleetActiveIsOverdue: true,
    });

    expect(result.inconsistencyFlags).toContain(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.FLEET_ACTIVE_IS_OVERDUE_DIVERGENCE,
    );
    expect(result.reasonCodes).toContain(OVERDUE_RETURN_REASON_CODE.FLEET_CONTEXT_DIVERGENCE);
  });

  it('uses org timezone for return timing without shifting scheduledReturnAt', () => {
    const endDate = new Date('2026-07-24T22:00:00.000Z');
    const result = buildOverdueReturnExplanation({
      booking: baseBooking({ endDate }),
      pickupProtocol: { performedAt: new Date('2026-07-20T08:30:00.000Z') },
      returnProtocol: null,
      orgTimezone: 'Europe/Berlin',
      now: new Date('2026-07-24T21:30:00.000Z'),
    });

    expect(result.scheduledReturnAt).toBe(endDate.toISOString());
    expect(result.isMarkedOverdue).toBe(false);
  });
});
