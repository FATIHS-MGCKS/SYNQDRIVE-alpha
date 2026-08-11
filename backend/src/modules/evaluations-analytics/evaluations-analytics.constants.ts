import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Central permission module key for the evaluations analytics foundation.
 * Enforced via `@RequirePermission(EVALUATIONS_MODULE, 'read')`. Granular
 * operational actions (customer/driver detail, export, …) are introduced by E5.
 */
export const EVALUATIONS_MODULE: PermissionModuleKey = 'evaluations';

/** Default cap on summary top-N groups; always distinct from the aggregate total. */
export const EVALUATIONS_ANALYTICS_DEFAULT_GROUP_LIMIT = 20;

/** Hard upper bound on summary top-N groups. */
export const EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT = 100;
