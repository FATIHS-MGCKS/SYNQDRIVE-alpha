/**
 * Canonical Auswertungen permission action identifiers.
 * Backend maps these to membership module keys.
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

export const EVALUATIONS_PERMISSION_MODULE_MAP: Record<
  EvaluationsPermissionAction,
  { module: string; level: 'read' | 'write' | 'manage' }
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
