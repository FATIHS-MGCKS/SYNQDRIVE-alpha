import type { Prisma, RentalVehicleCategoryType } from '@prisma/client';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import { prismaRuleColumns } from './rental-rules.mapper';
import type { RentalRuleFieldSet } from './rental-rules.types';

function revisionRules(document: NormalizedRentalRulesDocument): Partial<RentalRuleFieldSet> {
  return document.rules as Partial<RentalRuleFieldSet>;
}

export function organizationRevisionToLiveData(
  document: NormalizedRentalRulesDocument,
): Prisma.OrganizationRentalRulesUpdateInput {
  const isActive =
    typeof document.scopeMeta.isActive === 'boolean' ? document.scopeMeta.isActive : true;
  return {
    ...prismaRuleColumns(revisionRules(document), { layer: 'organization' }),
    isActive,
  };
}

export function categoryRevisionToLiveData(
  document: NormalizedRentalRulesDocument,
): Prisma.RentalVehicleCategoryUpdateInput {
  const data: Prisma.RentalVehicleCategoryUpdateInput = {
    ...prismaRuleColumns(revisionRules(document), { layer: 'category' }),
  };
  if (typeof document.scopeMeta.name === 'string') {
    data.name = document.scopeMeta.name;
  }
  if (document.scopeMeta.type !== undefined) {
    data.type = (document.scopeMeta.type as RentalVehicleCategoryType | null) ?? null;
  }
  if (typeof document.scopeMeta.description === 'string' || document.scopeMeta.description === null) {
    data.description = document.scopeMeta.description as string | null;
  }
  if (typeof document.scopeMeta.color === 'string' || document.scopeMeta.color === null) {
    data.color = document.scopeMeta.color as string | null;
  }
  if (typeof document.scopeMeta.icon === 'string' || document.scopeMeta.icon === null) {
    data.icon = document.scopeMeta.icon as string | null;
  }
  return data;
}

export function vehicleRevisionToLiveData(
  document: NormalizedRentalRulesDocument,
): Prisma.VehicleRentalRequirementOverrideUpdateInput {
  return prismaRuleColumns(revisionRules(document), { layer: 'vehicleOverride' });
}
