import {
  buildRentalTripMetricInput,
  computeRentalDrivingMetrics,
  resolveOverallLevelFromMetrics,
} from './rental-driving-analysis.metrics';

const baseTrip = {
  startTime: new Date('2026-07-01T08:00:00.000Z'),
  endTime: new Date('2026-07-01T10:00:00.000Z'),
  durationMinutes: 120,
  totalAccelerationEvents: 40,
  totalBrakingEvents: 35,
  hardBrakingEvents: 10,
  hardAccelerationEvents: 8,
  abuseEvents: 0,
  assessability: 'FULL' as const,
  nativeEventCount: 12,
  hfEventCount: 4,
  estimatedProxyShare: 0.1,
  vehicleStressScore: 42,
};

function singleTrip(distanceKm: number) {
  return [
    buildRentalTripMetricInput({
      tripId: 'trip-1',
      distanceKm,
      ...baseTrip,
    }),
  ];
}

describe('rental-driving-analysis.metrics (P62)', () => {
  it('normalizes harsh events per 100 km and driving hour', () => {
    const metrics = computeRentalDrivingMetrics(singleTrip(50));

    expect(metrics.harshEvents.totalCount).toBe(18);
    expect(metrics.harshEvents.per100Km.value).toBe(36);
    expect(metrics.harshEvents.perDrivingHour.value).toBe(9);
    expect(metrics.drivingEvents.per100Km.value).toBe(150);
  });

  it('does not penalize long rentals for the same absolute harsh event count', () => {
    const shortRental = computeRentalDrivingMetrics(singleTrip(50));
    const longRental = computeRentalDrivingMetrics(singleTrip(2000));

    expect(shortRental.harshEvents.per100Km.value).toBe(36);
    expect(longRental.harshEvents.per100Km.value).toBe(0.9);
    expect(shortRental.driverConduct.level).toBe('high');
    expect(longRental.driverConduct.level).toBe('low');
    expect(resolveOverallLevelFromMetrics(shortRental).level).not.toBe(
      resolveOverallLevelFromMetrics(longRental).level,
    );
  });

  it('computes affected trip share, clusters, and repeated patterns', () => {
    const metrics = computeRentalDrivingMetrics([
      buildRentalTripMetricInput({
        tripId: 'trip-a',
        distanceKm: 30,
        ...baseTrip,
        hardBrakingEvents: 6,
        hardAccelerationEvents: 4,
      }),
      buildRentalTripMetricInput({
        tripId: 'trip-b',
        distanceKm: 25,
        startTime: new Date('2026-07-02T08:00:00.000Z'),
        endTime: new Date('2026-07-02T09:30:00.000Z'),
        durationMinutes: 90,
        totalAccelerationEvents: 10,
        totalBrakingEvents: 8,
        hardBrakingEvents: 3,
        hardAccelerationEvents: 1,
        abuseEvents: 1,
        assessability: 'FULL',
        nativeEventCount: 2,
        hfEventCount: 0,
        estimatedProxyShare: 0.6,
        vehicleStressScore: 55,
      }),
      buildRentalTripMetricInput({
        tripId: 'trip-c',
        distanceKm: 20,
        startTime: new Date('2026-07-03T08:00:00.000Z'),
        endTime: new Date('2026-07-03T08:45:00.000Z'),
        durationMinutes: 45,
        totalAccelerationEvents: 4,
        totalBrakingEvents: 3,
        hardBrakingEvents: 0,
        hardAccelerationEvents: 0,
        abuseEvents: 0,
        assessability: 'NOT_ASSESSABLE',
        nativeEventCount: 0,
        hfEventCount: 0,
        estimatedProxyShare: 0,
        vehicleStressScore: null,
      }),
    ]);

    expect(metrics.totals.totalDistanceKm).toBe(75);
    expect(metrics.harshEvents.affectedTripShare.value).toBeCloseTo(66.67, 1);
    expect(metrics.strongEventClusters.clusterCount).toBeGreaterThanOrEqual(1);
    expect(metrics.repeatedPatterns.repeatedHarshBrakingTrips).toBe(2);
    expect(metrics.evidenceShares.assessableDistanceShare.value).toBeCloseTo(73.33, 1);
    expect(metrics.evidenceShares.nativeEvidenceShare.value).toBeCloseTo(73.33, 1);
    expect(metrics.evidenceShares.proxyShare.value).toBeCloseTo(33.33, 1);
  });

  it('separates vehicle load from driver conduct', () => {
    const metrics = computeRentalDrivingMetrics([
      buildRentalTripMetricInput({
        tripId: 'trip-load',
        distanceKm: 200,
        ...baseTrip,
        hardBrakingEvents: 2,
        hardAccelerationEvents: 1,
        vehicleStressScore: 78,
      }),
    ]);

    expect(metrics.vehicleLoad.level).toBe('high');
    expect(metrics.driverConduct.level).toBe('low');
  });

  it('marks short rentals as LIMITED reliability', () => {
    const metrics = computeRentalDrivingMetrics(singleTrip(35));

    expect(metrics.vehicleLoad.reliability).toBe('LIMITED');
    expect(metrics.vehicleLoad.reasons).toContain('SHORT_RENTAL_DISTANCE');
    expect(metrics.driverConduct.reliability).toBe('LIMITED');
  });

  it('caps extreme per-100km rates', () => {
    const metrics = computeRentalDrivingMetrics([
      buildRentalTripMetricInput({
        tripId: 'trip-spike',
        distanceKm: 50,
        ...baseTrip,
        totalAccelerationEvents: 500,
        totalBrakingEvents: 500,
        hardBrakingEvents: 80,
        hardAccelerationEvents: 70,
      }),
    ]);

    expect(metrics.drivingEvents.per100Km.capped).toBe(true);
    expect(metrics.drivingEvents.per100Km.value).toBe(150);
    expect(metrics.harshEvents.per100Km.capped).toBe(true);
  });
});
