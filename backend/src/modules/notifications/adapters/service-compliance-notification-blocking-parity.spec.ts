import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import {
  evaluateServiceComplianceRentalBlocking,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance-rental-blocking.policy';
import type { ServiceComplianceEvaluation } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import {
  projectServiceComplianceOverdueNotifications,
} from './service-compliance-notification.projector';

const VEH = 'veh-parity';
const baseVehicle = {
  id: VEH,
  make: 'VW',
  model: 'Golf',
  licensePlate: 'WOB P 1001',
  homeStationId: 'st-1',
  mileageKm: 50000,
  lastServiceDate: new Date('2025-01-01'),
  lastServiceOdometerKm: 40000,
  serviceIntervalManufacturerKm: 30000,
  serviceIntervalManufacturerMonths: 24,
};

function baseEvaluation(
  overrides: Partial<ServiceComplianceEvaluation> = {},
): ServiceComplianceEvaluation {
  return {
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'HM_OEM',
      distanceToNextServiceKm: 5000,
      timeToNextServiceDays: 90,
      lastUpdatedAt: '2026-08-01T00:00:00.000Z',
      serviceSourceLabel: 'HM',
      severity: 'GOOD',
      blocksRental: false,
      title: 'OK',
      description: 'OK',
      message: 'OK',
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      ...overrides.nextService,
    },
    tuvBokraft: {
      tuvValidTill: '2027-01-01T00:00:00.000Z',
      tuvRemainingMonths: 12,
      tuvRemainingDays: 365,
      tuvOverdue: false,
      tuvLastDate: null,
      bokraftValidTill: '2027-01-01T00:00:00.000Z',
      bokraftRemainingMonths: 12,
      bokraftRemainingDays: 365,
      bokraftOverdue: false,
      bokraftLastDate: null,
      ...overrides.tuvBokraft,
    },
  };
}

function collectComplianceBlockingReasons(
  svc: RentalHealthService,
  modules: Record<string, { state: string; reason: string }>,
  evaluation: ServiceComplianceEvaluation,
): string[] {
  return (svc as any).collectBlockingReasons(
    modules,
    [],
    [],
    evaluation,
    null,
    null,
    null,
    [],
    null,
  );
}

describe('Service compliance notification ↔ RentalHealth blocking parity', () => {
  const svc = new RentalHealthService(
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

  function assertParity(
    evaluation: ServiceComplianceEvaluation,
    moduleState: 'good' | 'warning' | 'critical',
    expectedEvent: 'TUV_OVERDUE' | 'BOKRAFT_OVERDUE' | 'SERVICE_OVERDUE' | null,
    reasonPattern: RegExp,
  ) {
    const blocking = evaluateServiceComplianceRentalBlocking(evaluation);
    const modules = {
      service_compliance: { state: moduleState, reason: 'canonical module reason' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const blockingReasons = collectComplianceBlockingReasons(svc, modules, evaluation);
    const sources = projectServiceComplianceOverdueNotifications(baseVehicle, evaluation);

    expect(blockingReasons.some((r) => reasonPattern.test(r))).toBe(true);
    expect(blockingReasons.length).toBeGreaterThan(0);

    if (expectedEvent) {
      expect(sources).toHaveLength(1);
      expect(sources[0].eventType).toBe(expectedEvent);
      expect(sources[0].blocksRental).toBe(true);
    }
  }

  it('TÜV overdue: evaluation, RentalHealth block, and TUV_OVERDUE projection align', () => {
    const evaluation = baseEvaluation({
      tuvBokraft: { tuvOverdue: true, tuvRemainingDays: -10 } as any,
    });
    assertParity(evaluation, 'critical', 'TUV_OVERDUE', /TÜV abgelaufen/i);
    expect(evaluation.tuvBokraft.tuvOverdue).toBe(true);
  });

  it('BOKraft overdue: evaluation, RentalHealth block, and BOKRAFT_OVERDUE projection align', () => {
    const evaluation = baseEvaluation({
      tuvBokraft: { bokraftOverdue: true, bokraftRemainingDays: -7 } as any,
    });
    assertParity(evaluation, 'critical', 'BOKRAFT_OVERDUE', /BOKraft abgelaufen/i);
    expect(evaluation.tuvBokraft.bokraftOverdue).toBe(true);
  });

  it('HM service CRITICAL overdue: module critical, RentalHealth block, SERVICE_OVERDUE projection', () => {
    const evaluation = baseEvaluation({
      nextService: {
        severity: 'CRITICAL',
        timeToNextServiceDays: -14,
        distanceToNextServiceKm: -500,
        message: 'Service überfällig',
      } as any,
    });
    assertParity(evaluation, 'critical', 'SERVICE_OVERDUE', /Service:/i);
    expect(evaluation.nextService.severity).toBe('CRITICAL');
  });

  it('due soon (WARNING): warning module, no rental block, no SERVICE_OVERDUE V2 event', () => {
    const evaluation = baseEvaluation({
      nextService: {
        severity: 'WARNING',
        timeToNextServiceDays: 10,
        distanceToNextServiceKm: 200,
        message: 'Service bald fällig',
      } as any,
    });

    const blocking = evaluateServiceComplianceRentalBlocking(evaluation);
    const modules = {
      service_compliance: { state: 'warning', reason: 'Service bald fällig' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const blockingReasons = collectComplianceBlockingReasons(svc, modules, evaluation);
    const sources = projectServiceComplianceOverdueNotifications(baseVehicle, evaluation);

    expect(blocking.serviceOverdueBlocksRental).toBe(false);
    expect(blockingReasons).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });
});
