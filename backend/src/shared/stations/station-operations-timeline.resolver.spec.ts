import { StationBookingRuleReasonCode } from './station-booking-rules.contract';
import { StationOperationsTimelineEntryType, StationOperationsTimelineSortOrder } from './station-operations-timeline.contract';
import {
  normalizeStationOperationsTimelinePageSize,
  resolveDefaultTimelineWindow,
  resolveStationOperationsTimeline,
} from './station-operations-timeline.resolver';

const STATION = 'station-a';
const ORG = 'org-a';
const TIMEZONE = 'Europe/Berlin';
const EVALUATED_AT = '2026-07-18T12:00:00.000Z';
const FROM = new Date('2026-07-17T00:00:00.000Z');
const TO = new Date('2026-07-25T23:59:59.999Z');

const vehicle = {
  licensePlate: 'B-XY 123',
  vehicleName: null,
  make: 'VW',
  model: 'Golf',
};

function baseInput(
  overrides: Partial<Parameters<typeof resolveStationOperationsTimeline>[0]> = {},
) {
  return {
    organizationId: ORG,
    stationId: STATION,
    timezone: TIMEZONE,
    evaluatedAt: EVALUATED_AT,
    fromUtc: FROM,
    toUtc: TO,
    sortOrder: StationOperationsTimelineSortOrder.ASC,
    page: 1,
    pageSize: 50,
    scopeApplied: false,
    bookings: [],
    transfers: [],
    tasks: [],
    handovers: [],
    completedHandoverKindsByBookingId: new Map(),
    ...overrides,
  };
}

describe('resolveStationOperationsTimeline', () => {
  it('emits pickup, return, overdue return, and one-way arrival entries with references and deep links', () => {
    const result = resolveStationOperationsTimeline(
      baseInput({
        bookings: [
          {
            id: 'booking-pickup',
            status: 'CONFIRMED',
            vehicleId: 'vehicle-1',
            pickupStationId: STATION,
            returnStationId: 'station-b',
            isOneWayRental: false,
            startDate: new Date('2026-07-18T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
          {
            id: 'booking-return',
            status: 'ACTIVE',
            vehicleId: 'vehicle-2',
            pickupStationId: 'station-b',
            returnStationId: STATION,
            isOneWayRental: false,
            startDate: new Date('2026-07-16T08:00:00.000Z'),
            endDate: new Date('2026-07-18T18:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
          {
            id: 'booking-overdue',
            status: 'ACTIVE',
            vehicleId: 'vehicle-3',
            pickupStationId: 'station-b',
            returnStationId: STATION,
            isOneWayRental: false,
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-17T10:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
          {
            id: 'booking-one-way',
            status: 'ACTIVE',
            vehicleId: 'vehicle-4',
            pickupStationId: 'station-b',
            returnStationId: STATION,
            isOneWayRental: true,
            startDate: new Date('2026-07-12T08:00:00.000Z'),
            endDate: new Date('2026-07-19T10:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
        ],
      }),
    );

    const types = result.entries.map((entry) => entry.type);
    expect(types).toContain(StationOperationsTimelineEntryType.PICKUP);
    expect(types).toContain(StationOperationsTimelineEntryType.RETURN);
    expect(types).toContain(StationOperationsTimelineEntryType.OVERDUE_RETURN);
    expect(types).toContain(StationOperationsTimelineEntryType.ONE_WAY_ARRIVAL);

    const pickup = result.entries.find((entry) => entry.id === 'pickup:booking-pickup');
    expect(pickup?.instantUtc).toBe('2026-07-18T08:00:00.000Z');
    expect(pickup?.stationLocalDate).toBe('2026-07-18');
    expect(pickup?.references.bookingLabel).toMatch(/^BKG-/);
    expect(pickup?.references.vehicleLabel).toBe('B-XY 123');
    expect(pickup?.deepLink).toBe('/operator/bookings/booking-pickup');
    expect(pickup?.actionRequired).toBe(true);

    const overdue = result.entries.find((entry) => entry.id === 'overdue-return:booking-overdue');
    expect(overdue?.status).toBe('OVERDUE');
    expect(overdue?.actionRequired).toBe(true);
  });

  it('emits transfer arrival/departure and operational task entries', () => {
    const result = resolveStationOperationsTimeline(
      baseInput({
        transfers: [
          {
            id: 'transfer-in',
            vehicleId: 'vehicle-5',
            fromStationId: 'station-b',
            toStationId: STATION,
            status: 'PLANNED',
            plannedAt: new Date('2026-07-18T14:00:00.000Z'),
            expectedArrivalAt: new Date('2026-07-18T16:00:00.000Z'),
            startedAt: null,
            completedAt: null,
            sourceBookingId: null,
            vehicle,
          },
          {
            id: 'transfer-out',
            vehicleId: 'vehicle-6',
            fromStationId: STATION,
            toStationId: 'station-b',
            status: 'IN_TRANSIT',
            plannedAt: new Date('2026-07-18T09:00:00.000Z'),
            expectedArrivalAt: new Date('2026-07-18T12:00:00.000Z'),
            startedAt: new Date('2026-07-18T09:30:00.000Z'),
            completedAt: null,
            sourceBookingId: null,
            vehicle,
          },
        ],
        tasks: [
          {
            id: 'task-1',
            type: 'VEHICLE_CLEANING',
            status: 'OPEN',
            title: 'Clean vehicle',
            vehicleId: 'vehicle-5',
            bookingId: null,
            dueDate: new Date('2026-07-18T17:00:00.000Z'),
            activatesAt: new Date('2026-07-18T10:00:00.000Z'),
            metadata: { stationId: STATION },
            vehicle,
          },
        ],
      }),
    );

    expect(result.entries.some((entry) => entry.type === StationOperationsTimelineEntryType.TRANSFER_ARRIVAL)).toBe(
      true,
    );
    expect(result.entries.some((entry) => entry.type === StationOperationsTimelineEntryType.TRANSFER_DEPARTURE)).toBe(
      true,
    );

    const task = result.entries.find((entry) => entry.id === 'task:task-1');
    expect(task?.type).toBe(StationOperationsTimelineEntryType.OPERATIONAL_TASK);
    expect(task?.deepLink).toBe('/operator/tasks?taskId=task-1');
    expect(task?.actionRequired).toBe(true);
  });

  it('emits after-hours events from booking rules and completed handovers', () => {
    const result = resolveStationOperationsTimeline(
      baseInput({
        bookings: [
          {
            id: 'booking-after-hours',
            status: 'CONFIRMED',
            vehicleId: 'vehicle-7',
            pickupStationId: STATION,
            returnStationId: 'station-b',
            isOneWayRental: false,
            startDate: new Date('2026-07-18T20:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            stationBookingRulesSnapshot: {
              pickup: {
                outcome: 'WARNING',
                reasons: [
                  {
                    code: StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
                    message: 'Outside opening hours',
                  },
                ],
              },
            },
            vehicle,
          },
        ],
        handovers: [
          {
            id: 'handover-1',
            bookingId: 'booking-after-hours',
            vehicleId: 'vehicle-7',
            kind: 'PICKUP',
            performedAt: new Date('2026-07-18T20:05:00.000Z'),
            actualStationId: STATION,
            stationRulesSnapshot: {
              reasons: [
                {
                  code: StationBookingRuleReasonCode.AFTER_HOURS_ALLOWED,
                  message: 'After hours allowed',
                },
              ],
            },
            vehicle,
          },
        ],
      }),
    );

    const afterHours = result.entries.filter(
      (entry) => entry.type === StationOperationsTimelineEntryType.AFTER_HOURS_EVENT,
    );
    expect(afterHours.length).toBeGreaterThanOrEqual(2);
    expect(afterHours.every((entry) => entry.ruleWarning)).toBe(true);
    expect(afterHours.some((entry) => entry.ruleWarningCodes.includes(StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS))).toBe(
      true,
    );
  });

  it('sorts descending and paginates server-side', () => {
    const result = resolveStationOperationsTimeline(
      baseInput({
        sortOrder: StationOperationsTimelineSortOrder.DESC,
        page: 2,
        pageSize: 1,
        bookings: [
          {
            id: 'booking-early',
            status: 'CONFIRMED',
            vehicleId: 'vehicle-1',
            pickupStationId: STATION,
            returnStationId: 'station-b',
            isOneWayRental: false,
            startDate: new Date('2026-07-18T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
          {
            id: 'booking-late',
            status: 'CONFIRMED',
            vehicleId: 'vehicle-2',
            pickupStationId: STATION,
            returnStationId: 'station-b',
            isOneWayRental: false,
            startDate: new Date('2026-07-19T08:00:00.000Z'),
            endDate: new Date('2026-07-21T18:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
        ],
      }),
    );

    expect(result.sortOrder).toBe(StationOperationsTimelineSortOrder.DESC);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe('pickup:booking-early');
  });

  it('does not expose personal data in references', () => {
    const result = resolveStationOperationsTimeline(
      baseInput({
        bookings: [
          {
            id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
            status: 'CONFIRMED',
            vehicleId: 'vehicle-1',
            pickupStationId: STATION,
            returnStationId: 'station-b',
            isOneWayRental: false,
            startDate: new Date('2026-07-18T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            stationBookingRulesSnapshot: null,
            vehicle,
          },
        ],
      }),
    );

    const serialized = JSON.stringify(result.entries[0]);
    expect(serialized).not.toMatch(/customer|email|phone|driver|name/i);
    expect(result.entries[0]?.references.bookingLabel).toMatch(/^BKG-[A-F0-9]{8}$/);
  });
});

describe('normalizeStationOperationsTimelinePageSize', () => {
  it('caps page size at the contract maximum', () => {
    expect(normalizeStationOperationsTimelinePageSize(500)).toEqual({
      pageSize: 200,
      pageSizeCapped: true,
    });
  });
});

describe('resolveDefaultTimelineWindow', () => {
  it('anchors the default window around the evaluated station day', () => {
    const window = resolveDefaultTimelineWindow(TIMEZONE, EVALUATED_AT, 14);
    expect(window.fromUtc.getTime()).toBeLessThan(window.toUtc.getTime());
    expect(window.toUtc.getTime() - window.fromUtc.getTime()).toBeGreaterThan(14 * 24 * 60 * 60 * 1000);
  });
});
