import type { NormalizedMetric } from '../vehicle-intelligence/driving-metric-normalization/driving-metric-normalization.types';
import { DRIVING_METRIC_NORMALIZATION_VERSION } from '../vehicle-intelligence/driving-metric-normalization/driving-metric-normalization.config';
import type { RentalDrivingNormalizedMetrics } from './rental-driving-analysis.metrics';
import { RENTAL_DRIVING_METRICS_VERSION } from './rental-driving-analysis.metrics.config';
import {
  buildRentalPatternHistoryEntry,
  buildRentalPatternSummary,
  resolveRentalPatternSummaries,
} from './rental-driving-analysis.pattern-summary';

function metricValue<T extends NormalizedMetric['strategy']>(
  strategy: T,
  value: number,
  reliability: 'RELIABLE' | 'LIMITED' | 'UNRELIABLE' = 'RELIABLE',
): NormalizedMetric<T> {
  return {
    strategy,
    value,
    reliability,
    reasonCodes: [],
    rawNumerator: value,
    rawDenominator: 1,
    capped: false,
    normalizationVersion: DRIVING_METRIC_NORMALIZATION_VERSION,
  };
}

function qualifiedMetrics(
  overrides: {
    conductLevel?: 'low' | 'moderate' | 'elevated' | 'high';
    harshPer100Km?: number;
    abusePer100Km?: number;
    nativeShare?: number;
    proxyShare?: number;
    assessableShare?: number;
    clusterCount?: number;
    reliability?: 'RELIABLE' | 'LIMITED' | 'UNRELIABLE';
  } = {},
): RentalDrivingNormalizedMetrics {
  const conductLevel = overrides.conductLevel ?? 'high';
  const harshPer100Km = overrides.harshPer100Km ?? 20;
  const abusePer100Km = overrides.abusePer100Km ?? 0;
  const nativeShare = overrides.nativeShare ?? 80;
  const proxyShare = overrides.proxyShare ?? 20;
  const assessableShare = overrides.assessableShare ?? 90;
  const clusterCount = overrides.clusterCount ?? 0;
  const reliability = overrides.reliability ?? 'RELIABLE';

  return {
    version: RENTAL_DRIVING_METRICS_VERSION,
    totals: {
      totalDistanceKm: 120,
      totalDurationHours: 4,
      tripCount: 3,
      assessableTripCount: 3,
    },
    drivingEvents: {
      totalCount: 40,
      per100Km: metricValue('EVENTS_PER_100KM', 33, reliability),
      perDrivingHour: metricValue('EVENTS_PER_DRIVING_HOUR', 10, reliability),
      affectedTripShare: metricValue('AFFECTED_TRIP_SHARE', 66, reliability),
    },
    harshEvents: {
      totalCount: 24,
      per100Km: metricValue('EVENTS_PER_100KM', harshPer100Km, reliability),
      perDrivingHour: metricValue('EVENTS_PER_DRIVING_HOUR', 6, reliability),
      affectedTripShare: metricValue('AFFECTED_TRIP_SHARE', 66, reliability),
    },
    abuseEvents: {
      totalCount: 0,
      per100Km: metricValue('EVENTS_PER_100KM', abusePer100Km, reliability),
      perDrivingHour: metricValue('EVENTS_PER_DRIVING_HOUR', 0, reliability),
      affectedTripShare: metricValue('AFFECTED_TRIP_SHARE', 0, reliability),
    },
    strongEventClusters: {
      clusterCount,
      clustersPerHour: metricValue('CLUSTERS_PER_TIME_WINDOW', clusterCount, reliability),
      affectedTripShare: metricValue(
        'AFFECTED_TRIP_SHARE',
        clusterCount > 0 ? 50 : 0,
        reliability,
      ),
    },
    repeatedPatterns: {
      patternTripCount: 0,
      affectedTripShare: metricValue('AFFECTED_TRIP_SHARE', 0, reliability),
      repeatedHarshBrakingTrips: 0,
      repeatedHarshAccelTrips: 0,
    },
    evidenceShares: {
      assessableDistanceShare: metricValue('DISTANCE_SHARE', assessableShare, reliability),
      nativeEvidenceShare: metricValue('DISTANCE_SHARE', nativeShare, reliability),
      proxyShare: metricValue('DISTANCE_SHARE', proxyShare, reliability),
    },
    vehicleLoad: {
      level: 'moderate',
      stressScore: 55,
      reliability,
      reasons: [],
    },
    driverConduct: {
      level: conductLevel,
      harshPer100Km,
      abusePer100Km,
      reliability,
      reasons: [],
    },
  };
}

function historyEntry(
  index: number,
  overrides: Partial<Parameters<typeof buildRentalPatternHistoryEntry>[0]> = {},
) {
  const periodEnd = new Date(`2026-06-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`);
  return buildRentalPatternHistoryEntry({
    rentalAnalysisId: `ra-${index}`,
    bookingId: `booking-${index}`,
    periodEnd,
    bookingCustomerId: 'customer-1',
    assignedDriverId: 'driver-1',
    actualDriverId: null,
    attributionType: 'BOOKING_CUSTOMER',
    analysisSource: 'booking_assignment',
    customerDecisionEligible: true,
    calculationVersion: 'rental-driving-analysis-v2',
    assessmentStatus: 'COMPLETE',
    analysisCompleteness: 'FULL',
    rentalMetrics: qualifiedMetrics(),
    overallLevel: 'high_stress',
    ...overrides,
  });
}

describe('rental-driving-analysis.pattern-summary (P64)', () => {
  it('detects repeated concerning rental pattern for booking customer', () => {
    const rentals = [
      historyEntry(1, { rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }) }),
      historyEntry(2, { rentalMetrics: qualifiedMetrics({ conductLevel: 'elevated' }) }),
      historyEntry(3, { rentalMetrics: qualifiedMetrics({ conductLevel: 'low', harshPer100Km: 2 }) }),
    ];

    const result = buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: 'customer-1',
      rentals,
    });

    expect(result.assessedRentals).toBe(3);
    expect(result.concerningRentals).toBe(2);
    expect(result.repeatedPattern).toBe(true);
    expect(result.strongSingleIncident).toBe(false);
    expect(result.recommendationEligibility).toBe('operational_recommendation');
    expect(result.automaticBlockingEnabled).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'REPEATED_CONCERNING_RENTAL_PATTERN',
        'AUTOMATIC_BLOCKING_DISABLED',
        'BOOKING_CUSTOMER_SCOPE_SEPARATE_FROM_DRIVER_CONDUCT',
      ]),
    );
  });

  it('detects strong single incident without repeated pattern', () => {
    const rentals = [
      historyEntry(1, {
        rentalMetrics: qualifiedMetrics({
          conductLevel: 'high',
          harshPer100Km: 22,
          clusterCount: 2,
        }),
      }),
      historyEntry(2, {
        rentalMetrics: qualifiedMetrics({ conductLevel: 'low', harshPer100Km: 1 }),
      }),
    ];

    const result = buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: 'customer-1',
      rentals,
    });

    expect(result.assessedRentals).toBe(2);
    expect(result.concerningRentals).toBe(1);
    expect(result.repeatedPattern).toBe(false);
    expect(result.strongSingleIncident).toBe(true);
    expect(result.recommendationEligibility).toBe('review_only');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['STRONG_SINGLE_INCIDENT', 'AUTOMATIC_BLOCKING_DISABLED']),
    );
  });

  it('does not create a pattern from proxy-only evidence', () => {
    const rentals = [
      historyEntry(1, {
        rentalMetrics: qualifiedMetrics({
          conductLevel: 'high',
          nativeShare: 10,
          proxyShare: 90,
        }),
      }),
      historyEntry(2, {
        rentalMetrics: qualifiedMetrics({
          conductLevel: 'high',
          nativeShare: 5,
          proxyShare: 95,
        }),
      }),
    ];

    const result = buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: 'customer-1',
      rentals,
    });

    expect(result.concerningRentals).toBe(0);
    expect(result.repeatedPattern).toBe(false);
    expect(result.strongSingleIncident).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['NO_QUALIFIED_EVIDENCE']));
  });

  it('does not attribute private or unclear trips', () => {
    const rentals = [
      historyEntry(1, {
        attributionType: 'PRIVATE_UNASSIGNED',
        rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }),
      }),
      historyEntry(2, {
        attributionType: 'UNKNOWN',
        rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }),
      }),
      historyEntry(3, {
        analysisSource: 'time_window_fallback',
        rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }),
      }),
    ];

    const result = buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: 'customer-1',
      rentals,
    });

    expect(result.attributionCoverage).toBe(0);
    expect(result.repeatedPattern).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['INSUFFICIENT_ATTRIBUTED_RENTALS', 'LOW_ATTRIBUTION_COVERAGE']),
    );
  });

  it('keeps booking customer and driver conduct scopes separate', () => {
    const rentals = [
      historyEntry(1, {
        bookingCustomerId: 'customer-1',
        assignedDriverId: 'driver-1',
        actualDriverId: 'driver-actual',
        attributionType: 'CONFIRMED_DRIVER',
        rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }),
      }),
      historyEntry(2, {
        bookingCustomerId: 'customer-2',
        assignedDriverId: 'driver-1',
        actualDriverId: 'driver-actual',
        attributionType: 'CONFIRMED_DRIVER',
        rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }),
      }),
    ];

    const customer = buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: 'customer-1',
      rentals,
    });
    const driver = buildRentalPatternSummary({
      scope: 'DRIVER_CONDUCT',
      subjectId: 'driver-actual',
      rentals,
    });

    expect(customer.concerningRentals).toBe(1);
    expect(driver.concerningRentals).toBe(2);
    expect(customer.reasons).toEqual(
      expect.arrayContaining(['BOOKING_CUSTOMER_SCOPE_SEPARATE_FROM_DRIVER_CONDUCT']),
    );
    expect(driver.reasons).toEqual(
      expect.arrayContaining(['DRIVER_CONDUCT_SCOPE_SEPARATE_FROM_CONTRACT_CUSTOMER']),
    );
  });

  it('resolveRentalPatternSummaries returns both scopes with blocking disabled', () => {
    const rentals = [
      historyEntry(1, { rentalMetrics: qualifiedMetrics({ conductLevel: 'high' }) }),
      historyEntry(2, { rentalMetrics: qualifiedMetrics({ conductLevel: 'elevated' }) }),
    ];

    const result = resolveRentalPatternSummaries({
      bookingCustomerId: 'customer-1',
      assignedDriverId: 'driver-1',
      actualDriverId: null,
      rentals,
    });

    expect(result.bookingCustomer.repeatedPattern).toBe(true);
    expect(result.driverConduct?.repeatedPattern).toBe(true);
    expect(result.bookingCustomer.automaticBlockingEnabled).toBe(false);
    expect(result.driverConduct?.automaticBlockingEnabled).toBe(false);
  });
});
