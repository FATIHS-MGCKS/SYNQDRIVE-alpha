import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

export const OPERATOR_HANDOVER_PERMISSION_CODES = {
  COMPLETE: 'OPERATOR_HANDOVER_COMPLETE',
  OVERRIDE_SCOPE: 'OPERATOR_HANDOVER_OVERRIDE_SCOPE',
} as const;

export type OperatorHandoverPermissionAction =
  | 'operator.handover.complete'
  | 'operator.handover.override';

export interface OperatorHandoverPermissionRequirement {
  module: string;
  level: PermissionLevel;
  code: string;
}

/**
 * Operator handover capability registry.
 * `operator.handover.complete` maps to `bookings.write` until a dedicated IAM module ships.
 */
export const OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS: Readonly<
  Record<OperatorHandoverPermissionAction, OperatorHandoverPermissionRequirement>
> = {
  'operator.handover.complete': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_HANDOVER_PERMISSION_CODES.COMPLETE,
  },
  'operator.handover.override': {
    module: 'bookings',
    level: 'manage',
    code: OPERATOR_HANDOVER_PERMISSION_CODES.OVERRIDE_SCOPE,
  },
};
