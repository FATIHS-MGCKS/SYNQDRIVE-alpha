/**
 * Canonical permission module keys — mirrors `PERMISSION_MODULES` in
 * `frontend/src/rental/components/UsersRolesTab.tsx`.
 *
 * ORG_ADMINs configure `{ [moduleKey]: { read, write, manage? } }` per membership.
 */
export const PERMISSION_MODULE_KEYS = [
  'dashboard',
  'bookings',
  'fleet',
  'customers',
  'stations',
  'fleet-condition',
  'invoices',
  'fines',
  'price-tariffs',
  'tasks',
  'vendor-management',
  'ai-assistant',
  'workflow-automation',
  'document-upload',
  'company-info',
  'users-roles',
  'fleet-connectivity',
  'data-analyse',
  'data-authorization',
  'billing',
  'support',
  'payments',
  'payments-refund',
  'payments-disputes',
  'payments-connect',
  'payments-settings',
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULE_KEYS)[number];

export const USERS_ROLES_MODULE = 'users-roles' as const;

export const MIN_USER_PASSWORD_LENGTH = 12;

export const LAST_ORG_ADMIN_MESSAGE =
  'At least one active organization admin is required.';
