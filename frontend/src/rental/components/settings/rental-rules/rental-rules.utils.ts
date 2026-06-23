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

export function formatLicenseHolding(
  months: number | null | undefined,
  years?: number | null,
  options?: { long?: boolean },
): string {
  const yr = options?.long ? 'years' : 'yr';
  const mo = options?.long ? 'months' : 'mo';
  if (years != null) return years === 1 && options?.long ? '1 year' : `${years} ${yr}`;
  if (months == null) return '—';
  if (months % 12 === 0) {
    const y = months / 12;
    return y === 1 && options?.long ? '1 year' : `${y} ${yr}`;
  }
  return `${months} ${mo}`;
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
  if (key === 'minimumLicenseHoldingMonths') {
    return formatLicenseHolding(Number(value));
  }
  if (key === 'minimumLicenseHoldingYears') {
    return formatLicenseHolding(null, Number(value));
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

export function rulesToFormValues(
  rules: Partial<RentalRuleFields> | null | undefined,
): RentalRuleFormValues {
  const currency = rules?.depositCurrency ?? 'EUR';
  return {
    minimumAgeYears:
      rules?.minimumAgeYears != null ? String(rules.minimumAgeYears) : '',
    minimumLicenseHoldingYears:
      rules?.minimumLicenseHoldingYears != null
        ? String(rules.minimumLicenseHoldingYears)
        : rules?.minimumLicenseHoldingMonths != null
          ? String(Math.round(rules.minimumLicenseHoldingMonths / 12))
          : '',
    depositAmount:
      rules?.depositAmount != null
        ? String(rules.depositAmount / 100)
        : rules?.depositAmountCents != null
          ? String(rules.depositAmountCents / 100)
          : '',
    depositCurrency: currency,
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

export function formValuesToPayload(values: RentalRuleFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (values.minimumAgeYears.trim()) {
    payload.minimumAgeYears = Number(values.minimumAgeYears);
  }
  if (values.minimumLicenseHoldingYears.trim()) {
    payload.minimumLicenseHoldingYears = Number(values.minimumLicenseHoldingYears);
  }
  if (values.depositAmount.trim()) {
    const euros = Number(values.depositAmount.replace(',', '.'));
    if (!Number.isNaN(euros)) payload.depositAmount = Math.round(euros * 100);
  }
  if (values.depositCurrency.trim()) payload.depositCurrency = values.depositCurrency.trim();
  if (values.creditCardRequired) payload.creditCardRequired = values.creditCardRequired === 'true';
  if (values.foreignTravelPolicy) payload.foreignTravelPolicy = values.foreignTravelPolicy;
  if (values.additionalDriverPolicy) payload.additionalDriverPolicy = values.additionalDriverPolicy;
  if (values.youngDriverPolicy) payload.youngDriverPolicy = values.youngDriverPolicy;
  if (values.insuranceRequirement.trim()) payload.insuranceRequirement = values.insuranceRequirement.trim();
  if (values.manualApprovalRequired) {
    payload.manualApprovalRequired = values.manualApprovalRequired === 'true';
  }
  if (values.notes.trim()) payload.notes = values.notes.trim();
  return payload;
}

export function validateRuleForm(values: RentalRuleFormValues): string | null {
  if (values.minimumAgeYears.trim()) {
    const age = Number(values.minimumAgeYears);
    if (Number.isNaN(age) || age < 18 || age > 99) return 'Minimum age must be between 18 and 99.';
  }
  if (values.minimumLicenseHoldingYears.trim()) {
    const years = Number(values.minimumLicenseHoldingYears);
    if (Number.isNaN(years) || years < 0 || years > 80) {
      return 'License holding must be between 0 and 80 years.';
    }
  }
  if (values.depositAmount.trim()) {
    const deposit = Number(values.depositAmount.replace(',', '.'));
    if (Number.isNaN(deposit) || deposit < 0) return 'Deposit must be a positive amount.';
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
      value: formatLicenseHolding(
        rules.minimumLicenseHoldingMonths,
        rules.minimumLicenseHoldingYears,
        { long: true },
      ),
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
      key: 'minimumLicenseHoldingYears',
      label: 'License holding period',
      value: formatLicenseHolding(
        effective.minimumLicenseHoldingMonths.value,
        effective.minimumLicenseHoldingYears.value,
        { long: true },
      ),
      source: labelRuleSource(
        effective.minimumLicenseHoldingYears.source,
        effective.minimumLicenseHoldingYears.sourceName,
      ),
      sourceKey: effective.minimumLicenseHoldingYears.source,
      sourceName: effective.minimumLicenseHoldingYears.sourceName,
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
