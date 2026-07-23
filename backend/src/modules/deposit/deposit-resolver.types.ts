import type { RentalRuleSource } from '@modules/rental-rules/rental-rules.types';

export const DEPOSIT_SOURCE = {
  ORGANIZATION_MINIMUM: 'ORGANIZATION_MINIMUM',
  CATEGORY_MINIMUM: 'CATEGORY_MINIMUM',
  VEHICLE_OVERRIDE_MINIMUM: 'VEHICLE_OVERRIDE_MINIMUM',
  TARIFF_RATE: 'TARIFF_RATE',
  MANUAL_OVERRIDE_APPROVED: 'MANUAL_OVERRIDE_APPROVED',
} as const;

export type DepositSource = (typeof DEPOSIT_SOURCE)[keyof typeof DEPOSIT_SOURCE];

export interface DepositFloorLayer {
  source: RentalRuleSource;
  sourceName: string;
  sourceEntityId: string;
  amountCents: number;
  currency: string;
}

export interface DepositTariffLayer {
  amountCents: number;
  currency: string;
  tariffRateId: string;
  tariffVersionId: string;
}

export interface DepositManualOverrideInput {
  amountCents: number;
  currency: string;
  approvedByUserId: string;
  approvalReferenceId: string;
  reason: string;
}

export interface DepositResolverInput {
  pricingCurrency: string;
  rentalRulesFloor: DepositFloorLayer | null;
  tariffDeposit: DepositTariffLayer;
  manualOverride?: DepositManualOverrideInput | null;
  calculatedAt?: Date;
}

export interface ResolvedDeposit {
  amount: number;
  currency: string;
  source: DepositSource;
  ruleRevisionId: string | null;
  reason: string;
  manualOverride: boolean;
  calculatedAt: string;
  components: {
    rentalRulesFloorCents: number | null;
    tariffDepositCents: number;
    effectiveMinimumCents: number;
    raisedToMinimum: boolean;
  };
}

export interface DepositEntityIds {
  organizationRulesId: string | null;
  categoryId: string | null;
  vehicleOverrideId: string | null;
}
