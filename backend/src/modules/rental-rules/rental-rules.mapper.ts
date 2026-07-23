import type {
  OrganizationRentalRules,
  RentalVehicleCategory,
  RentalVehicleCategoryStatus,
  VehicleRentalRequirementOverride,
} from '@prisma/client';
import type { RentalRuleFieldSet } from './rental-rules.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';
import { licenseHoldingMonthsFromYearsAlias, splitLicenseHoldingMonths } from './license-holding.util';

type RuleRow =
  | OrganizationRentalRules
  | RentalVehicleCategory
  | VehicleRentalRequirementOverride;

export function extractRuleFields(row: Partial<RuleRow>): Partial<RentalRuleFieldSet> {
  return {
    minimumAgeYears: row.minimumAgeYears ?? null,
    minimumLicenseHoldingMonths: row.minimumLicenseHoldingMonths ?? null,
    depositAmountCents: row.depositAmountCents ?? null,
    depositCurrency: row.depositCurrency ?? null,
    creditCardRequired: row.creditCardRequired ?? null,
    foreignTravelPolicy: row.foreignTravelPolicy ?? null,
    additionalDriverPolicy: row.additionalDriverPolicy ?? null,
    youngDriverPolicy: row.youngDriverPolicy ?? null,
    insuranceRequirement: row.insuranceRequirement ?? null,
    manualApprovalRequired: row.manualApprovalRequired ?? null,
    notes: row.notes ?? null,
  };
}

export function hasActiveRuleOverrides(fields: Partial<RentalRuleFieldSet>): boolean {
  return RENTAL_RULE_FIELD_KEYS.some((key) => fields[key] != null);
}

export function formatOrganizationRentalRules(row: OrganizationRentalRules) {
  const base = {
    id: row.id,
    organizationId: row.organizationId,
    ...extractRuleFields(row),
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return {
    ...base,
    depositAmount: base.depositAmountCents,
    ...licenseHoldingDisplayFields(base.minimumLicenseHoldingMonths),
  };
}

function licenseHoldingDisplayFields(months: number | null | undefined) {
  if (months == null) {
    return {
      minimumLicenseHoldingYears: null,
      minimumLicenseHoldingRemainderMonths: null,
    };
  }
  const { wholeYears, extraMonths } = splitLicenseHoldingMonths(months);
  return {
    minimumLicenseHoldingYears: wholeYears,
    minimumLicenseHoldingRemainderMonths: extraMonths,
  };
}

export function formatRentalVehicleCategory(row: RentalVehicleCategory & { _count?: { vehicles: number } }) {
  const fields = extractRuleFields(row);
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    type: row.type,
    color: row.color,
    icon: row.icon,
    ...fields,
    depositAmount: fields.depositAmountCents,
    ...licenseHoldingDisplayFields(fields.minimumLicenseHoldingMonths ?? null),
    isActive: row.isActive,
    status: row.status,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    vehicleCount: row._count?.vehicles,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatVehicleRentalOverride(row: VehicleRentalRequirementOverride) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    version: row.version,
    ...extractRuleFields(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function vehicleDisplayName(vehicle: {
  vehicleName?: string | null;
  make: string;
  model: string;
  licensePlate?: string | null;
}): string {
  return (
    vehicle.vehicleName?.trim() ||
    [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim() ||
    vehicle.licensePlate ||
    'Vehicle'
  );
}

type RentalRuleFieldsInput = Partial<RentalRuleFieldSet> & {
  isActive?: boolean;
  minimumLicenseHoldingYears?: number | null;
  depositAmount?: number | null;
};

/** Normalize API aliases before persistence (months/years, depositAmount). */
export function normalizeRuleDtoInput<T extends RentalRuleFieldsInput>(
  dto: T,
): T & Partial<Pick<RentalRuleFieldSet, 'minimumLicenseHoldingMonths' | 'depositAmountCents'>> {
  const normalized = { ...dto };
  if (
    normalized.minimumLicenseHoldingMonths === undefined &&
    normalized.minimumLicenseHoldingYears != null
  ) {
    normalized.minimumLicenseHoldingMonths = licenseHoldingMonthsFromYearsAlias(
      normalized.minimumLicenseHoldingYears,
    );
  }
  if (normalized.depositAmountCents === undefined && normalized.depositAmount != null) {
    normalized.depositAmountCents = normalized.depositAmount;
  }
  for (const key of ['insuranceRequirement', 'notes', 'depositCurrency'] as const) {
    const value = normalized[key];
    if (typeof value === 'string' && value.trim() === '') {
      (normalized as Record<string, unknown>)[key] = null;
    }
  }
  return normalized;
}

export type RentalRulePersistenceLayer = 'organization' | 'category' | 'vehicleOverride';

const RULE_PATCH_KEYS = [
  'minimumAgeYears',
  'minimumLicenseHoldingMonths',
  'depositAmountCents',
  'depositCurrency',
  'creditCardRequired',
  'foreignTravelPolicy',
  'additionalDriverPolicy',
  'youngDriverPolicy',
  'insuranceRequirement',
  'manualApprovalRequired',
  'notes',
] as const satisfies readonly (keyof RentalRuleFieldSet)[];

export function pickRulePatch<T extends RentalRuleFieldsInput>(dto: T): Partial<RentalRuleFieldSet> & { isActive?: boolean } {
  const normalized = normalizeRuleDtoInput(dto);
  const patch: Record<string, unknown> = {};
  const keys = [...RULE_PATCH_KEYS, 'isActive'] as const;
  for (const key of keys) {
    if (key in normalized && (normalized as Record<string, unknown>)[key] !== undefined) {
      patch[key] = (normalized as Record<string, unknown>)[key];
    }
  }
  return patch as Partial<RentalRuleFieldSet> & { isActive?: boolean };
}

export function toPrismaRuleColumns(
  patch: Partial<RentalRuleFieldSet> & { isActive?: boolean },
  options: { layer: RentalRulePersistenceLayer } = { layer: 'organization' },
) {
  const allowed = new Set<string>([...RULE_PATCH_KEYS, 'isActive']);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || value === undefined) continue;
    if (key === 'depositCurrency' && value === null && options.layer === 'organization') {
      continue;
    }
    data[key] = value;
  }
  return data;
}

export function prismaRuleColumns(
  patch: Partial<RentalRuleFieldSet> & { isActive?: boolean },
  options: { layer: RentalRulePersistenceLayer } = { layer: 'category' },
) {
  const data = toPrismaRuleColumns(patch, options);
  delete data.isActive;
  return data;
}
