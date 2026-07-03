import type { OperationalIssueSeverity } from './operationalIssueTypes';
import {
  isHmOemServiceTrackingMissingText,
  isOperativeRentalHealthModule,
  isOverdueIssueText,
  operativeSeverityFromRentalModule,
} from './operationalIssueTaxonomy';
import {
  resolveTireOperationalBand,
  resolveTireOperationalSeverity,
  tireModuleDetailLabel,
  type TireOperationalBand,
} from './operationalIssueTireTaxonomy';

export interface RentalHealthModuleSeverityInput {
  moduleKey: string;
  state: string;
  reason?: string | null;
  label?: string | null;
  actionState?: string | null;
}

/**
 * Canonical operational severity for a rental-health module row.
 * Fleet Command, Fleet Health, and Vehicle surfaces should use this
 * instead of ad-hoc state→label mappings.
 */
export function resolveRentalModuleOperationalSeverity(
  input: RentalHealthModuleSeverityInput,
): OperationalIssueSeverity | null {
  const module = {
    state: input.state,
    reason: input.reason,
    label: input.label,
  };

  if (!isOperativeRentalHealthModule(input.moduleKey, module)) {
    if (input.moduleKey === 'tires') {
      return resolveTireOperationalSeverity({
        moduleState: input.state,
        reason: input.reason,
        actionState: input.actionState,
      });
    }
    return null;
  }

  if (input.moduleKey === 'tires') {
    return resolveTireOperationalSeverity({
      moduleState: input.state,
      reason: input.reason,
      actionState: input.actionState,
    });
  }

  if (
    input.moduleKey === 'service_compliance'
    && isHmOemServiceTrackingMissingText(input.reason ?? '')
    && !isOverdueIssueText(input.reason ?? '')
  ) {
    return null;
  }

  return operativeSeverityFromRentalModule(input.moduleKey, module);
}

export function resolveTireBandForModule(
  input: RentalHealthModuleSeverityInput,
): TireOperationalBand {
  return resolveTireOperationalBand({
    moduleState: input.state,
    reason: input.reason,
    actionState: input.actionState,
  });
}

export function rentalModuleSeverityDetailLabel(
  input: RentalHealthModuleSeverityInput,
  locale: string,
): string {
  const de = locale === 'de';
  if (input.moduleKey === 'tires') {
    return tireModuleDetailLabel(resolveTireBandForModule(input), de);
  }
  const severity = resolveRentalModuleOperationalSeverity(input);
  if (severity === 'critical') return de ? 'Kritisch' : 'Critical';
  if (severity === 'warning') return de ? 'Warnung' : 'Warning';
  if (severity === 'attention') return de ? 'Hinweis' : 'Notice';
  return de ? 'OK' : 'OK';
}
