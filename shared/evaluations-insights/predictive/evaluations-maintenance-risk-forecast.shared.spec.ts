import { describe, expect, it } from 'vitest';
import {
  isUnplannedServiceCategory,
  runAllMaintenanceRiskForecasts,
  runUnplannedFailureRiskForecast,
} from './evaluations-maintenance-risk-forecast';
import type {
  MaintenanceRiskFleetInput,
  RiskServiceCaseRow,
  RiskVehicleHealthSignal,
} from './evaluations-maintenance-risk.contract';

function vehicle(overrides: Partial<RiskVehicleHealthSignal> = {}): RiskVehicleHealthSignal {
  return {
    vehicleId: 'v1',
    vehicleClassId: 'cls-1',
    modelYear: 2020,
    odometerKm: 50_000,
    tireCondition: 'good',
    brakeCondition: 'good',
    batteryCondition: 'good',
    activeSafetyDtcCount: 0,
    serviceOverdue: true,
    telemetryDataAvailable: false,
    hasHealthSignal: true,
    ...overrides,
  };
}

function baseInput(overrides: Partial<MaintenanceRiskFleetInput> = {}): MaintenanceRiskFleetInput {
  const serviceCases: RiskServiceCaseRow[] = Array.from({ length: 15 }, (_, i) => ({
    id: `sc-${i}`,
    vehicleId: `v${(i % 5) + 1}`,
    category: i % 3 === 0 ? 'REPAIR' : 'SERVICE',
    openedAt: `2025-${String((i % 12) + 1).padStart(2, '0')}-10T10:00:00.000Z`,
    completedAt: `2025-${String((i % 12) + 1).padStart(2, '0')}-12T10:00:00.000Z`,
    actualCostCents: 20_000 + i * 1000,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: i % 4 === 0,
    isUnplanned: i % 3 === 0,
  }));

  return {
    organizationId: 'org-1',
    asOfDate: '2026-02-04',
    timezone: 'Europe/Berlin',
    horizonDays: 30,
    fleetVehicleCount: 10,
    vehicles: Array.from({ length: 10 }, (_, i) => vehicle({ vehicleId: `v${i + 1}` })),
    serviceCases,
    maintenanceCostSeries: Array.from({ length: 120 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 9, 1 + i)).toISOString().slice(0, 10),
      value: 5_000 + (i % 7) * 500,
    })),
    downtimeMinutesSeries: Array.from({ length: 90 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 10, 1 + i)).toISOString().slice(0, 10),
      value: 30 + (i % 5) * 10,
    })),
    scheduledCasesInHorizon: 2,
    scheduledDowntimeMinutesInHorizon: 480,
    healthCoveragePercent: 80,
    ...overrides,
  };
}

describe('evaluations-maintenance-risk-forecast', () => {
  it('classifies unplanned service categories', () => {
    expect(isUnplannedServiceCategory('REPAIR')).toBe(true);
    expect(isUnplannedServiceCategory('SERVICE')).toBe(false);
  });

  it('does not treat service overdue or telemetry offline as failure drivers alone', () => {
    const result = runUnplannedFailureRiskForecast(
      baseInput({
        vehicles: [
          vehicle({ serviceOverdue: true, telemetryDataAvailable: false, tireCondition: 'good' }),
          vehicle({ vehicleId: 'v2', serviceOverdue: true, telemetryDataAvailable: false }),
          vehicle({ vehicleId: 'v3' }),
          vehicle({ vehicleId: 'v4' }),
          vehicle({ vehicleId: 'v5' }),
        ],
        fleetVehicleCount: 5,
      }),
    );
    expect(result.status).toBe('AVAILABLE');
    expect(result.explainability.limitations).toContain(
      'Telemetry offline is excluded from failure signals.',
    );
    expect(result.explainability.limitations).toContain(
      'Service overdue alone does not increase failure probability.',
    );
    expect((result.probabilityEstimate ?? 0) < 0.5).toBe(true);
  });

  it('suppresses failure forecast when health coverage is insufficient', () => {
    const result = runUnplannedFailureRiskForecast(
      baseInput({ healthCoveragePercent: 30 }),
    );
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.probabilityEstimate).toBeNull();
  });

  it('outputs separate probability and impact for failure risk', () => {
    const result = runUnplannedFailureRiskForecast(baseInput());
    expect(result.probabilityEstimate).not.toBeNull();
    expect(result.impactEstimate).not.toBeNull();
    expect(result.unit).toBe('probability');
  });

  it('outputs P50 and P90 for maintenance and cost risk', () => {
    const results = runAllMaintenanceRiskForecasts(baseInput());
    const maintenance = results.find((r) => r.riskKey === 'MAINTENANCE_COST');
    const cost = results.find((r) => r.riskKey === 'COST_RISK');
    expect(maintenance?.costP50Minor).not.toBeNull();
    expect(maintenance?.costP90Minor).not.toBeNull();
    expect(cost?.costP50Minor).not.toBeNull();
    expect(cost?.costP90Minor).not.toBeNull();
    expect((cost?.costP90Minor ?? 0) >= (cost?.costP50Minor ?? 0)).toBe(true);
  });

  it('includes safety boundaries on every forecast', () => {
    for (const result of runAllMaintenanceRiskForecasts(baseInput())) {
      expect(result.safetyBoundaries.notForAutonomousSafetyDecisions).toBe(true);
      expect(result.safetyBoundaries.telemetryOfflineExcludedFromFailure).toBe(true);
      expect(result.isRiskForecast).toBe(true);
    }
  });

  it('isolates org inputs via different fleet sizes', () => {
    const small = runAllMaintenanceRiskForecasts(baseInput({ fleetVehicleCount: 3 }));
    const large = runAllMaintenanceRiskForecasts(baseInput({ fleetVehicleCount: 20 }));
    const smallCap = small.find((r) => r.riskKey === 'CAPACITY_RISK');
    const largeCap = large.find((r) => r.riskKey === 'CAPACITY_RISK');
    expect(smallCap?.pointEstimate).not.toBe(largeCap?.pointEstimate);
  });
});
