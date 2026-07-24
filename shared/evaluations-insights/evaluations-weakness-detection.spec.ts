import {
  buildWeaknessDetectionSnapshot,
  detectOrganizationalWeaknesses,
  weaknessDetectionSectionStatus,
} from './evaluations-weakness-detection';
import {
  DEFAULT_WEAKNESS_ORG_TARGETS,
  EVALUATIONS_WEAKNESS_DETECTION_VERSION,
  type EvaluationsWeaknessDetectionSnapshot,
} from './evaluations-weakness-detection.contract';

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
  overrides: Partial<EvaluationsWeaknessDetectionSnapshot> = {},
): EvaluationsWeaknessDetectionSnapshot {
  return {
    period,
    comparisonPeriod,
    currency: 'EUR',
    financial: {
      revenueCurrentMinor: 120_000,
      revenuePreviousMinor: 160_000,
      expensesCurrentMinor: 110_000,
      expensesPreviousMinor: 90_000,
      paidRevenueCurrentMinor: 100_000,
      openReceivablesMinor: 30_000,
      overdueReceivablesMinor: 8_000,
      openReceivablesCount: 6,
      overdueReceivablesCount: 3,
    },
    bookings: {
      completedInPeriod: 40,
      cancelledInPeriod: 8,
      noShowInPeriod: 4,
    },
    fleet: {
      total: 12,
      available: 8,
      maintenance: 2,
      blocked: 1,
      readyPercent: 66,
      underutilized: 5,
    },
    utilization: {
      available: true,
      timeWeightedUtilizationPercent: 32,
      operationalSnapshotUtilizationPercent: 35,
      vehiclesWithData: 10,
      vehicleCount: 12,
      unplannedDowntimeMs: 200_000,
      fleetCapacityMs: 2_000_000,
      avgTurnaroundMs: 60 * MS_HOUR,
      turnaroundCount: 10,
      stationBottlenecks: [
        {
          stationId: 'st-1',
          stationName: 'Berlin',
          totalVehicles: 6,
          availableVehicles: 0,
        },
      ],
      vehiclesWithHighDowntime: [
        {
          vehicleId: 'v1',
          label: 'AB-1',
          unplannedDowntimeMs: 300_000,
          capacityMs: 1_000_000,
          downtimeSharePercent: 30,
        },
        {
          vehicleId: 'v2',
          label: 'AB-2',
          unplannedDowntimeMs: 250_000,
          capacityMs: 1_000_000,
          downtimeSharePercent: 25,
        },
      ],
      weakStations: [],
    },
    costs: {
      available: true,
      recordedDamageCostsMinor: 12_000,
      actualExpensesMinor: 110_000,
      revenueCurrentMinor: 120_000,
    },
    insights: {
      businessRiskGroups: 5,
      revenueLeakageGroups: 2,
      criticalInsights: 2,
      criticalBookings: 1,
      complianceInsightGroups: 3,
      estimatedExposureMinor: 15_000,
      exposureCurrency: 'EUR',
      affectedVehicles: 4,
      affectedStations: 2,
      affectedBookings: 1,
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

const MS_HOUR = 60 * 60 * 1000;

describe('evaluations-weakness-detection (shared)', () => {
  it('detects weaknesses with required metadata and prioritizes by severity', () => {
    const summary = detectOrganizationalWeaknesses(baseSnapshot());

    expect(summary.calculationVersion).toBe(EVALUATIONS_WEAKNESS_DETECTION_VERSION);
    expect(summary.weaknesses.length).toBeGreaterThan(5);

    for (const weakness of summary.weaknesses) {
      expect(weakness.id).toBeTruthy();
      expect(weakness.category).toBeTruthy();
      expect(weakness.severity).toBeTruthy();
      expect(weakness.underlyingKpis.length).toBeGreaterThan(0);
      expect(weakness.quantitativeDeviation.kind).toBeTruthy();
      expect(weakness.comparisonBasis).toBeTruthy();
      expect(weakness.affectedEntities).toBeTruthy();
      expect(weakness.confidence).toBeTruthy();
      expect(weakness.recommendedNextAnalysis).toBeTruthy();
    }

    const ids = summary.weaknesses.map((w) => w.id);
    expect(ids).toContain('UNDERUTILIZATION');
    expect(ids).toContain('DECLINING_REVENUE');
    expect(ids).toContain('COMPLIANCE_RISKS');

    const severities = summary.weaknesses.map((w) => w.severity);
    const firstCritical = severities.indexOf('CRITICAL');
    const lastInfo = severities.lastIndexOf('INFO');
    if (firstCritical >= 0 && lastInfo >= 0) {
      expect(firstCritical).toBeLessThan(lastInfo);
    }
  });

  it('suppresses business weaknesses when overlapping bookings indicate data errors', () => {
    const summary = detectOrganizationalWeaknesses(
      baseSnapshot({
        dataQuality: {
          ...baseSnapshot().dataQuality,
          hasOverlappingBookings: true,
        },
      }),
    );

    expect(summary.weaknesses.some((w) => w.id === 'DECLINING_REVENUE')).toBe(false);
    expect(summary.weaknesses.some((w) => w.id === 'POOR_DATA_QUALITY')).toBe(true);
    expect(
      summary.rulesSuppressed.some((r) => r.ruleId === 'DECLINING_REVENUE'),
    ).toBe(true);
  });

  it('does not emit declining revenue when comparison baseline is missing', () => {
    const summary = detectOrganizationalWeaknesses(
      baseSnapshot({
        financial: {
          ...baseSnapshot().financial,
          revenuePreviousMinor: 0,
        },
      }),
    );

    expect(summary.weaknesses.some((w) => w.id === 'DECLINING_REVENUE')).toBe(false);
  });

  it('deduplicates booking-loss group keeping higher severity', () => {
    const summary = detectOrganizationalWeaknesses(baseSnapshot(), {
      ...DEFAULT_WEAKNESS_ORG_TARGETS,
      maxCancellationRatePercent: 5,
      maxNoShowRatePercent: 5,
    });

    const bookingLoss = summary.weaknesses.filter(
      (w) => w.id === 'HIGH_CANCELLATION_RATE' || w.id === 'HIGH_NO_SHOW_RATE',
    );
    expect(bookingLoss.length).toBeLessThanOrEqual(1);
  });

  it('labels financial impact kinds distinctly', () => {
    const summary = detectOrganizationalWeaknesses(baseSnapshot());
    const declining = summary.weaknesses.find((w) => w.id === 'DECLINING_REVENUE');
    expect(declining?.financialImpact?.kind).toBe('OBSERVATION');
    expect(declining?.financialImpact?.amountMinor).toBeGreaterThan(0);

    const underutil = summary.weaknesses.find((w) => w.id === 'UNDERUTILIZATION');
    expect(underutil?.financialImpact?.kind).toBe('ESTIMATE');
  });

  it('weaknessDetectionSectionStatus returns PARTIAL when critical weaknesses exist', () => {
    const summary = detectOrganizationalWeaknesses(baseSnapshot());
    expect(weaknessDetectionSectionStatus(summary)).toBe('PARTIAL');
  });

  it('buildWeaknessDetectionSnapshot maps utilization snapshot bottlenecks', () => {
    const snapshot = buildWeaknessDetectionSnapshot({
      period,
      comparisonPeriod,
      currency: 'EUR',
      financial: baseSnapshot().financial,
      bookings: baseSnapshot().bookings,
      fleet: baseSnapshot().fleet,
      utilizationModel: null,
      utilizationSnapshot: {
        periodFromMs: 0,
        periodToMs: 1,
        vehicles: [
          {
            vehicleId: 'v1',
            label: 'AB-1',
            homeStationId: 'st-1',
            homeStationName: 'Berlin',
            vehicleClassId: null,
            vehicleClassName: null,
            prismaStatus: 'AVAILABLE',
            cleaningStatus: 'CLEAN',
            rentalBlocked: false,
            telemetryOffline: false,
            operationalToken: 'AVAILABLE',
            capacityMs: 1_000_000,
            rentedMs: 0,
            maintenanceMs: 0,
            blockedMs: 0,
            unplannedDowntimeMs: 200_000,
            bookedNotRealizedMs: 0,
            standstillMs: 800_000,
            turnaroundMs: 0,
            turnaroundCount: 0,
          },
        ],
        overlappingBookingIds: [],
        stationBottlenecks: [
          {
            stationId: 'st-1',
            stationName: 'Berlin',
            totalVehicles: 4,
            bookedVehicles: 4,
            availableVehicles: 0,
          },
        ],
        operationalSnapshot: {
          activeRented: 0,
          reserved: 0,
          available: 1,
          maintenance: 0,
          blocked: 0,
          unknown: 0,
          operationalUtilizationPercent: 0,
        },
        maintenanceFromDowntimeWindows: 0,
        maintenanceFromSnapshotOnly: 0,
        blockedFromDowntimeWindows: 0,
        blockedFromSnapshotOnly: 0,
      },
      costModel: null,
      insights: baseSnapshot().insights,
      dataQuality: baseSnapshot().dataQuality,
      vehiclesWithUtilizationData: 1,
      turnaroundCount: 0,
      overlappingBookingCount: 0,
    });

    expect(snapshot.utilization.stationBottlenecks).toHaveLength(1);
    expect(snapshot.utilization.vehiclesWithHighDowntime.length).toBeGreaterThan(0);
  });
});
