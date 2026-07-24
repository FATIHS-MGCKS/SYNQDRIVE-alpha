import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Granular Auswertungen (evaluations / analytics) capabilities.
 * Mapped to membership JSON modules — backend is authoritative.
 */
export const EVALUATIONS_PERMISSION_ACTIONS = [
  'evaluations.executive.read',
  'evaluations.finance.read',
  'evaluations.receivables.read',
  'evaluations.customer_pii.read',
  'evaluations.driver.read',
  'evaluations.costs.read',
  'evaluations.forecasts.read',
  'evaluations.data_quality.read',
  'evaluations.recommendations.write',
  'evaluations.assignees.write',
  'evaluations.export.write',
  'evaluations.admin.manage',
] as const;

export type EvaluationsPermissionAction = (typeof EVALUATIONS_PERMISSION_ACTIONS)[number];

export interface EvaluationsPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const EVALUATIONS_PERMISSION_REQUIREMENTS: Readonly<
  Record<EvaluationsPermissionAction, EvaluationsPermissionRequirement>
> = {
  'evaluations.executive.read': { module: 'evaluations', level: 'read' },
  'evaluations.finance.read': { module: 'evaluations-finance', level: 'read' },
  'evaluations.receivables.read': { module: 'evaluations-receivables', level: 'read' },
  'evaluations.customer_pii.read': { module: 'evaluations-customer-pii', level: 'read' },
  'evaluations.driver.read': { module: 'evaluations-driver', level: 'read' },
  'evaluations.costs.read': { module: 'evaluations-costs', level: 'read' },
  'evaluations.forecasts.read': { module: 'evaluations-forecasts', level: 'read' },
  'evaluations.data_quality.read': { module: 'evaluations-data-quality', level: 'read' },
  'evaluations.recommendations.write': { module: 'evaluations-recommendations', level: 'write' },
  'evaluations.assignees.write': { module: 'evaluations-assignees', level: 'write' },
  'evaluations.export.write': { module: 'evaluations-export', level: 'write' },
  'evaluations.admin.manage': { module: 'evaluations-admin', level: 'manage' },
};

/** Legacy module fallbacks until memberships are backfilled with evaluations keys. */
export const EVALUATIONS_PERMISSION_LEGACY_FALLBACKS: Partial<
  Record<
    EvaluationsPermissionAction,
    Array<{ module: PermissionModuleKey; level: PermissionLevel }>
  >
> = {
  'evaluations.executive.read': [{ module: 'invoices', level: 'read' }],
  'evaluations.finance.read': [{ module: 'invoices', level: 'read' }],
  'evaluations.receivables.read': [{ module: 'invoices', level: 'read' }],
  'evaluations.costs.read': [{ module: 'invoices', level: 'read' }],
  'evaluations.forecasts.read': [
    { module: 'invoices', level: 'read' },
    { module: 'data-analyse', level: 'read' },
  ],
  'evaluations.data_quality.read': [{ module: 'data-analyse', level: 'read' }],
  'evaluations.driver.read': [{ module: 'fleet-condition', level: 'read' }],
  'evaluations.admin.manage': [{ module: 'data-analyse', level: 'manage' }],
};

export function isEvaluationsPermissionAction(
  value: string,
): value is EvaluationsPermissionAction {
  return (EVALUATIONS_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
