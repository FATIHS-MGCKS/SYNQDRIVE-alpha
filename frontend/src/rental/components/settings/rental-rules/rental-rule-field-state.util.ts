import type { RentalRuleFields, RentalRuleFormValues } from './rental-rules.types';

/** System permissive defaults are all null — no real inherited constraints at org level. */
export const HAS_REAL_SYSTEM_DEFAULT = false;

export type RentalRuleScalarFieldState = 'inherit' | 'own' | 'none';
export type RentalRuleBooleanFieldState = 'inherit' | 'required' | 'not_required';
export type RentalRuleOrgScalarState = 'own' | 'none';
export type RentalRuleOrgBooleanState = 'required' | 'not_required';

export type RentalRuleFieldScope = 'organization' | 'category' | 'vehicle';

export type RentalRuleFieldKey =
  | 'minimumAgeYears'
  | 'minimumLicenseHoldingMonths'
  | 'depositAmountCents'
  | 'depositCurrency'
  | 'creditCardRequired'
  | 'foreignTravelPolicy'
  | 'additionalDriverPolicy'
  | 'youngDriverPolicy'
  | 'insuranceRequirement'
  | 'manualApprovalRequired'
  | 'notes';

export const RENTAL_RULE_BOOLEAN_FIELDS = [
  'creditCardRequired',
  'manualApprovalRequired',
] as const satisfies ReadonlyArray<RentalRuleFieldKey>;

export const RENTAL_RULE_POLICY_FIELDS = [
  'foreignTravelPolicy',
  'additionalDriverPolicy',
  'youngDriverPolicy',
] as const satisfies ReadonlyArray<RentalRuleFieldKey>;

export function isBooleanRuleField(key: RentalRuleFieldKey): boolean {
  return (RENTAL_RULE_BOOLEAN_FIELDS as readonly string[]).includes(key);
}

export function isPolicyRuleField(key: RentalRuleFieldKey): boolean {
  return (RENTAL_RULE_POLICY_FIELDS as readonly string[]).includes(key);
}

export function allowsInherit(scope: RentalRuleFieldScope): boolean {
  return scope !== 'organization' && HAS_REAL_SYSTEM_DEFAULT ? true : scope !== 'organization';
}

export function inferBooleanFieldState(
  scope: RentalRuleFieldScope,
  stored: boolean | null | undefined,
): RentalRuleBooleanFieldState | RentalRuleOrgBooleanState {
  if (scope === 'organization') {
    if (stored === true) return 'required';
    if (stored === false) return 'not_required';
    return 'not_required';
  }
  if (stored === true) return 'required';
  if (stored === false) return 'not_required';
  return 'inherit';
}

export function inferScalarFieldState(
  scope: RentalRuleFieldScope,
  stored: unknown,
): RentalRuleScalarFieldState | RentalRuleOrgScalarState {
  if (scope === 'organization') {
    return stored == null || stored === '' ? 'none' : 'own';
  }
  return stored == null || stored === '' ? 'inherit' : 'own';
}

export function booleanStateToFormValue(
  state: RentalRuleBooleanFieldState | RentalRuleOrgBooleanState,
): RentalRuleFormValues['creditCardRequired'] {
  if (state === 'required') return 'true';
  if (state === 'not_required') return 'false';
  return '';
}

export function formValueToBooleanState(
  scope: RentalRuleFieldScope,
  value: RentalRuleFormValues['creditCardRequired'],
): RentalRuleBooleanFieldState | RentalRuleOrgBooleanState {
  if (value === 'true') return 'required';
  if (value === 'false') return 'not_required';
  return scope === 'organization' ? 'not_required' : 'inherit';
}

export function describeFieldImpact(input: {
  scope: RentalRuleFieldScope;
  field: RentalRuleFieldKey;
  previousStored: unknown;
  nextStored: unknown;
  inheritedValue: unknown;
}): 'unchanged' | 'inherits' | 'cleared' | 'set' | 'changed' {
  const { previousStored, nextStored } = input;
  if (JSON.stringify(previousStored) === JSON.stringify(nextStored)) return 'unchanged';
  if (nextStored == null || nextStored === '') {
    return input.scope === 'organization' ? 'cleared' : 'inherits';
  }
  if (previousStored == null || previousStored === '') return 'set';
  return 'changed';
}

export function resolveInheritedFieldValue(
  field: RentalRuleFieldKey,
  parentRules: Partial<RentalRuleFields> | null | undefined,
): unknown {
  if (!parentRules) return null;
  if (field === 'depositAmountCents') {
    return parentRules.depositAmountCents ?? parentRules.depositAmount ?? null;
  }
  return parentRules[field as keyof RentalRuleFields] ?? null;
}
