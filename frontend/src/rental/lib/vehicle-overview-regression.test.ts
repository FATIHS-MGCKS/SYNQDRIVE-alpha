import { describe, expect, it } from 'vitest';
import {
  buildBookingsOverviewCard,
  buildDamagesOverviewCard,
  buildDocumentsOverviewCard,
  buildOverviewCards,
  buildTasksOverviewCard,
  buildTripsOverviewCard,
} from './vehicle-overview-cards.utils';
import {
  OVERVIEW_QUICK_CARD_TABS,
  VEHICLE_DETAIL_TAB_KEYS,
} from './vehicle-overview-navigation';
import { buildVehicleOverviewSummary } from './vehicle-overview-summary.utils';

const FORBIDDEN_DISPLAY = /\b(undefined|null|NaN|N\/A)\b/i;

function assertCleanCopy(value: string) {
  expect(value.trim().length).toBeGreaterThan(0);
  expect(FORBIDDEN_DISPLAY.test(value)).toBe(false);
}

describe('vehicle overview regression', () => {
  it('maps quick cards to existing vehicle detail tab keys', () => {
    const tabSet = new Set<string>(VEHICLE_DETAIL_TAB_KEYS);
    for (const tab of Object.values(OVERVIEW_QUICK_CARD_TABS)) {
      expect(tabSet.has(tab)).toBe(true);
    }
    expect(OVERVIEW_QUICK_CARD_TABS.trips).toBe('trips');
    expect(OVERVIEW_QUICK_CARD_TABS.bookings).toBe('vehicle-bookings');
    expect(OVERVIEW_QUICK_CARD_TABS.tasks).toBe('vehicle-tasks');
    expect(OVERVIEW_QUICK_CARD_TABS.damages).toBe('damages');
    expect(OVERVIEW_QUICK_CARD_TABS.documents).toBe('documents');
  });

  it('card builders match their navigation target tabs', () => {
    const cards = buildOverviewCards({
      todayTrips: [],
      tripStats: null,
      bookings: [],
      tasks: [],
      damageStats: null,
      fileSummary: null,
    });
    for (const key of Object.keys(OVERVIEW_QUICK_CARD_TABS) as Array<
      keyof typeof OVERVIEW_QUICK_CARD_TABS
    >) {
      expect(cards[key].targetTab).toBe(OVERVIEW_QUICK_CARD_TABS[key]);
    }
  });

  it('renders stable empty-state copy without forbidden tokens', () => {
    const cards = [
      buildTripsOverviewCard({ todayTrips: [], tripStats: null }),
      buildBookingsOverviewCard({ bookings: [] }),
      buildTasksOverviewCard({ tasks: [], rawTasks: [] }),
      buildDamagesOverviewCard({ stats: { open: 0, blockingRental: 0, safetyCritical: 0 } as never }),
      buildDocumentsOverviewCard({ summary: null, error: true }),
    ];

    for (const card of cards) {
      assertCleanCopy(card.headline);
      if (card.subline) assertCleanCopy(card.subline);
    }
  });

  it('readiness strip copy stays clean for blocked and ready summaries', () => {
    const blocked = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Critical',
      rentalBlocked: true,
      blockingReasons: ['TÜV overdue'],
      bookings: [],
      tasks: [],
      damageStats: { open: 1, blockingRental: 1, safetyCritical: 0 } as never,
      fileSummary: null,
      todayTrips: [],
      tripStats: null,
    });

    const ready = buildVehicleOverviewSummary({
      vehicle: null,
      effectiveStatus: 'Good Health',
      bookings: [],
      tasks: [],
      damageStats: { open: 0, blockingRental: 0, safetyCritical: 0 } as never,
      fileSummary: {
        documentCategories: [],
        mandatoryDocumentCoverage: { configured: 2, total: 2 },
        pendingReviews: { count: 0, items: [] },
      } as never,
      todayTrips: [],
      tripStats: { totalTrips: 0, totalDistanceKm: 0, stressLevel: null } as never,
    });

    assertCleanCopy(blocked.readiness.title);
    assertCleanCopy(blocked.readiness.subtitle);
    assertCleanCopy(ready.readiness.title);
    assertCleanCopy(ready.readiness.subtitle);
    expect(blocked.readiness.readinessStatus).toBe('blocked');
    expect(ready.readiness.readinessStatus).toBe('ready');
    expect(blocked.readiness.blockers.length).toBeLessThanOrEqual(3);
  });
});
