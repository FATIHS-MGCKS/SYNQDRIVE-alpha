import { describe, expect, it } from 'vitest';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import type { OperatorTodayFeedState } from '../hooks/operatorTodayFeed.utils';
import { buildOperatorTodaySnapshot } from './operatorData';

function emptyTaskFeed(): OperatorTodayFeedState {
  return {
    buckets: {
      NOW: undefined,
      TODAY: undefined,
      UPCOMING: undefined,
      PLANNED: undefined,
      UNASSIGNED: undefined,
    },
    summary: null,
    timezone: 'Europe/Berlin',
    summaryLoading: false,
    summaryError: null,
    canViewUnassigned: false,
  };
}

function pickupRow(partial: Partial<TodayBookingApiRow> & { id: string }): TodayBookingApiRow {
  return {
    vehicleId: 'veh-1',
    vehicleName: 'Golf',
    vehicleLicense: 'B-XY 1',
    customerName: 'Customer A',
    startDate: '2026-07-15T10:00:00.000Z',
    endDate: '2026-07-16T10:00:00.000Z',
    status: 'CONFIRMED',
    statusEnum: 'CONFIRMED',
    pickupStationName: 'Berlin',
    isOverdue: false,
    ...partial,
  };
}

describe('buildOperatorTodaySnapshot', () => {
  const fixedNow = new Date('2026-07-15T11:30:00.000Z').getTime();

  it('sorts due-now bookings by scheduled time ascending', () => {
    const originalNow = Date.now;
    Date.now = () => fixedNow;
    try {
      const sorted = buildOperatorTodaySnapshot({
        pickups: [
          pickupRow({ id: 'later', startDate: '2026-07-15T12:00:00.000Z' }),
          pickupRow({ id: 'sooner', startDate: '2026-07-15T10:30:00.000Z' }),
        ],
        returns: [],
        taskFeed: emptyTaskFeed(),
        fleetVehicles: [],
        healthMap: new Map(),
        locale: 'de',
      });
      expect(sorted.dueNow.map((item) => item.bookingId)).toEqual(['sooner', 'later']);
    } finally {
      Date.now = originalNow;
    }
  });

  it('excludes completed pickups from due-now list', () => {
    const originalNow = Date.now;
    Date.now = () => fixedNow;
    try {
      const snapshot = buildOperatorTodaySnapshot({
        pickups: [
          pickupRow({ id: 'done', startDate: '2026-07-15T10:00:00.000Z', pickupProtocol: { id: 'p1' } as TodayBookingApiRow['pickupProtocol'] }),
          pickupRow({ id: 'open', startDate: '2026-07-15T10:30:00.000Z' }),
        ],
        returns: [],
        taskFeed: emptyTaskFeed(),
        fleetVehicles: [],
        healthMap: new Map(),
      });
      expect(snapshot.dueNow.map((item) => item.bookingId)).toEqual(['open']);
    } finally {
      Date.now = originalNow;
    }
  });

  it('lists blocked fleet vehicles from health map', () => {
    const snapshot = buildOperatorTodaySnapshot({
      pickups: [],
      returns: [],
      taskFeed: emptyTaskFeed(),
      fleetVehicles: [
        {
          id: 'veh-blocked',
          make: 'VW',
          model: 'ID.3',
          license: 'B-EV 1',
          station: 'Hamburg',
        } as never,
      ],
      healthMap: new Map([
        [
          'veh-blocked',
          {
            rental_blocked: true,
            blocking_reasons: ['OPEN_DAMAGE'],
          } as never,
        ],
      ]),
    });
    expect(snapshot.blockedVehicles).toHaveLength(1);
    expect(snapshot.blockedVehicles[0].reasons).toContain('OPEN_DAMAGE');
  });
});
