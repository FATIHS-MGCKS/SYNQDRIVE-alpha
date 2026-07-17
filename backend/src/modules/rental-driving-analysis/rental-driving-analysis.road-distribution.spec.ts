import {
  aggregateRentalRoadDistribution,
  hasBurdenableRouteShares,
} from './rental-driving-analysis.road-distribution';

describe('rental-driving-analysis.road-distribution (P63)', () => {
  it('weights road shares by trip distance — 2 km must not dominate 500 km', () => {
    const result = aggregateRentalRoadDistribution([
      {
        tripId: 'short',
        distanceKm: 2,
        citySharePercent: 90,
        highwaySharePercent: 5,
        countrySharePercent: 5,
      },
      {
        tripId: 'long',
        distanceKm: 500,
        citySharePercent: 20,
        highwaySharePercent: 50,
        countrySharePercent: 30,
      },
    ]);

    expect(result.cityPercent).toBe(20);
    expect(result.highwayPercent).toBe(50);
    expect(result.countryRoadPercent).toBe(30);
    expect(result.routeCoverage.coveragePercent).toBe(100);
    expect(result.cityPercent! + result.highwayPercent! + result.countryRoadPercent!).toBe(100);
  });

  it('excludes trips without burdenable route from weighting and reports coverage', () => {
    const result = aggregateRentalRoadDistribution([
      {
        tripId: 'with-route',
        distanceKm: 100,
        citySharePercent: 40,
        highwaySharePercent: 35,
        countrySharePercent: 25,
      },
      {
        tripId: 'no-route',
        distanceKm: 400,
        citySharePercent: null,
        highwaySharePercent: null,
        countrySharePercent: null,
      },
    ]);

    expect(result.cityPercent).toBe(40);
    expect(result.highwayPercent).toBe(35);
    expect(result.countryRoadPercent).toBe(25);
    expect(result.routeCoverage.coveragePercent).toBe(20);
    expect(result.routeCoverage.burdenableTripCount).toBe(1);
    expect(result.routeCoverage.totalTripCount).toBe(2);
  });

  it('rejects sub-minimum distance trips even when shares exist', () => {
    expect(
      hasBurdenableRouteShares({
        tripId: 'tiny',
        distanceKm: 1.5,
        citySharePercent: 100,
        highwaySharePercent: 0,
        countrySharePercent: 0,
      }),
    ).toBe(false);

    const result = aggregateRentalRoadDistribution([
      {
        tripId: 'tiny',
        distanceKm: 1.5,
        citySharePercent: 100,
        highwaySharePercent: 0,
        countrySharePercent: 0,
      },
      {
        tripId: 'valid',
        distanceKm: 80,
        citySharePercent: 60,
        highwaySharePercent: 20,
        countrySharePercent: 20,
      },
    ]);

    expect(result.cityPercent).toBe(60);
    expect(result.routeCoverage.burdenableDistanceKm).toBe(80);
  });

  it('normalizes implausible share totals to 100 percent', () => {
    const result = aggregateRentalRoadDistribution([
      {
        tripId: 'skewed',
        distanceKm: 120,
        citySharePercent: 50,
        highwaySharePercent: 40,
        countrySharePercent: 30,
      },
    ]);

    expect(result.cityPercent! + result.highwayPercent! + result.countryRoadPercent!).toBe(100);
    expect(result.cityPercent).toBe(42);
    expect(result.highwayPercent).toBe(33);
    expect(result.countryRoadPercent).toBe(25);
  });

  it('infers country share when only city and highway are present', () => {
    const result = aggregateRentalRoadDistribution([
      {
        tripId: 'partial-country',
        distanceKm: 60,
        citySharePercent: 30,
        highwaySharePercent: 50,
        countrySharePercent: null,
      },
    ]);

    expect(result.countryRoadPercent).toBe(20);
    expect(result.cityPercent! + result.highwayPercent! + result.countryRoadPercent!).toBe(100);
  });
});
