import type {
  EffectiveRentalRulesDto,
  EffectiveRuleField,
  RentalRuleSource,
  VehicleRentalRequirementsDto,
} from '../components/settings/rental-rules/rental-rules.types';
import type { VehicleOverviewCardStatus } from './vehicle-overview.types';
import {
  formatBool,
  formatDeposit,
  formatLicenseHolding,
  formatRuleValue,
  labelPolicy,
  labelRuleField,
  labelRuleSource,
  ruleSourceInheritanceHint,
} from '../components/settings/rental-rules/rental-rules.utils';

export type VehicleRequirementsStatusKind =
  | 'active'
  | 'missing-category'
  | 'vehicle-override'
  | 'manual-approval'
  | 'incomplete'
  | 'loading'
  | 'error';

export interface VehicleRequirementsQuickSummary {
  minimumAgeLabel: string;
  licenseLabel: string;
  depositLabel: string;
  creditCardLabel: string;
  sourceLabel: string;
  statusKind: VehicleRequirementsStatusKind;
  statusLabel: string;
  cardStatus: VehicleOverviewCardStatus;
}


export function sourceDisplayLabel(
  source: RentalRuleSource | null,
  sourceName: string | null,
): string {
  return labelRuleSource(source, sourceName);
}

export function sourceInheritanceHint(
  source: RentalRuleSource | null,
  sourceName: string | null,
): string {
  return ruleSourceInheritanceHint(source, sourceName);
}

export function hasAnyVehicleOverride(effective: EffectiveRentalRulesDto | null): boolean {
  if (!effective) return false;
  const keys = [
    effective.minimumAgeYears,
    effective.depositAmount,
    effective.creditCardRequired,
    effective.foreignTravelPolicy,
    effective.manualApprovalRequired,
    effective.minimumLicenseHoldingYears,
  ] as EffectiveRuleField<unknown>[];
  return keys.some((f) => f.source === 'VEHICLE_OVERRIDE');
}

export function deriveRequirementsStatus(
  effective: EffectiveRentalRulesDto | null,
  requirements: VehicleRentalRequirementsDto | null,
  defaultsConfigured: boolean,
): VehicleRequirementsQuickSummary {
  if (!effective) {
    return {
      minimumAgeLabel: '—',
      licenseLabel: '—',
      depositLabel: '—',
      creditCardLabel: '—',
      sourceLabel: '—',
      statusKind: 'loading',
      statusLabel: 'Loading',
      cardStatus: 'neutral',
    };
  }

  const currency = effective.depositCurrency.value ?? 'EUR';
  const age = effective.minimumAgeYears.value;
  const license = formatLicenseHolding(
    effective.minimumLicenseHoldingMonths.value,
    effective.minimumLicenseHoldingYears.value,
  );
  const deposit = formatDeposit(
    effective.depositAmount.value ?? effective.depositAmountCents.value,
    currency,
  );
  const creditCard = formatBool(effective.creditCardRequired.value);

  const primarySource = effective.minimumAgeYears.source ?? effective.depositAmount.source;
  const sourceName = effective.minimumAgeYears.sourceName ?? effective.depositAmount.sourceName;
  let sourceLabel = sourceDisplayLabel(primarySource, sourceName);
  if (primarySource === 'CATEGORY' && sourceName) {
    sourceLabel = sourceName;
  }

  let statusKind: VehicleRequirementsStatusKind = 'active';
  let statusLabel = 'Rules active';
  let cardStatus: VehicleOverviewCardStatus = 'clear';

  if (!defaultsConfigured && !requirements?.rentalCategoryId) {
    statusKind = 'incomplete';
    statusLabel = 'Incomplete';
    cardStatus = 'attention';
  } else if (!requirements?.rentalCategoryId) {
    statusKind = 'missing-category';
    statusLabel = 'Missing category';
    cardStatus = 'attention';
  } else if (effective.manualApprovalRequired.value === true) {
    statusKind = 'manual-approval';
    statusLabel = 'Manual approval';
    cardStatus = 'attention';
  } else if (hasAnyVehicleOverride(effective)) {
    statusKind = 'vehicle-override';
    statusLabel = 'Override';
    cardStatus = 'active';
  } else if (!effective.rulesActive) {
    statusKind = 'incomplete';
    statusLabel = 'Inactive';
    cardStatus = 'neutral';
  }

  return {
    minimumAgeLabel: age != null ? `${age} yr` : '—',
    licenseLabel: license,
    depositLabel: deposit,
    creditCardLabel: creditCard,
    sourceLabel,
    statusKind,
    statusLabel,
    cardStatus,
  };
}

export interface EffectiveRequirementRow {
  key: string;
  label: string;
  value: string;
  source: RentalRuleSource | null;
  sourceName: string | null;
  inheritanceHint: string;
  isOverridden: boolean;
}

export function buildEffectiveRequirementRows(
  effective: EffectiveRentalRulesDto,
): EffectiveRequirementRow[] {
  const currency = effective.depositCurrency.value ?? 'EUR';
  const rows: Array<{
    key: string;
    label: string;
    field: EffectiveRuleField<unknown>;
    value: string;
  }> = [
    {
      key: 'minimumAgeYears',
      label: 'Minimum age',
      field: effective.minimumAgeYears,
      value: formatRuleValue('minimumAgeYears', effective.minimumAgeYears.value),
    },
    {
      key: 'minimumLicenseHoldingYears',
      label: 'License holding period',
      field: effective.minimumLicenseHoldingYears,
      value: formatLicenseHolding(
        effective.minimumLicenseHoldingMonths.value,
        effective.minimumLicenseHoldingYears.value,
        { long: true },
      ),
    },
    {
      key: 'depositAmount',
      label: 'Deposit required',
      field: effective.depositAmount,
      value: formatDeposit(
        effective.depositAmount.value ?? effective.depositAmountCents.value,
        currency,
      ),
    },
    {
      key: 'creditCardRequired',
      label: 'Credit card required',
      field: effective.creditCardRequired,
      value: formatBool(effective.creditCardRequired.value),
    },
    {
      key: 'foreignTravelPolicy',
      label: 'Foreign travel',
      field: effective.foreignTravelPolicy,
      value: labelPolicy(effective.foreignTravelPolicy.value),
    },
    {
      key: 'additionalDriverPolicy',
      label: 'Additional driver',
      field: effective.additionalDriverPolicy,
      value: labelPolicy(effective.additionalDriverPolicy.value),
    },
    {
      key: 'youngDriverPolicy',
      label: 'Young driver',
      field: effective.youngDriverPolicy,
      value: labelPolicy(effective.youngDriverPolicy.value),
    },
    {
      key: 'insuranceRequirement',
      label: 'Insurance',
      field: effective.insuranceRequirement,
      value: effective.insuranceRequirement.value?.trim() || '—',
    },
    {
      key: 'manualApprovalRequired',
      label: 'Manual approval',
      field: effective.manualApprovalRequired,
      value: formatBool(effective.manualApprovalRequired.value),
    },
    {
      key: 'notes',
      label: 'Notes',
      field: effective.notes,
      value: effective.notes.value?.trim() || '—',
    },
  ];

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    source: row.field.source,
    sourceName: row.field.sourceName,
    inheritanceHint: sourceInheritanceHint(row.field.source, row.field.sourceName),
    isOverridden: row.field.source === 'VEHICLE_OVERRIDE',
  }));
}

export function effectiveSourceSummary(effective: EffectiveRentalRulesDto): string {
  const sources = new Set(
    [
      effective.minimumAgeYears.source,
      effective.depositAmount.source,
      effective.creditCardRequired.source,
    ].filter(Boolean),
  );
  if (sources.has('VEHICLE_OVERRIDE')) return 'Includes vehicle-specific overrides';
  if (sources.has('CATEGORY') && effective.rentalCategoryName) {
    return `Primarily from ${effective.rentalCategoryName}`;
  }
  return 'Organization default rules';
}

export { labelRuleField };
