import type { RentalRuleRevisionScopeType } from '@prisma/client';

export interface RentalRuleRevisionScope {
  organizationId: string;
  scopeType: RentalRuleRevisionScopeType;
  scopeId: string;
}

export function organizationRevisionScope(organizationId: string): RentalRuleRevisionScope {
  return {
    organizationId,
    scopeType: 'ORGANIZATION',
    scopeId: organizationId,
  };
}

export function categoryRevisionScope(
  organizationId: string,
  categoryId: string,
): RentalRuleRevisionScope {
  return {
    organizationId,
    scopeType: 'CATEGORY',
    scopeId: categoryId,
  };
}

export function vehicleRevisionScope(
  organizationId: string,
  vehicleId: string,
): RentalRuleRevisionScope {
  return {
    organizationId,
    scopeType: 'VEHICLE',
    scopeId: vehicleId,
  };
}
