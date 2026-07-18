import type { TaskType } from '@prisma/client';
import { resolveStationOperationsSummary } from './station-operations-summary.resolver';

const STATION = 'station-a';
const EVALUATED_AT = '2026-07-18T12:00:00.000Z';

function baseInput(
  overrides: Partial<Parameters<typeof resolveStationOperationsSummary>[0]> = {},
) {
  return {
    stationId: STATION,
    evaluatedAt: EVALUATED_AT,
    tasks: [],
    notifications: [],
    vehicles: [],
    bookings: [],
    transfers: [],
    configurationProblems: [],
    operationalWarnings: [],
    ...overrides,
  };
}

describe('resolveStationOperationsSummary', () => {
  it('deduplicates tasks that match multiple attribution paths into a single category count', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        vehicles: [{ id: 'v-on-site', currentStationId: STATION }],
        tasks: [
          {
            id: 'task-1',
            type: 'VEHICLE_SERVICE' as TaskType,
            vehicleId: 'v-on-site',
            bookingId: null,
            metadata: { stationId: STATION },
          },
        ],
      }),
    );

    expect(result.tasks.total).toBe(1);
    expect(result.tasks.categories.stationLinked.count).toBe(1);
    expect(result.tasks.categories.vehicleOnSite.count).toBe(0);
  });

  it('classifies on-site vehicle tasks separately from home-fleet-only vehicle tasks', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        vehicles: [
          { id: 'v-on-site', currentStationId: STATION },
          { id: 'v-home-only', currentStationId: 'other-station' },
        ],
        tasks: [
          {
            id: 'on-site-task',
            type: 'VEHICLE_CLEANING' as TaskType,
            vehicleId: 'v-on-site',
            bookingId: null,
            metadata: null,
          },
          {
            id: 'home-only-task',
            type: 'VEHICLE_CLEANING' as TaskType,
            vehicleId: 'v-home-only',
            bookingId: null,
            metadata: null,
          },
        ],
      }),
    );

    expect(result.tasks.total).toBe(1);
    expect(result.tasks.categories.vehicleOnSite.count).toBe(1);
  });

  it('counts overdue booking pickup/return tasks in the overdue category', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        bookings: [
          {
            id: 'b-overdue-return',
            status: 'ACTIVE',
            pickupStationId: 'other',
            returnStationId: STATION,
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-17T10:00:00.000Z'),
          },
        ],
        tasks: [
          {
            id: 'return-task',
            type: 'BOOKING_RETURN' as TaskType,
            vehicleId: null,
            bookingId: 'b-overdue-return',
            metadata: null,
          },
        ],
      }),
    );

    expect(result.tasks.total).toBe(1);
    expect(result.tasks.categories.overduePickupReturn.count).toBe(1);
    expect(result.tasks.categories.bookingPickupReturn.count).toBe(0);
  });

  it('classifies transfer tasks via metadata.transferId', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        transfers: [
          { id: 'transfer-1', fromStationId: STATION, toStationId: 'other-station' },
        ],
        tasks: [
          {
            id: 'transfer-task',
            type: 'CUSTOM' as TaskType,
            vehicleId: null,
            bookingId: null,
            metadata: { transferId: 'transfer-1' },
          },
        ],
      }),
    );

    expect(result.tasks.total).toBe(1);
    expect(result.tasks.categories.transfer.count).toBe(1);
  });

  it('excludes org-wide notifications from station totals', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        notifications: [
          {
            id: 'n-org-wide',
            eventType: 'INTEGRATION_DISCONNECTED',
            domain: 'INTEGRATION',
            severity: 'CRITICAL',
            entityType: 'ORGANIZATION',
            entityId: 'org-1',
            actionTarget: {},
          },
          {
            id: 'n-station',
            eventType: 'station-shortage',
            domain: 'OPERATIONS',
            severity: 'WARNING',
            entityType: 'STATION',
            entityId: STATION,
            actionTarget: {},
          },
        ],
      }),
    );

    expect(result.notifications.total).toBe(1);
    expect(result.notifications.categories.stationLinked.count).toBe(1);
  });

  it('aggregates operational problems from configuration and warnings', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        configurationProblems: [
          { code: 'MISSING_COORDINATES', message: 'Missing coordinates', severity: 'warning' },
        ],
        operationalWarnings: [
          { code: 'CAPACITY_WARNING', message: 'Near capacity', severity: 'warning' },
          { code: 'AFTER_HOURS', message: 'After hours', severity: 'info' },
        ],
      }),
    );

    expect(result.operationalProblems.configurationProblems).toBe(1);
    expect(result.operationalProblems.operationalWarnings).toBe(2);
    expect(result.operationalProblems.total).toBe(3);
  });

  it('keeps category counts aligned with deduplicated task total', () => {
    const result = resolveStationOperationsSummary(
      baseInput({
        vehicles: [{ id: 'v1', currentStationId: STATION }],
        bookings: [
          {
            id: 'b1',
            status: 'CONFIRMED',
            pickupStationId: STATION,
            returnStationId: 'other',
            startDate: new Date('2026-07-17T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
          },
        ],
        transfers: [
          { id: 't1', fromStationId: STATION, toStationId: 'other' },
        ],
        tasks: [
          {
            id: 't-station',
            type: 'CUSTOM' as TaskType,
            vehicleId: null,
            bookingId: null,
            metadata: { stationId: STATION },
          },
          {
            id: 't-vehicle',
            type: 'VEHICLE_SERVICE' as TaskType,
            vehicleId: 'v1',
            bookingId: null,
            metadata: null,
          },
          {
            id: 't-booking',
            type: 'BOOKING_PICKUP' as TaskType,
            vehicleId: null,
            bookingId: 'b1',
            metadata: null,
          },
          {
            id: 't-transfer',
            type: 'CUSTOM' as TaskType,
            vehicleId: null,
            bookingId: null,
            metadata: { transferId: 't1' },
          },
        ],
      }),
    );

    const categorySum = Object.values(result.tasks.categories).reduce(
      (sum, category) => sum + category.count,
      0,
    );

    expect(result.tasks.total).toBe(4);
    expect(categorySum).toBe(result.tasks.total);
  });
});
