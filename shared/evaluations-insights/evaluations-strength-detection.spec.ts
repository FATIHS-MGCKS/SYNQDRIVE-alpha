import {
  buildStrengthDetectionSnapshot,
  detectOrganizationalStrengths,
  strengthDetectionSectionStatus,
} from './evaluations-strength-detection';
import {
  DEFAULT_STRENGTH_ORG_TARGETS,
  EVALUATIONS_STRENGTH_DETECTION_VERSION,
  type EvaluationsStrengthDetectionSnapshot,
} from './evaluations-strength-detection.contract';

const period = {
  key: 'mtd',
  label: 'Month to date',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-16T12:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const comparisonPeriod = {
  key: 'mtd',
  label: 'Previous mtd',
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-05-31T23:59:59.999Z',
  timezone: 'Europe/Berlin',
};

function baseSnapshot(
  overrides: Partial<EvaluationsStrengthDetectionSnapshot> = {},
): EvaluationsStrengthDetectionSnapshot {
  return {
    period,
    comparisonPeriod,
    currency: 'EUR',
    financial: {
      revenueCurrentMinor: 200_000,
      revenuePreviousMinor: 150_000,
      paidRevenueCurrentMinor: 180_000,
      openReceivablesMinor: 20_000,
      overdueReceivablesMinor: 500,
      openReceivablesCount: 5,
    },
    bookings: {
      completedInPeriod: 45,
      cancelledInPeriod: 2,
      noShowInPeriod: 1,
    },
    fleet: {
      total: 12,
      available: 10,
      readyPercent: 83.3,
      underutilized: 1,
    },
    utilization: {
      available: true,
      timeWeightedUtilizationPercent: 75,
      operationalSnapshotUtilizationPercent: 72,
      vehiclesWithData: 10,
      vehicleCount: 12,
      unplannedDowntimeMs: 50_000,
      fleetCapacityMs: 2_000_000,
      avgTurnaroundMs: 12 * 60 * 60 * 1000,
      turnaroundCount: 8,
      stationBreakdown: [
        { stationId: 'st-1', stationName: 'Berlin', utilizationPercent: 88, vehicleCount: 5 },
        { stationId: 'st-2', stationName: 'Munich', utilizationPercent: 62, vehicleCount: 4 },
      ],
      classBreakdown: [
        { vehicleClassId: 'cls-1', vehicleClassName: 'Compact', utilizationPercent: 85, vehicleCount: 6 },
        { vehicleClassId: 'cls-2', vehicleClassName: 'Van', utilizationPercent: 60, vehicleCount: 4 },
      ],
    },
    costs: {
      available: true,
      recordedDamageCostsMinor: 4_000,
      revenueCurrentMinor: 200_000,
    },
    dataQuality: {
      overallStatus: 'OK',
      invoiceDataComplete: true,
      fleetDataComplete: true,
      insightsStale: false,
      partialSectionCount: 0,
      unavailableSectionCount: 0,
      hasOverlappingBookings: false,
    },
    ...overrides,
  };
}

describe('evaluations-strength-detection (shared)', () => {
  it('detects multiple traceable strengths with required metadata fields', () => {
    const summary = detectOrganizationalStrengths(baseSnapshot());

    expect(summary.calculationVersion).toBe(EVALUATIONS_STRENGTH_DETECTION_VERSION);
    expect(summary.rulesEvaluated).toBe(12);
    expect(summary.strengths.length).toBeGreaterThan(5);

    for (const strength of summary.strengths) {
      expect(strength.id).toBeTruthy();
      expect(strength.title).toBeTruthy();
      expect(strength.description).toBeTruthy();
      expect(strength.underlyingKpi).toBeTruthy();
      expect(strength.comparisonBasis).toBeTruthy();
      expect(strength.threshold).toBeTruthy();
      expect(strength.period.from).toBe(period.from);
      expect(strength.affectedDimension).toBeTruthy();
      expect(strength.confidence).toBeTruthy();
      expect(strength.dataCoverage).toBeTruthy();
      expect(strength.rationale).toBeTruthy();
    }

    expect(summary.strengths.some((s) => s.id === 'REVENUE_GROWTH')).toBe(true);
    expect(summary.strengths.some((s) => s.id === 'HIGH_UTILIZATION')).toBe(true);
    expect(summary.strengths.some((s) => s.id === 'STRONG_STATION')).toBe(true);
    expect(summary.highlights.length).toBeGreaterThan(0);
  });

  it('suppresses all strengths when overlapping bookings indicate data errors', () => {
    const summary = detectOrganizationalStrengths(
      baseSnapshot({
        dataQuality: {
          ...baseSnapshot().dataQuality,
          hasOverlappingBookings: true,
        },
      }),
    );

    expect(summary.strengths).toHaveLength(0);
    expect(summary.rulesSuppressed).toHaveLength(12);
    expect(summary.rulesSuppressed[0]?.reason).toContain('Overlapping');
  });

  it('suppresses utilization strength when fleet is below minimum vehicle count', () => {
    const summary = detectOrganizationalStrengths(
      baseSnapshot({
        utilization: {
          ...baseSnapshot().utilization,
          vehicleCount: 2,
          vehiclesWithData: 2,
        },
      }),
    );

    expect(summary.strengths.some((s) => s.id === 'HIGH_UTILIZATION')).toBe(false);
    expect(
      summary.rulesSuppressed.some(
        (r) => r.ruleId === 'HIGH_UTILIZATION' && r.reason.includes('Minimum 3 vehicles'),
      ),
    ).toBe(true);
  });

  it('suppresses cancellation strength when booking outcomes are insufficient', () => {
    const summary = detectOrganizationalStrengths(
      baseSnapshot({
        bookings: { completedInPeriod: 5, cancelledInPeriod: 0, noShowInPeriod: 1 },
      }),
    );

    expect(summary.strengths.some((s) => s.id === 'LOW_CANCELLATION_RATE')).toBe(false);
    expect(
      summary.rulesSuppressed.some((r) => r.ruleId === 'LOW_CANCELLATION_RATE'),
    ).toBe(true);
  });

  it('deduplicates strengths by id and dimension key', () => {
    const snapshot = baseSnapshot();
    const summary = detectOrganizationalStrengths(snapshot);
    const keys = summary.strengths.map((s) => `${s.id}:${s.dimensionKey ?? 'org'}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('compares station performance against org average without external benchmarks', () => {
    const summary = detectOrganizationalStrengths(baseSnapshot(), {
      ...DEFAULT_STRENGTH_ORG_TARGETS,
      peerOutperformancePercentPoints: 10,
    });

    const berlin = summary.strengths.find(
      (s) => s.id === 'STRONG_STATION' && s.dimensionKey === 'st-1',
    );
    expect(berlin?.comparisonBasis).toBe('PEER_STATIONS');
    expect(berlin?.quantitativeImprovement?.value).toBeGreaterThanOrEqual(10);
  });

  it('strengthDetectionSectionStatus returns UNAVAILABLE when all rules suppressed', () => {
    const summary = detectOrganizationalStrengths(
      baseSnapshot({
        dataQuality: {
          overallStatus: 'ERROR',
          invoiceDataComplete: false,
          fleetDataComplete: false,
          insightsStale: true,
          partialSectionCount: 2,
          unavailableSectionCount: 1,
          hasOverlappingBookings: false,
        },
      }),
    );
    expect(strengthDetectionSectionStatus(summary)).toBe('UNAVAILABLE');
  });

  it('buildStrengthDetectionSnapshot maps utilization model metrics', () => {
    const snapshot = buildStrengthDetectionSnapshot({
      period,
      comparisonPeriod,
      currency: 'EUR',
      financial: {
        revenueCurrentMinor: 100_000,
        revenuePreviousMinor: 80_000,
        paidRevenueCurrentMinor: 90_000,
        openReceivablesMinor: 5_000,
        overdueReceivablesMinor: 0,
        openReceivablesCount: 2,
      },
      bookings: { completedInPeriod: 20, cancelledInPeriod: 1, noShowInPeriod: 0 },
      fleet: { total: 8, available: 6, readyPercent: 75, underutilized: 1 },
      utilizationModel: {
        calculationVersion: 'utilization-model-v1',
        period,
        totals: {
          periodMs: 1_000_000,
          fleetCapacityMs: 1_000_000,
          rentedMs: 680_000,
          availableMs: 310_000,
          maintenanceMs: 0,
          blockedMs: 0,
          unplannedDowntimeMs: 10_000,
          turnaroundMs: 50_000,
          standstillMs: 0,
          bookedNotRealizedMs: 0,
          availableNotRentableCount: 0,
          capacityBottleneckStations: 0,
          overlappingBookingCount: 0,
          telemetryOfflineCount: 0,
        },
        operationalSnapshot: {
          activeRented: 4,
          reserved: 1,
          available: 3,
          maintenance: 0,
          blocked: 0,
          unknown: 0,
          operationalUtilizationPercent: 55,
        },
        metrics: [
          {
            key: 'UTILIZATION_PER_VEHICLE',
            label: 'Utilization',
            formula: 'rented / capacity',
            dataSources: ['bookings'],
            coverage: {
              numeratorMs: 680_000,
              denominatorMs: 1_000_000,
              vehicleCount: 8,
              vehiclesWithData: 7,
              percent: 87.5,
            },
            period,
            status: 'OK',
            calculationVersion: 'utilization-model-v1',
            valueMs: null,
            valuePercent: 68,
            unit: 'percent',
          },
          {
            key: 'UTILIZATION_BY_STATION',
            label: 'By station',
            formula: 'rented / capacity',
            dataSources: ['bookings'],
            coverage: {
              numeratorMs: 0,
              denominatorMs: 0,
              vehicleCount: 8,
              vehiclesWithData: 7,
              percent: null,
            },
            period,
            status: 'OK',
            calculationVersion: 'utilization-model-v1',
            valueMs: null,
            valuePercent: null,
            unit: 'percent',
            breakdown: [
              {
                dimension: 'STATION',
                key: 'st-1',
                label: 'Berlin',
                rentedMs: 400_000,
                capacityMs: 500_000,
                utilizationPercent: 80,
                vehicleCount: 4,
              },
            ],
          },
        ],
        drillDowns: [],
        dataGaps: [],
      },
      costModel: {
        calculationVersion: 'cost-model-v1',
        currency: 'EUR',
        period,
        totals: {
          actualExpensesMinor: 10_000,
          estimatedFixedCostsMinor: 0,
          recordedDamageCostsMinor: 2_000,
          recordedMaintenanceCostsMinor: 0,
          invoiceExpenseCount: 1,
          invoicesWithVehicleLinkCount: 1,
        },
        denominators: {
          vehicleCount: 8,
          completedBookings: 20,
          totalKmDriven: 1000,
          bookingsWithKm: 18,
          totalRentalDays: 10,
          bookingsWithRentalDays: 19,
          cancelledBookings: 1,
          noShowBookings: 0,
        },
        metrics: [],
        dataGaps: [],
      },
      dataQuality: {
        overallStatus: 'OK',
        invoiceDataComplete: true,
        fleetDataComplete: true,
        insightsStale: false,
        partialSectionCount: 0,
        unavailableSectionCount: 0,
        hasOverlappingBookings: false,
      },
      vehiclesWithUtilizationData: 7,
      turnaroundCount: 5,
      overlappingBookingCount: 0,
    });

    expect(snapshot.utilization.timeWeightedUtilizationPercent).toBe(68);
    expect(snapshot.utilization.stationBreakdown[0]?.stationName).toBe('Berlin');
    expect(snapshot.costs.recordedDamageCostsMinor).toBe(2_000);
  });
});
