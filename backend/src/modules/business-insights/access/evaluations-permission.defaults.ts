import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

export function evaluationsFullPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
    'evaluations-finance': all(true, false, false),
    'evaluations-receivables': all(true, false, false),
    'evaluations-customer-pii': all(true, false, false),
    'evaluations-driver': all(true, false, false),
    'evaluations-costs': all(true, false, false),
    'evaluations-forecasts': all(true, false, false),
    'evaluations-data-quality': all(true, false, false),
    'evaluations-recommendations': all(true, true, false),
    'evaluations-assignees': all(true, true, false),
    'evaluations-export': all(true, true, false),
    'evaluations-admin': all(true, false, true),
  };
}

export function evaluationsExecutiveReadPermissions(): MembershipPermissionsMap {
  return { evaluations: all(true, false, false) };
}

export function evaluationsFinanceOperatorPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
    'evaluations-finance': all(true, false, false),
    'evaluations-receivables': all(true, false, false),
    'evaluations-customer-pii': all(true, false, false),
    'evaluations-costs': all(true, false, false),
    'evaluations-forecasts': all(true, false, false),
    'evaluations-export': all(true, true, false),
  };
}

export function evaluationsStationManagerPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
    'evaluations-forecasts': all(true, false, false),
    'evaluations-recommendations': all(true, true, false),
    'evaluations-assignees': all(true, true, false),
  };
}

export function evaluationsOperationsViewerPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
  };
}

export function evaluationsReadOnlyAnalyticsPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
    'evaluations-finance': all(true, false, false),
    'evaluations-receivables': all(true, false, false),
    'evaluations-costs': all(true, false, false),
    'evaluations-forecasts': all(true, false, false),
    'evaluations-data-quality': all(true, false, false),
  };
}

export function evaluationsServiceWorkshopPermissions(): MembershipPermissionsMap {
  return {
    evaluations: all(true, false, false),
    'evaluations-forecasts': all(true, false, false),
    'evaluations-driver': all(true, false, false),
  };
}

export function evaluationsSubAdminPermissions(): MembershipPermissionsMap {
  const perms = evaluationsFullPermissions();
  delete perms['evaluations-export'];
  delete perms['evaluations-admin'];
  return perms;
}
