import type { ServiceComplianceEvaluation } from './service-compliance.types';

/** Canonical rental-blocking impact of service/compliance evaluation — single policy source. */
export interface ServiceComplianceRentalBlockingDecision {
  tuvOverdue: boolean;
  bokraftOverdue: boolean;
  /** HM/OEM service overdue blocks rental when critical and TÜV/BOKraft are not already blocking. */
  serviceOverdueBlocksRental: boolean;
}

/**
 * Rental-blocking predicate shared by RentalHealth, notification projection, and metadata.
 * Mirrors {@link RentalHealthService.collectBlockingReasons} service_compliance rules.
 */
export function evaluateServiceComplianceRentalBlocking(
  evaluation: ServiceComplianceEvaluation,
): ServiceComplianceRentalBlockingDecision {
  const tuvOverdue = evaluation.tuvBokraft.tuvOverdue;
  const bokraftOverdue = evaluation.tuvBokraft.bokraftOverdue;
  const serviceOverdueBlocksRental =
    evaluation.nextService.trackingStatus === 'TRACKED' &&
    evaluation.nextService.severity === 'CRITICAL' &&
    !tuvOverdue &&
    !bokraftOverdue;

  return {
    tuvOverdue,
    bokraftOverdue,
    serviceOverdueBlocksRental,
  };
}

/** True when HM/OEM next service is canonically overdue (CRITICAL), not merely due soon. */
export function isHmServiceOverdue(evaluation: ServiceComplianceEvaluation): boolean {
  return (
    evaluation.nextService.trackingStatus === 'TRACKED' &&
    evaluation.nextService.severity === 'CRITICAL'
  );
}
