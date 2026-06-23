import type {
  OrganizationRentalRules,
  RentalVehicleCategory,
  VehicleRentalRequirementOverride,
} from '@prisma/client';
import type { RentalRuleFieldSet } from './rental-rules.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return {
    ...base,
    depositAmount: base.depositAmountCents,
    minimumLicenseHoldingYears:
      base.minimumLicenseHoldingMonths != null
        ? Math.round(base.minimumLicenseHoldingMonths / 12)
        : null,
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
    minimumLicenseHoldingYears:
      fields.minimumLicenseHoldingMonths != null
        ? Math.round(fields.minimumLicenseHoldingMonths / 12)
        : null,
    isActive: row.isActive,
    vehicleCount: row._count?.vehicles,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatVehicleRentalOverride(row: VehicleRentalRequirementOverride) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
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
    normalized.minimumLicenseHoldingMonths = normalized.minimumLicenseHoldingYears * 12;
  }
  if (normalized.depositAmountCents === undefined && normalized.depositAmount != null) {
    normalized.depositAmountCents = normalized.depositAmount;
  }
  return normalized;
}

export function pickRulePatch<T extends RentalRuleFieldsInput>(dto: T): Partial<RentalRuleFieldSet> & { isActive?: boolean } {
  const normalized = normalizeRuleDtoInput(dto);
  const patch: Record<string, unknown> = {};
  const keys = [
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
    'isActive',
  ] as const;
  for (const key of keys) {
    if (key in normalized && (normalized as Record<string, unknown>)[key] !== undefined) {
      patch[key] = (normalized as Record<string, unknown>)[key];
    }
  }
  return patch as Partial<RentalRuleFieldSet> & { isActive?: boolean };
}

export function prismaRuleColumns(patch: Record<string, unknown>) {
  const keys = [
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
  ] as const;
  const cols: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in patch) cols[key] = patch[key];
  }
  return cols;
}
