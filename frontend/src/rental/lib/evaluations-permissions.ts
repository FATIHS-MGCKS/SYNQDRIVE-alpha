export type EvaluationsPermissionAction =
  | 'evaluations.executive.read'
  | 'evaluations.finance.read'
  | 'evaluations.receivables.read'
  | 'evaluations.customer_pii.read'
  | 'evaluations.driver.read'
  | 'evaluations.costs.read'
  | 'evaluations.forecasts.read'
  | 'evaluations.data_quality.read'
  | 'evaluations.recommendations.write'
  | 'evaluations.assignees.write'
  | 'evaluations.export.write'
  | 'evaluations.admin.manage';

export type HasPermissionFn = (
  module: string,
  level: 'read' | 'write' | 'manage',
) => boolean;

const EVALUATIONS_PERMISSION_MODULE_MAP: Record<
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

const LEGACY_FALLBACKS: Partial<
  Record<EvaluationsPermissionAction, Array<{ module: string; level: 'read' | 'write' | 'manage' }>>
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

export function hasEvaluationsPermission(
  hasPermission: HasPermissionFn,
  action: EvaluationsPermissionAction,
): boolean {
  const requirement = EVALUATIONS_PERMISSION_MODULE_MAP[action];
  if (hasPermission(requirement.module, requirement.level)) {
    return true;
  }

  for (const fallback of LEGACY_FALLBACKS[action] ?? []) {
    if (hasPermission(fallback.module, fallback.level)) {
      return true;
    }
  }

  if (
    action === 'evaluations.customer_pii.read' &&
    hasPermission('invoices', 'read') &&
    hasPermission('customers', 'read')
  ) {
    return true;
  }

  if (action === 'evaluations.assignees.write' && hasPermission('tasks', 'write')) {
    return true;
  }

  return false;
}

export interface EvaluationsPermissionGate {
  canAccessPage: boolean;
  canExecutiveKpis: boolean;
  canFinance: boolean;
  canReceivables: boolean;
  canCustomerPii: boolean;
  canDriverAnalysis: boolean;
  canCosts: boolean;
  canForecasts: boolean;
  canDataQuality: boolean;
  canManageRecommendations: boolean;
  canAssignResponsible: boolean;
  canExport: boolean;
  canAdminModels: boolean;
}

export function buildEvaluationsPermissionGate(
  hasPermission: HasPermissionFn,
): EvaluationsPermissionGate {
  return {
    canAccessPage: hasEvaluationsPermission(hasPermission, 'evaluations.executive.read'),
    canExecutiveKpis: hasEvaluationsPermission(hasPermission, 'evaluations.executive.read'),
    canFinance: hasEvaluationsPermission(hasPermission, 'evaluations.finance.read'),
    canReceivables: hasEvaluationsPermission(hasPermission, 'evaluations.receivables.read'),
    canCustomerPii: hasEvaluationsPermission(hasPermission, 'evaluations.customer_pii.read'),
    canDriverAnalysis: hasEvaluationsPermission(hasPermission, 'evaluations.driver.read'),
    canCosts: hasEvaluationsPermission(hasPermission, 'evaluations.costs.read'),
    canForecasts: hasEvaluationsPermission(hasPermission, 'evaluations.forecasts.read'),
    canDataQuality: hasEvaluationsPermission(hasPermission, 'evaluations.data_quality.read'),
    canManageRecommendations: hasEvaluationsPermission(
      hasPermission,
      'evaluations.recommendations.write',
    ),
    canAssignResponsible: hasEvaluationsPermission(hasPermission, 'evaluations.assignees.write'),
    canExport: hasEvaluationsPermission(hasPermission, 'evaluations.export.write'),
    canAdminModels: hasEvaluationsPermission(hasPermission, 'evaluations.admin.manage'),
  };
}

export function resolveEvaluationsPiiTierFromPermissions(
  hasPermission: HasPermissionFn,
  membershipRole: string | null,
): 'full' | 'pseudonymous' | 'none' {
  if (membershipRole === 'ORG_ADMIN' || membershipRole === 'MASTER_ADMIN') {
    return 'full';
  }
  if (hasEvaluationsPermission(hasPermission, 'evaluations.customer_pii.read')) {
    return 'full';
  }
  if (hasEvaluationsPermission(hasPermission, 'evaluations.finance.read')) {
    return 'pseudonymous';
  }
  return 'none';
}
