import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Stable permission codes for audit logs, documentation, and UI labels.
 * Enforced server-side via mapped module+level membership JSON — never client-declared.
 */
export const RENTAL_RULE_PERMISSION_CODES = {
  READ: 'RENTAL_RULES_READ',
  WRITE: 'RENTAL_RULES_WRITE',
  PUBLISH: 'RENTAL_RULES_PUBLISH',
  ASSIGN_VEHICLES: 'RENTAL_RULES_ASSIGN_VEHICLES',
  MANAGE_OVERRIDES: 'RENTAL_RULES_MANAGE_OVERRIDES',
} as const;

export type RentalRulePermissionCode =
  (typeof RENTAL_RULE_PERMISSION_CODES)[keyof typeof RENTAL_RULE_PERMISSION_CODES];

/**
 * Granular rental-rules actions for Administration → Mietregeln.
 * Mapped to `{ module, read|write|manage }` membership JSON (same pattern as legal-documents/payments).
 */
export const RENTAL_RULE_PERMISSION_ACTIONS = [
  'rental_rules.read',
  'rental_rules.write',
  'rental_rules.publish',
  'rental_rules.assign_vehicles',
  'rental_rules.manage_overrides',
] as const;

export type RentalRulePermissionAction = (typeof RENTAL_RULE_PERMISSION_ACTIONS)[number];

export interface RentalRulePermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: RentalRulePermissionCode;
}

/** Publish and vehicle assignment use dedicated modules — never implied by `rental-rules.write`. */
export const RENTAL_RULE_PERMISSION_REQUIREMENTS: Readonly<
  Record<RentalRulePermissionAction, RentalRulePermissionRequirement>
> = {
  'rental_rules.read': {
    module: 'rental-rules',
    level: 'read',
    code: RENTAL_RULE_PERMISSION_CODES.READ,
  },
  'rental_rules.write': {
    module: 'rental-rules',
    level: 'write',
    code: RENTAL_RULE_PERMISSION_CODES.WRITE,
  },
  'rental_rules.publish': {
    module: 'rental-rules-publish',
    level: 'write',
    code: RENTAL_RULE_PERMISSION_CODES.PUBLISH,
  },
  'rental_rules.assign_vehicles': {
    module: 'rental-rules-assign',
    level: 'write',
    code: RENTAL_RULE_PERMISSION_CODES.ASSIGN_VEHICLES,
  },
  'rental_rules.manage_overrides': {
    module: 'rental-rules-overrides',
    level: 'write',
    code: RENTAL_RULE_PERMISSION_CODES.MANAGE_OVERRIDES,
  },
};

export function isRentalRulePermissionAction(value: string): value is RentalRulePermissionAction {
  return (RENTAL_RULE_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
