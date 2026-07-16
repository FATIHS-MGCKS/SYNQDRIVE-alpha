import { HealthSummaryService, type HealthSummaryAgentInput } from './health-summary.service';

describe('HealthSummaryService.generateSummary — legacy score isolation', () => {
  const service = new HealthSummaryService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const baseInput: HealthSummaryAgentInput = {
    vehicleContext: {
      vehicleId: 'v1',
      orgId: 'o1',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      vin: 'VIN123',
    },
    healthModules: {
      battery: { hasData: false, status: 'unknown', sohPercent: null, voltageV: null },
      errorCodes: { hasData: false, activeCount: 0, totalRecent: 0, lastCheckedAt: null },
      brakes: { hasData: false, stateClass: null, overallCondition: null, hasBaseline: false, remainingKm: null, confidenceLabel: null, hasAlert: false, openAlertCount: 0 },
      tires: { hasData: false, treadPercentEstimate: null, status: 'UNKNOWN', displayTreadMm: null, displayMode: 'UNKNOWN', lowestTreadPosition: null, confidence: 'UNKNOWN', hasSetups: false, hasMeasurements: false },
      serviceInfo: { hasData: false, lastServiceAt: null, lastOdometerKm: null, eventCount: 0, trackingStatus: null, remainingDays: null, remainingKm: null, overdue: false, overdueDays: null, overdueKm: null, dueImminently: false, severity: null, message: null },
      oilChange: { hasData: false, lastChangedAt: null, eventCount: 0 },
    },
    behaviorAndUsage: {
      drivingStressScore: null,
      drivingScore: 90,
      drivingEventsCount: 0,
      abuseDetectionCount: 0,
      accelerationBehavior: null,
      brakingBehavior: null,
      tripPattern: null,
      roadDistribution: null,
    },
    futureInputs: { driverFeedbackSummary: null },
    dataQuality: { available: [], missing: ['trips'] },
  };

  it('does not treat legacy drivingScore mirror as vehicle stress signal', () => {
    const summary = service.generateSummary(baseInput);
    expect(
      summary.watchpoints.some((w) => w.toLowerCase().includes('vehicle stress')),
    ).toBe(false);
    expect(
      summary.positives.some((p) => p.toLowerCase().includes('low vehicle stress')),
    ).toBe(false);
  });

  it('uses canonical drivingStressScore for stress watchpoints', () => {
    const summary = service.generateSummary({
      ...baseInput,
      behaviorAndUsage: {
        ...baseInput.behaviorAndUsage,
        drivingStressScore: 80,
        drivingScore: 20,
      },
    });
    expect(
      summary.watchpoints.some((w) => w.toLowerCase().includes('critical vehicle stress')),
    ).toBe(true);
  });
});
