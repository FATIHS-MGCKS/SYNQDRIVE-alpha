import type {
  EffectiveRentalRulesDto,
  OrganizationRentalRulesDto,
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalRuleFields,
  RentalRuleFormValues,
  RentalRuleSource,
  RentalVehicleCategoryDto,
  RentalYoungDriverPolicy,
} from './rental-rules.types';
import { formatPriceCents } from '../../../pricing/pricingUtils';
import {
  combineLicenseHoldingMonths,
  formatLicenseHoldingDuration,
  splitLicenseHoldingMonths,
} from './license-holding.util';
import { RENTAL_RULES_VALIDATION_LIMITS as LIMITS } from './rental-rules-validation.constants';

export function parseApiError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Request failed';
}

const POLICY_LABELS: Record<string, string> = {
  ALLOWED: 'Allowed',
  APPROVAL_REQUIRED: 'Approval required',
  NOT_ALLOWED: 'Not allowed',
  FEE_REQUIRED: 'Fee required',
};

const CATEGORY_TYPE_LABELS: Record<string, string> = {
  ECONOMY: 'Economy',
  COMPACT: 'Compact',
  TRANSPORTER: 'Transporter',
  PREMIUM: 'Premium',
  PERFORMANCE: 'Performance',
  LUXURY: 'Luxury',
  EV_PERFORMANCE: 'EV Performance',
  CUSTOM: 'Custom',
};

const FIELD_LABELS: Record<string, string> = {
  minimumAgeYears: 'Minimum age',
  minimumLicenseHoldingMonths: 'License holding',
  minimumLicenseHoldingYears: 'License holding',
  depositAmountCents: 'Deposit',
  depositAmount: 'Deposit',
  depositCurrency: 'Currency',
  creditCardRequired: 'Credit card',
  foreignTravelPolicy: 'Foreign travel',
  additionalDriverPolicy: 'Additional driver',
  youngDriverPolicy: 'Young driver',
  insuranceRequirement: 'Insurance',
  manualApprovalRequired: 'Manual approval',
  notes: 'Notes',
};

export function labelPolicy(value: string | null | undefined): string {
  if (!value) return '—';
  return POLICY_LABELS[value] ?? value;
}

export function labelCategoryType(value: string | null | undefined): string {
  if (!value) return '—';
  return CATEGORY_TYPE_LABELS[value] ?? value;
}

export function labelRuleField(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Operator-facing label for where a rule value comes from. */
export function labelRuleSource(
  source: RentalRuleSource | null,
  sourceName: string | null,
): string {
  if (!source) return 'Not set';
  if (source === 'ORGANIZATION_DEFAULT') return 'Organization default';
  if (source === 'CATEGORY' && sourceName) return `Inherited from ${sourceName}`;
  if (source === 'CATEGORY') return 'Inherited from category';
  if (source === 'VEHICLE_OVERRIDE') return 'Overridden for vehicle';
  return source;
}

export function ruleSourceInheritanceHint(
  source: RentalRuleSource | null,
  sourceName: string | null,
): string {
  if (source === 'VEHICLE_OVERRIDE') return 'Overridden for this vehicle';
  if (source === 'CATEGORY' && sourceName) return `Inherited from ${sourceName}`;
  if (source === 'ORGANIZATION_DEFAULT') return 'Inherited from organization defaults';
  return 'Inherited';
}

/** @deprecated Prefer formatLicenseHoldingDuration from license-holding.util */
export function formatLicenseHolding(
  months: number | null | undefined,
  _years?: number | null,
  options?: { long?: boolean },
): string {
  return formatLicenseHoldingDuration(months, options);
}

export function formatDeposit(
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  if (cents == null) return '—';
  return formatPriceCents(cents, currency);
}

export function formatBool(value: boolean | null | undefined, yes = 'Yes', no = 'No'): string {
  if (value == null) return '—';
  return value ? yes : no;
}

export function formatRuleValue(
  key: string,
  value: unknown,
  currency = 'EUR',
): string {
  if (value == null) return '—';
  if (key === 'depositAmountCents' || key === 'depositAmount') {
    return formatDeposit(Number(value), currency);
  }
  if (key === 'minimumLicenseHoldingMonths' || key === 'minimumLicenseHoldingYears') {
    return formatLicenseHoldingDuration(Number(value));
  }
  if (key === 'minimumAgeYears') return `${value} yr`;
  if (key === 'creditCardRequired' || key === 'manualApprovalRequired') {
    return formatBool(Boolean(value));
  }
  if (
    key === 'foreignTravelPolicy' ||
    key === 'additionalDriverPolicy' ||
    key === 'youngDriverPolicy'
  ) {
    return labelPolicy(String(value));
  }
  return String(value);
}

function resolveLicenseHoldingMonths(rules: Partial<RentalRuleFields> | null | undefined): number | null {
  if (rules?.minimumLicenseHoldingMonths != null) {
    return rules.minimumLicenseHoldingMonths;
  }
  if (
    rules?.minimumLicenseHoldingYears != null ||
    rules?.minimumLicenseHoldingRemainderMonths != null
  ) {
    return combineLicenseHoldingMonths(
      rules.minimumLicenseHoldingYears ?? 0,
      rules.minimumLicenseHoldingRemainderMonths ?? 0,
    );
  }
  return null;
}

export function rulesToFormValues(
  rules: Partial<RentalRuleFields> | null | undefined,
): RentalRuleFormValues {
  const months = resolveLicenseHoldingMonths(rules);
  const split = months != null ? splitLicenseHoldingMonths(months) : null;
  return {
    minimumAgeYears:
      rules?.minimumAgeYears != null ? String(rules.minimumAgeYears) : '',
    licenseHoldingWholeYears:
      split && (split.wholeYears > 0 || months === 0) ? String(split.wholeYears) : '',
    licenseHoldingExtraMonths:
      split && split.extraMonths > 0 ? String(split.extraMonths) : '',
    depositAmount:
      rules?.depositAmount != null
        ? String(rules.depositAmount / 100)
        : rules?.depositAmountCents != null
          ? String(rules.depositAmountCents / 100)
          : '',
    depositCurrency: rules?.depositCurrency ?? '',
    creditCardRequired:
      rules?.creditCardRequired == null
        ? ''
        : rules.creditCardRequired
          ? 'true'
          : 'false',
    foreignTravelPolicy: (rules?.foreignTravelPolicy ?? '') as RentalForeignTravelPolicy | '',
    additionalDriverPolicy: (rules?.additionalDriverPolicy ?? '') as RentalAdditionalDriverPolicy | '',
    youngDriverPolicy: (rules?.youngDriverPolicy ?? '') as RentalYoungDriverPolicy | '',
    insuranceRequirement: rules?.insuranceRequirement ?? '',
    manualApprovalRequired:
      rules?.manualApprovalRequired == null
        ? ''
        : rules.manualApprovalRequired
          ? 'true'
          : 'false',
    notes: rules?.notes ?? '',
  };
}

export type RentalRulePatchMode = 'create' | 'edit';

type RentalRulePatchBaseline = {
  minimumAgeYears: number | null;
  minimumLicenseHoldingMonths: number | null;
  depositAmountCents: number | null;
  depositCurrency: string | null;
  creditCardRequired: boolean | null;
  foreignTravelPolicy: RentalForeignTravelPolicy | null;
  additionalDriverPolicy: RentalAdditionalDriverPolicy | null;
  youngDriverPolicy: RentalYoungDriverPolicy | null;
  insuranceRequirement: string | null;
  manualApprovalRequired: boolean | null;
  notes: string | null;
};

export function extractRulePatchBaseline(
  rules: Partial<RentalRuleFields> | null | undefined,
): RentalRulePatchBaseline {
  return {
    minimumAgeYears: rules?.minimumAgeYears ?? null,
    minimumLicenseHoldingMonths: resolveLicenseHoldingMonths(rules),
    depositAmountCents: rules?.depositAmountCents ?? rules?.depositAmount ?? null,
    depositCurrency: rules?.depositCurrency?.trim() ? rules.depositCurrency.trim().toUpperCase() : null,
    creditCardRequired: rules?.creditCardRequired ?? null,
    foreignTravelPolicy: (rules?.foreignTravelPolicy ?? null) as RentalForeignTravelPolicy | null,
    additionalDriverPolicy: (rules?.additionalDriverPolicy ?? null) as RentalAdditionalDriverPolicy | null,
    youngDriverPolicy: (rules?.youngDriverPolicy ?? null) as RentalYoungDriverPolicy | null,
    insuranceRequirement: rules?.insuranceRequirement?.trim() || null,
    manualApprovalRequired: rules?.manualApprovalRequired ?? null,
    notes: rules?.notes?.trim() || null,
  };
}

function parseLicenseHoldingFormValues(values: RentalRuleFormValues): number | null {
  const hasYears = values.licenseHoldingWholeYears.trim().length > 0;
  const hasMonths = values.licenseHoldingExtraMonths.trim().length > 0;
  if (!hasYears && !hasMonths) return null;
  const wholeYears = hasYears ? Number(values.licenseHoldingWholeYears) : 0;
  const extraMonths = hasMonths ? Number(values.licenseHoldingExtraMonths) : 0;
  return combineLicenseHoldingMonths(wholeYears, extraMonths);
}

function formValuesToDesiredState(values: RentalRuleFormValues): RentalRulePatchBaseline {
  const desired = extractRulePatchBaseline(null);

  if (values.minimumAgeYears.trim()) {
    desired.minimumAgeYears = Number(values.minimumAgeYears);
  }
  desired.minimumLicenseHoldingMonths = parseLicenseHoldingFormValues(values);
  if (values.depositAmount.trim()) {
    const euros = Number(values.depositAmount.replace(',', '.'));
    if (!Number.isNaN(euros)) desired.depositAmountCents = Math.round(euros * 100);
  }
  if (values.depositCurrency.trim()) {
    desired.depositCurrency = values.depositCurrency.trim().toUpperCase();
  }
  if (values.creditCardRequired === 'true') desired.creditCardRequired = true;
  else if (values.creditCardRequired === 'false') desired.creditCardRequired = false;
  if (values.foreignTravelPolicy) desired.foreignTravelPolicy = values.foreignTravelPolicy;
  if (values.additionalDriverPolicy) desired.additionalDriverPolicy = values.additionalDriverPolicy;
  if (values.youngDriverPolicy) desired.youngDriverPolicy = values.youngDriverPolicy;
  if (values.insuranceRequirement.trim()) {
    desired.insuranceRequirement = values.insuranceRequirement.trim();
  }
  if (values.manualApprovalRequired === 'true') desired.manualApprovalRequired = true;
  else if (values.manualApprovalRequired === 'false') desired.manualApprovalRequired = false;
  if (values.notes.trim()) desired.notes = values.notes.trim();

  return desired;
}

function baselineValuesEqual(
  left: RentalRulePatchBaseline[keyof RentalRulePatchBaseline],
  right: RentalRulePatchBaseline[keyof RentalRulePatchBaseline],
): boolean {
  return left === right;
}

/**
 * Build a PATCH payload with three-state semantics:
 * - omitted key → leave existing value unchanged (edit mode)
 * - concrete value → set value (including explicit false)
 * - null → clear field / inherit from parent layer
 */
export function formValuesToPatchPayload(
  values: RentalRuleFormValues,
  baseline: Partial<RentalRuleFields> | null | undefined,
  mode: RentalRulePatchMode,
): Record<string, unknown> {
  const base = extractRulePatchBaseline(baseline);
  const desired = formValuesToDesiredState(values);
  const payload: Record<string, unknown> = {};
  const keys = Object.keys(desired) as (keyof RentalRulePatchBaseline)[];

  for (const key of keys) {
    const next = desired[key];
    if (mode === 'create') {
      if (next !== null) payload[key] = next;
      continue;
    }
    if (!baselineValuesEqual(next, base[key])) {
      payload[key] = next;
    }
  }

  return payload;
}

/** @deprecated Use formValuesToPatchPayload for edit flows with inherit/clear semantics. */
export function formValuesToPayload(values: RentalRuleFormValues): Record<string, unknown> {
  return formValuesToPatchPayload(values, null, 'create');
}

export function validateRuleForm(values: RentalRuleFormValues): string | null {
  if (values.minimumAgeYears.trim()) {
    const age = Number(values.minimumAgeYears);
    if (Number.isNaN(age) || age < LIMITS.minimumAgeYears.min || age > LIMITS.minimumAgeYears.max) {
      return `Minimum age must be between ${LIMITS.minimumAgeYears.min} and ${LIMITS.minimumAgeYears.max}.`;
    }
  }
  if (values.licenseHoldingWholeYears.trim()) {
    const years = Number(values.licenseHoldingWholeYears);
    if (
      Number.isNaN(years) ||
      years < LIMITS.licenseHoldingWholeYears.min ||
      years > LIMITS.licenseHoldingWholeYears.max
    ) {
      return `License holding years must be between ${LIMITS.licenseHoldingWholeYears.min} and ${LIMITS.licenseHoldingWholeYears.max}.`;
    }
  }
  if (values.licenseHoldingExtraMonths.trim()) {
    const months = Number(values.licenseHoldingExtraMonths);
    if (
      Number.isNaN(months) ||
      months < LIMITS.licenseHoldingExtraMonths.min ||
      months > LIMITS.licenseHoldingExtraMonths.max
    ) {
      return `Additional license holding months must be between ${LIMITS.licenseHoldingExtraMonths.min} and ${LIMITS.licenseHoldingExtraMonths.max}.`;
    }
  }
  if (values.licenseHoldingWholeYears.trim() || values.licenseHoldingExtraMonths.trim()) {
    const total = combineLicenseHoldingMonths(
      Number(values.licenseHoldingWholeYears || 0),
      Number(values.licenseHoldingExtraMonths || 0),
    );
    if (total > LIMITS.minimumLicenseHoldingMonths.max) {
      return `License holding cannot exceed ${LIMITS.minimumLicenseHoldingMonths.max} months.`;
    }
  }
  if (values.depositAmount.trim()) {
    const deposit = Number(values.depositAmount.replace(',', '.'));
    if (Number.isNaN(deposit) || deposit < LIMITS.depositMajorUnits.min) {
      return 'Deposit must be a positive amount.';
    }
    if (deposit > LIMITS.depositMajorUnits.max) {
      return `Deposit cannot exceed ${LIMITS.depositMajorUnits.max.toLocaleString()}.`;
    }
  }
  if (values.insuranceRequirement.length > LIMITS.insuranceRequirement.maxLength) {
    return `Insurance requirement cannot exceed ${LIMITS.insuranceRequirement.maxLength} characters.`;
  }
  if (values.notes.length > LIMITS.notes.maxLength) {
    return `Notes cannot exceed ${LIMITS.notes.maxLength} characters.`;
  }
  return null;
}

export function summarizeRules(
  rules: OrganizationRentalRulesDto | RentalVehicleCategoryDto,
): { label: string; value: string }[] {
  const currency = rules.depositCurrency ?? 'EUR';
  return [
    { label: 'Minimum age', value: rules.minimumAgeYears != null ? `${rules.minimumAgeYears} yr` : '—' },
    {
      label: 'License holding period',
      value: formatLicenseHoldingDuration(rules.minimumLicenseHoldingMonths, { long: true }),
    },
    { label: 'Deposit required', value: formatDeposit(rules.depositAmountCents ?? rules.depositAmount ?? null, currency) },
    { label: 'Credit card required', value: formatBool(rules.creditCardRequired) },
    { label: 'Foreign travel', value: labelPolicy(rules.foreignTravelPolicy) },
    { label: 'Additional driver', value: labelPolicy(rules.additionalDriverPolicy) },
    { label: 'Young driver', value: labelPolicy(rules.youngDriverPolicy) },
    { label: 'Insurance', value: rules.insuranceRequirement?.trim() || '—' },
  ];
}

export function countConfiguredRuleFields(rules: Partial<RentalRuleFields> | null | undefined): number {
  if (!rules) return 0;
  const keys: (keyof RentalRuleFields)[] = [
    'minimumAgeYears',
    'minimumLicenseHoldingMonths',
    'depositAmountCents',
    'creditCardRequired',
    'foreignTravelPolicy',
    'additionalDriverPolicy',
    'youngDriverPolicy',
    'insuranceRequirement',
    'manualApprovalRequired',
    'notes',
  ];
  return keys.filter((k) => rules[k] != null && rules[k] !== '').length;
}

export function effectiveRulesRows(effective: EffectiveRentalRulesDto) {
  const currency = effective.depositCurrency.value ?? 'EUR';
  const rows: {
    key: string;
    label: string;
    value: string;
    source: string;
    sourceKey: RentalRuleSource | null;
    sourceName: string | null;
  }[] = [
    {
      key: 'minimumAgeYears',
      label: 'Minimum age',
      value: formatRuleValue('minimumAgeYears', effective.minimumAgeYears.value),
      source: labelRuleSource(effective.minimumAgeYears.source, effective.minimumAgeYears.sourceName),
      sourceKey: effective.minimumAgeYears.source,
      sourceName: effective.minimumAgeYears.sourceName,
    },
    {
      key: 'minimumLicenseHoldingMonths',
      label: 'License holding period',
      value: formatLicenseHoldingDuration(effective.minimumLicenseHoldingMonths.value, { long: true }),
      source: labelRuleSource(
        effective.minimumLicenseHoldingMonths.source,
        effective.minimumLicenseHoldingMonths.sourceName,
      ),
      sourceKey: effective.minimumLicenseHoldingMonths.source,
      sourceName: effective.minimumLicenseHoldingMonths.sourceName,
    },
    {
      key: 'depositAmount',
      label: 'Deposit required',
      value: formatDeposit(
        effective.depositAmount.value ?? effective.depositAmountCents.value,
        currency,
      ),
      source: labelRuleSource(effective.depositAmount.source, effective.depositAmount.sourceName),
      sourceKey: effective.depositAmount.source,
      sourceName: effective.depositAmount.sourceName,
    },
    {
      key: 'creditCardRequired',
      label: 'Credit card required',
      value: formatBool(effective.creditCardRequired.value),
      source: labelRuleSource(
        effective.creditCardRequired.source,
        effective.creditCardRequired.sourceName,
      ),
      sourceKey: effective.creditCardRequired.source,
      sourceName: effective.creditCardRequired.sourceName,
    },
    {
      key: 'foreignTravelPolicy',
      label: 'Foreign travel',
      value: labelPolicy(effective.foreignTravelPolicy.value),
      source: labelRuleSource(
        effective.foreignTravelPolicy.source,
        effective.foreignTravelPolicy.sourceName,
      ),
      sourceKey: effective.foreignTravelPolicy.source,
      sourceName: effective.foreignTravelPolicy.sourceName,
    },
    {
      key: 'additionalDriverPolicy',
      label: 'Additional driver',
      value: labelPolicy(effective.additionalDriverPolicy.value),
      source: labelRuleSource(
        effective.additionalDriverPolicy.source,
        effective.additionalDriverPolicy.sourceName,
      ),
      sourceKey: effective.additionalDriverPolicy.source,
      sourceName: effective.additionalDriverPolicy.sourceName,
    },
    {
      key: 'youngDriverPolicy',
      label: 'Young driver',
      value: labelPolicy(effective.youngDriverPolicy.value),
      source: labelRuleSource(
        effective.youngDriverPolicy.source,
        effective.youngDriverPolicy.sourceName,
      ),
      sourceKey: effective.youngDriverPolicy.source,
      sourceName: effective.youngDriverPolicy.sourceName,
    },
    {
      key: 'insuranceRequirement',
      label: 'Insurance',
      value: effective.insuranceRequirement.value?.trim() || '—',
      source: labelRuleSource(
        effective.insuranceRequirement.source,
        effective.insuranceRequirement.sourceName,
      ),
      sourceKey: effective.insuranceRequirement.source,
      sourceName: effective.insuranceRequirement.sourceName,
    },
    {
      key: 'manualApprovalRequired',
      label: 'Manual approval',
      value: formatBool(effective.manualApprovalRequired.value),
      source: labelRuleSource(
        effective.manualApprovalRequired.source,
        effective.manualApprovalRequired.sourceName,
      ),
      sourceKey: effective.manualApprovalRequired.source,
      sourceName: effective.manualApprovalRequired.sourceName,
    },
  ];
  return rows;
}
