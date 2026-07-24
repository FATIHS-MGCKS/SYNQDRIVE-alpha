import { describe, expect, it } from 'vitest';
import { isControlledPublicHoliday } from './evaluations-feature-calendar';
import {
  buildHistoricalDemandContext,
  extractPredictiveFeatures,
} from './evaluations-feature-extraction';
import { listRegistryFeatureKeys, PREDICTIVE_FEATURE_REGISTRY } from './evaluations-feature-registry';
import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';
import {
  listObservationDates,
  resolveObservationWindow,
  zonedDateOnly,
} from './evaluations-feature-time';

const TZ_BERLIN = 'Europe/Berlin';
const TZ_NYC = 'America/New_York';

function baseInput(overrides: Partial<Parameters<typeof extractPredictiveFeatures>[0]> = {}) {
  const observationDate = '2026-07-15';
  const window = resolveObservationWindow(observationDate, TZ_BERLIN);
  return {
    organizationId: 'org-1',
    timezone: TZ_BERLIN,
    observationDate,
    asOfUtc: window.asOfUtc,
    periodStartUtc: window.periodStartUtc,
    periodEndUtc: window.periodEndUtc,
    scope: { type: 'FLEET' as const },
    bookings: [],
    serviceCases: [],
    invoices: [],
    fleet: { vehicleCount: 2, vehicleIds: ['v1', 'v2'] },
    ...overrides,
  };
}

describe('evaluations-feature-store', () => {
  it('registry lists all required feature keys without PII', () => {
    expect(PREDICTIVE_FEATURE_REGISTRY.length).toBeGreaterThan(15);
    for (const f of PREDICTIVE_FEATURE_REGISTRY) {
      expect(f.pii).toBe(false);
      expect(f.key).not.toMatch(/customer|email|name|driver/i);
    }
    expect(listRegistryFeatureKeys()).toContain('demand.booking_starts_count');
  });

  it('excludes bookings created after asOf from lead time (no future leakage)', () => {
    const observationDate = '2026-07-15';
    const window = resolveObservationWindow(observationDate, TZ_BERLIN);
    const payload = extractPredictiveFeatures(
      baseInput({
        bookings: [
          {
            id: 'b-future',
            status: 'CONFIRMED',
            createdAt: '2026-07-16T10:00:00.000Z',
            startDate: '2026-07-15T08:00:00.000Z',
            endDate: '2026-07-16T08:00:00.000Z',
            cancelledAt: null,
            completedAt: null,
            totalPriceCents: 10_000,
            kmDriven: null,
            pickupStationId: 'st-1',
            vehicleId: 'v1',
            vehicleRentalCategoryId: null,
          },
        ],
      }),
    );
    expect(payload.lineage.recordsExcluded.futureLeakage).toBeGreaterThan(0);
    expect(payload.features['bookings.lead_time_hours_avg'].value).toBeNull();
  });

  it('produces identical output for identical sorted inputs (reproducibility)', () => {
    const booking = {
      id: 'b-1',
      status: 'COMPLETED',
      createdAt: '2026-07-10T10:00:00.000Z',
      startDate: '2026-07-15T09:00:00.000Z',
      endDate: '2026-07-16T09:00:00.000Z',
      cancelledAt: null,
      completedAt: '2026-07-15T18:00:00.000Z',
      totalPriceCents: 20_000,
      kmDriven: 120,
      pickupStationId: 'st-1',
      vehicleId: 'v1',
      vehicleRentalCategoryId: 'cls-1',
    };
    const a = extractPredictiveFeatures(baseInput({ bookings: [booking] }));
    const b = extractPredictiveFeatures(baseInput({ bookings: [{ ...booking }] }));
    expect(a.lineage.buildFingerprint).toBe(b.lineage.buildFingerprint);
    expect(a.features['revenue.booking_minor'].value).toBe(20_000);
    expect(a.featureSetVersion).toBe(FEATURE_SET_VERSION);
  });

  it('isolates organization data via separate extraction inputs', () => {
    const orgA = extractPredictiveFeatures(
      baseInput({
        organizationId: 'org-a',
        bookings: [
          {
            id: 'b-a',
            status: 'COMPLETED',
            createdAt: '2026-07-10T10:00:00.000Z',
            startDate: '2026-07-15T09:00:00.000Z',
            endDate: '2026-07-16T09:00:00.000Z',
            cancelledAt: null,
            completedAt: '2026-07-15T18:00:00.000Z',
            totalPriceCents: 5_000,
            kmDriven: 50,
            pickupStationId: 'st-1',
            vehicleId: 'v1',
            vehicleRentalCategoryId: null,
          },
        ],
      }),
    );
    const orgB = extractPredictiveFeatures(
      baseInput({
        organizationId: 'org-b',
        bookings: [],
      }),
    );
    expect(orgA.features['revenue.booking_minor'].value).toBe(5_000);
    expect(orgB.features['revenue.booking_minor'].value).toBe(0);
    expect(orgA.lineage.buildFingerprint).not.toBe(orgB.lineage.buildFingerprint);
  });

  it('marks missing utilization when fleet is empty', () => {
    const payload = extractPredictiveFeatures(
      baseInput({ fleet: { vehicleCount: 0, vehicleIds: [] } }),
    );
    expect(payload.features['utilization.percent'].value).toBeNull();
    expect(payload.dataQuality.notes).toContain('No vehicles in scope for utilization.');
  });

  it('handles delayed completions after asOf as excluded from same-day revenue', () => {
    const observationDate = '2026-07-15';
    const window = resolveObservationWindow(observationDate, TZ_BERLIN);
    const payload = extractPredictiveFeatures(
      baseInput({
        bookings: [
          {
            id: 'b-late',
            status: 'COMPLETED',
            createdAt: '2026-07-14T10:00:00.000Z',
            startDate: '2026-07-15T09:00:00.000Z',
            endDate: '2026-07-16T09:00:00.000Z',
            cancelledAt: null,
            completedAt: '2026-07-16T10:00:00.000Z',
            totalPriceCents: 30_000,
            kmDriven: 80,
            pickupStationId: 'st-1',
            vehicleId: 'v1',
            vehicleRentalCategoryId: null,
          },
        ],
      }),
    );
    expect(new Date(window.asOfUtc).getTime()).toBeLessThan(new Date('2026-07-16T10:00:00.000Z').getTime());
    expect(payload.features['revenue.booking_minor'].value).toBe(0);
  });

  it('resolves observation windows consistently across timezones', () => {
    const date = '2026-07-15';
    const berlin = resolveObservationWindow(date, TZ_BERLIN);
    const nyc = resolveObservationWindow(date, TZ_NYC);
    expect(berlin.periodStartUtc).not.toBe(nyc.periodStartUtc);
    expect(zonedDateOnly(new Date(berlin.periodStartUtc), TZ_BERLIN)).toBe(date);
    expect(zonedDateOnly(new Date(nyc.periodStartUtc), TZ_NYC)).toBe(date);
  });

  it('uses controlled holiday source only', () => {
    expect(isControlledPublicHoliday('2026-01-01')).toBe(true);
    expect(isControlledPublicHoliday('2026-07-15')).toBe(false);
    const payload = extractPredictiveFeatures(baseInput());
    expect(payload.features['calendar.is_public_holiday'].value).toBe(false);
  });

  it('filters station scope', () => {
    const payload = extractPredictiveFeatures(
      baseInput({
        scope: { type: 'STATION', stationId: 'st-berlin' },
        bookings: [
          {
            id: 'b-1',
            status: 'COMPLETED',
            createdAt: '2026-07-10T10:00:00.000Z',
            startDate: '2026-07-15T09:00:00.000Z',
            endDate: '2026-07-16T09:00:00.000Z',
            cancelledAt: null,
            completedAt: '2026-07-15T18:00:00.000Z',
            totalPriceCents: 10_000,
            kmDriven: 40,
            pickupStationId: 'st-berlin',
            vehicleId: 'v1',
            vehicleRentalCategoryId: null,
          },
          {
            id: 'b-2',
            status: 'COMPLETED',
            createdAt: '2026-07-10T10:00:00.000Z',
            startDate: '2026-07-15T09:00:00.000Z',
            endDate: '2026-07-16T09:00:00.000Z',
            cancelledAt: null,
            completedAt: '2026-07-15T18:00:00.000Z',
            totalPriceCents: 99_000,
            kmDriven: 40,
            pickupStationId: 'st-munich',
            vehicleId: 'v2',
            vehicleRentalCategoryId: null,
          },
        ],
      }),
    );
    expect(payload.features['revenue.booking_minor'].value).toBe(10_000);
    expect(payload.features['scope.station_id'].value).toBe('st-berlin');
  });

  it('builds historical demand from prior days only', () => {
    const dates = listObservationDates('2026-07-10', '2026-07-15', TZ_BERLIN);
    const asOfByDate = new Map(dates.map((d) => [d, resolveObservationWindow(d, TZ_BERLIN).asOfUtc]));
    const bookings = dates.flatMap((d, i) => [
      {
        id: `b-${d}`,
        status: 'CONFIRMED',
        createdAt: `${d}T08:00:00.000Z`,
        startDate: `${d}T12:00:00.000Z`,
        endDate: `${d}T20:00:00.000Z`,
        cancelledAt: null,
        completedAt: null,
        totalPriceCents: null,
        kmDriven: null,
        pickupStationId: 'st-1',
        vehicleId: 'v1',
        vehicleRentalCategoryId: null,
      },
    ]);
    const hist = buildHistoricalDemandContext(bookings, dates, TZ_BERLIN, asOfByDate);
    const payload = extractPredictiveFeatures(
      baseInput({ observationDate: '2026-07-15' }),
      hist,
    );
    expect(payload.features['demand.historical_7d_avg'].value).not.toBeNull();
  });
});
