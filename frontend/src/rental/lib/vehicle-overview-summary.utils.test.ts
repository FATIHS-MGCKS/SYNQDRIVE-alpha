import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  buildBookingsOverviewCard,
  buildDamagesOverviewCard,
  buildDocumentsOverviewCard,
  buildTasksOverviewCard,
  buildTripsOverviewCard,
} from './vehicle-overview-cards.utils';
import { deriveVehicleOverviewReadiness } from './vehicle-overview-readiness.utils';
import {
  buildVehicleOverviewSummary,
  parseVehicleBookingOperatorList,
} from './vehicle-overview-summary.utils';
import type { VehicleFileSummary } from './vehicle-file-summary.types';

describe('vehicle-overview-cards.utils', () => {
  it('builds trips card with last trip today label', () => {
    const now = Date.parse('2026-06-18T18:00:00.000Z');
    const card = buildTripsOverviewCard({
      todayTrips: [
        {
          id: 't1',
          vehicleId: 'v1',
          tripStatus: 'COMPLETED',
          startTime: '2026-06-18T13:00:00.000Z',
          endTime: '2026-06-18T14:22:00.000Z',
          distanceKm: 18,
          abuseEvents: 0,
        },
      ],
      tripStats: { totalTrips: 12, totalDistanceKm: 400, stressLevel: 'low' } as never,
      now,
    });

    expect(card.lastTripLabel).toContain('Last trip today');
    expect(card.todayDistanceLabel).toBe('18 km today');
    expect(card.status).toBe('clear');
    expect(card.targetTab).toBe('trips');
  });

  it('builds positive tasks card when no open tasks', () => {
    const card = buildTasksOverviewCard({ tasks: [], rawTasks: [] });
    expect(card.headline).toBe('No open tasks');
    expect(card.status).toBe('clear');
  });

  it('tolerates paginated task list responses without throwing', () => {
    const rawTasks = [
      {
        id: 'task-1',
        title: 'Check tires',
        status: 'OPEN',
        priority: 'NORMAL',
        blocksVehicleAvailability: false,
      },
    ] as ApiTask[];

    expect(() =>
      buildTasksOverviewCard({
        tasks: [],
        rawTasks: { data: rawTasks, meta: { limit: 50, nextCursor: null } } as never,
      }),
    ).not.toThrow();

    const card = buildTasksOverviewCard({
      tasks: [],
      rawTasks: { data: rawTasks, meta: { limit: 50, nextCursor: null } } as never,
    });
    expect(card.topTaskSubline).toContain('Check tires');
  });

  it('builds blocking tasks card from raw tasks', () => {
    const rawTasks = [
      {
        id: 'task-1',
        title: 'Replace brake pads',
        status: 'OPEN',
        priority: 'CRITICAL',
        blocksVehicleAvailability: true,
      },
    ] as ApiTask[];

    const card = buildTasksOverviewCard({
      tasks: [
        {
          id: 'task-1',
          title: 'Replace brake pads',
          description: '',
          apiStatus: 'OPEN',
          displayStatus: 'open',
          isOverdue: false,
          priority: 'critical',
          category: 'Service',
          assigneeLabel: 'Unassigned',
          dueDate: null,
          createdAt: null,
        },
      ],
      rawTasks,
    });

    expect(card.headline).toBe('1 blocking task');
    expect(card.status).toBe('critical');
    expect(card.topTaskSubline).toBeDefined();
  });

  it('builds documents card with missing and expiring counts', () => {
    const summary = {
      documentCategories: [
        { uiStatus: 'missing' },
        { uiStatus: 'expiring_soon' },
      ],
      mandatoryDocumentCoverage: { configured: 2, total: 4 },
      pendingReviews: { count: 0, items: [] },
    } as unknown as VehicleFileSummary;

    const card = buildDocumentsOverviewCard({ summary });
    expect(card.missingCount).toBe(1);
    expect(card.expiringSoonCount).toBe(1);
    expect(card.status).toBe('critical');
  });
});

describe('vehicle-overview-readiness.utils', () => {
  it('returns blocked when rental is blocked', () => {
    const summary = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Good Health',
      rentalBlocked: true,
      blockingReasons: ['TÜV overdue'],
      bookings: [],
      tasks: [],
      damageStats: null,
      fileSummary: null,
      todayTrips: [],
      tripStats: null,
    });

    expect(summary.readiness.readinessStatus).toBe('blocked');
    expect(summary.readiness.title).toBe('Not ready');
    expect(summary.readiness.blockers[0]).toContain('TÜV overdue');
  });

  it('returns ready when all tracked areas are clear', () => {
    const summary = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Good Health',
      bookings: [],
      tasks: [],
      damageStats: { open: 0, blockingRental: 0, safetyCritical: 0 } as never,
      fileSummary: {
        documentCategories: [],
        mandatoryDocumentCoverage: { configured: 2, total: 2 },
        pendingReviews: { count: 0, items: [] },
      } as VehicleFileSummary,
      todayTrips: [],
      tripStats: { totalTrips: 0, totalDistanceKm: 0, stressLevel: null } as never,
    });

    expect(summary.readiness.readinessStatus).toBe('ready');
    expect(summary.readiness.title).toBe('Ready for rental');
  });

  it('does NOT block on missing documents without a canonical rental blocker', () => {
    const summary = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Good Health',
      rentalBlocked: false,
      blockingReasons: [],
      bookings: [],
      tasks: [],
      damageStats: { open: 0, blockingRental: 0, safetyCritical: 0 } as never,
      fileSummary: {
        documentCategories: Array.from({ length: 13 }, () => ({ uiStatus: 'missing' })),
        mandatoryDocumentCoverage: { configured: 0, total: 13 },
        pendingReviews: { count: 0, items: [] },
      } as unknown as VehicleFileSummary,
      todayTrips: [],
      tripStats: null,
    });

    expect(summary.cards.documents.missingCount).toBe(13);
    expect(summary.readiness.readinessStatus).not.toBe('blocked');
    expect(summary.readiness.blockers).toHaveLength(0);
  });

  it('blocks only from the canonical rental-health flag, not local aggregates', () => {
    const summary = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Critical',
      rentalBlocked: true,
      blockingReasons: ['TÜV expired'],
      bookings: [],
      tasks: [],
      damageStats: { open: 3, blockingRental: 2, safetyCritical: 1 } as never,
      fileSummary: {
        documentCategories: [{ uiStatus: 'missing' }, { uiStatus: 'expired' }],
        mandatoryDocumentCoverage: { configured: 0, total: 2 },
        pendingReviews: { count: 0, items: [] },
      } as unknown as VehicleFileSummary,
      todayTrips: [],
      tripStats: null,
    });

    expect(summary.readiness.readinessStatus).toBe('blocked');
    expect(summary.readiness.blockers).toEqual(['TÜV expired']);
  });

  it('does NOT block on incomplete rental-document coverage without a canonical blocker', () => {
    const summary = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Warning',
      rentalBlocked: false,
      blockingReasons: [],
      bookings: [],
      tasks: [],
      damageStats: { open: 0, blockingRental: 0, safetyCritical: 0 } as never,
      fileSummary: {
        documentCategories: [{ uiStatus: 'missing' }, { uiStatus: 'missing' }],
        mandatoryDocumentCoverage: { configured: 1, total: 5 },
        pendingReviews: { count: 0, items: [] },
      } as unknown as VehicleFileSummary,
      todayTrips: [],
      tripStats: null,
    });

    expect(summary.readiness.readinessStatus).not.toBe('blocked');
  });

  it('returns attention for open non-blocking damages', () => {
    const cards = {
      trips: buildTripsOverviewCard({ todayTrips: [], tripStats: null }),
      bookings: buildBookingsOverviewCard({ bookings: [] }),
      tasks: buildTasksOverviewCard({ tasks: [], rawTasks: [] }),
      damages: buildDamagesOverviewCard({
        stats: { open: 2, blockingRental: 0, safetyCritical: 0 } as never,
      }),
      documents: buildDocumentsOverviewCard({ summary: null, error: true }),
    };

    const readiness = deriveVehicleOverviewReadiness({
      health: {
        effectiveStatus: 'Good Health',
        rentalBlocked: false,
        blockingReasons: [],
        loadState: 'ready',
      },
      cards,
    });

    expect(readiness.readinessStatus).toBe('attention');
    expect(readiness.title).toBe('Attention needed');
  });
});

describe('vehicle-overview-summary.utils', () => {
  it('parses booking rows for overview cards', () => {
    const now = Date.parse('2026-06-18T12:00:00.000Z');
    const bookings = parseVehicleBookingOperatorList([
      {
        id: 'b1',
        statusEnum: 'CONFIRMED',
        customerName: 'Max Mustermann',
        startDate: '2026-06-19T10:00:00.000Z',
        endDate: '2026-06-22T10:00:00.000Z',
      },
    ]);

    const card = buildBookingsOverviewCard({ bookings, now });
    expect(card.status).toBe('attention');
    expect(card.nextBookingLabel).toContain('Max Mustermann');
  });
});
