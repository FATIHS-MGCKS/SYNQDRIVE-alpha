import type { HealthState, ModuleHealth } from '@modules/rental-health/rental-health.types';
import type { ServiceComplianceEvaluation } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import {
  evaluateServiceComplianceRentalBlocking,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance-rental-blocking.policy';
import {
  SERVICE_COMPLIANCE_NOTIFICATION_EVENT_TYPES,
  type ServiceComplianceNotificationEventType,
} from './service-compliance-notification.projector';
import {
  VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES,
  type VehicleHealthNotificationEventType,
} from './rental-health-notification.projector';

const HEALTH_MODULE_EVENT_MAP: Record<
  'battery' | 'tires' | 'brakes',
  VehicleHealthNotificationEventType
> = {
  battery: 'BATTERY_CRITICAL',
  tires: 'TIRE_CRITICAL',
  brakes: 'BRAKE_CRITICAL',
};

/** Positive recovery = module explicitly healthy, not unknown/placeholder. */
export function isHealthModuleRecoveryEligible(
  module: Pick<ModuleHealth, 'state'> | undefined,
): boolean {
  return module?.state === 'good';
}

export function buildVehicleHealthRecoveryEligibility(input: {
  rentalHealthLoaded: boolean;
  modules?: {
    battery?: ModuleHealth;
    tires?: ModuleHealth;
    brakes?: ModuleHealth;
  };
  dtcQuerySucceeded: boolean;
}): Record<VehicleHealthNotificationEventType, boolean> {
  const eligibility = Object.fromEntries(
    VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES.map((eventType) => [eventType, false]),
  ) as Record<VehicleHealthNotificationEventType, boolean>;

  if (!input.rentalHealthLoaded || !input.modules) {
    if (input.dtcQuerySucceeded) {
      eligibility.ACTIVE_DTC = true;
    }
    return eligibility;
  }

  for (const [moduleKey, eventType] of Object.entries(HEALTH_MODULE_EVENT_MAP) as Array<
    [keyof typeof HEALTH_MODULE_EVENT_MAP, VehicleHealthNotificationEventType]
  >) {
    eligibility[eventType] = isHealthModuleRecoveryEligible(input.modules[moduleKey]);
  }

  if (input.dtcQuerySucceeded) {
    eligibility.ACTIVE_DTC = true;
  }

  return eligibility;
}

export function buildServiceComplianceRecoveryEligibility(input: {
  evaluationSucceeded: boolean;
  evaluation: ServiceComplianceEvaluation | null;
}): Record<ServiceComplianceNotificationEventType, boolean> {
  const eligibility = Object.fromEntries(
    SERVICE_COMPLIANCE_NOTIFICATION_EVENT_TYPES.map((eventType) => [eventType, false]),
  ) as Record<ServiceComplianceNotificationEventType, boolean>;

  if (!input.evaluationSucceeded || !input.evaluation) {
    return eligibility;
  }

  const blocking = evaluateServiceComplianceRentalBlocking(input.evaluation);
  const { nextService, tuvBokraft } = input.evaluation;

  eligibility.TUV_OVERDUE =
    tuvBokraft?.tuvRemainingDays != null && !blocking.tuvOverdue;

  eligibility.BOKRAFT_OVERDUE =
    tuvBokraft?.bokraftRemainingDays != null && !blocking.bokraftOverdue;

  eligibility.SERVICE_OVERDUE =
    nextService?.trackingStatus === 'TRACKED' && !blocking.serviceOverdue;

  return eligibility;
}

export function isPositiveHealthRecoveryState(state: HealthState | undefined): boolean {
  return state === 'good';
}
