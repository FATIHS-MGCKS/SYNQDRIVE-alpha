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
  'workflow-automation-publish',
  'workflow-automation-test',
  'workflow-automation-test-external',
  'workflow-automation-approval',
  'workflow-automation-runs',
  'workflow-automation-audit',
  'workflow-automation-dead-letter',
  'workflow-automation-secrets',
  'workflow-automation-policy',
  'workflow-automation-templates',
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
  'legal-documents',
  'legal-documents-audit',
  'rental-rules',
  'rental-rules-publish',
  'rental-rules-assign',
  'rental-rules-overrides',
  'booking-eligibility',
  'booking-eligibility-override',
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULE_KEYS)[number];

export const USERS_ROLES_MODULE = 'users-roles' as const;

export const MIN_USER_PASSWORD_LENGTH = 12;

export const LAST_ORG_ADMIN_MESSAGE =
  'At least one active organization admin is required.';
