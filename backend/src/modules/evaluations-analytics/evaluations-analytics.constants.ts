import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Central permission module key for the evaluations analytics foundation.
 * Enforced via `@RequirePermission(EVALUATIONS_MODULE, 'read')`. Granular
 * operational actions (customer/driver detail, export, …) are introduced by E5.
 */
export const EVALUATIONS_MODULE: PermissionModuleKey = 'evaluations';

// Group-limit bounds live in the shared contract as the single source of truth.
export {
  EVALUATIONS_ANALYTICS_DEFAULT_GROUP_LIMIT,
  EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';
