import type { RentalRuleRevisionScopeType } from '@prisma/client';
import type { RentalRuleRevisionDiffResult } from './rental-rules-revision-diff.util';

export const RENTAL_RULE_CRITICAL_CHANGE_CODES = {
  ORG_RULES_DEACTIVATED: 'ORG_RULES_DEACTIVATED',
  ORG_RULES_ACTIVATED: 'ORG_RULES_ACTIVATED',
  MANUAL_APPROVAL_ENABLED: 'MANUAL_APPROVAL_ENABLED',
  MANUAL_APPROVAL_DISABLED: 'MANUAL_APPROVAL_DISABLED',
  DEPOSIT_INCREASED: 'DEPOSIT_INCREASED',
  MINIMUM_AGE_INCREASED: 'MINIMUM_AGE_INCREASED',
  CONFIRMED_BOOKINGS_AFFECTED: 'CONFIRMED_BOOKINGS_AFFECTED',
  PENDING_APPROVALS_AFFECTED: 'PENDING_APPROVALS_AFFECTED',
} as const;

export type RentalRuleCriticalChangeCode =
  (typeof RENTAL_RULE_CRITICAL_CHANGE_CODES)[keyof typeof RENTAL_RULE_CRITICAL_CHANGE_CODES];

export interface RentalRuleAffectedScopes {
  categories: Array<{ id: string; name: string; vehicleCount: number }>;
  vehicles: Array<{
    id: string;
    displayName: string;
    licensePlate: string | null;
    rentalCategoryId: string | null;
    rentalCategoryName: string | null;
  }>;
  vehicleOverrides: Array<{
    vehicleId: string;
    displayName: string;
    licensePlate: string | null;
  }>;
  vehiclesWithoutCategory: Array<{
    id: string;
    displayName: string;
    licensePlate: string | null;
  }>;
}

export interface RentalRuleBookingImpactBucket {
  count: number;
  bookingIds: string[];
}

export interface RentalRuleBookingImpact {
  wizardDraft: RentalRuleBookingImpactBucket;
  pending: RentalRuleBookingImpactBucket;
  confirmed: RentalRuleBookingImpactBucket;
  /** Informational only — confirmed bookings are never mutated by publish. */
  confirmedBookingsUnchanged: true;
}

export interface RentalRuleManualApprovalImpact {
  pendingApprovalCount: number;
  approvalIds: string[];
  bookingIds: string[];
}

export interface RentalRuleCriticalImpactAssessment {
  isCritical: boolean;
  requiresAcknowledgement: boolean;
  codes: RentalRuleCriticalChangeCode[];
  messages: string[];
}

export function assessCriticalRuleChanges(input: {
  diff: RentalRuleRevisionDiffResult;
  bookingImpact: RentalRuleBookingImpact;
  manualApprovalImpact: RentalRuleManualApprovalImpact;
}): RentalRuleCriticalImpactAssessment {
  const codes = new Set<RentalRuleCriticalChangeCode>();
  const messages: string[] = [];

  const isActiveMeta = input.diff.scopeMetaChanges.find((row) => row.key === 'isActive');
  if (isActiveMeta?.newValue === false) {
    codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.ORG_RULES_DEACTIVATED);
    messages.push('Organization rental rules will be deactivated for enforcement.');
  }
  if (isActiveMeta?.newValue === true && isActiveMeta.previousValue === false) {
    codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.ORG_RULES_ACTIVATED);
    messages.push('Organization rental rules will be activated for enforcement.');
  }

  for (const row of [...input.diff.addedRules, ...input.diff.changedRules]) {
    if (row.field === 'manualApprovalRequired' && row.newValue === true) {
      codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.MANUAL_APPROVAL_ENABLED);
      messages.push('Manual approval will be required for affected rentals.');
    }
    if (row.field === 'manualApprovalRequired' && row.newValue === false && row.previousValue === true) {
      codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.MANUAL_APPROVAL_DISABLED);
      messages.push('Manual approval requirement will be removed.');
    }
    if (
      row.field === 'depositAmountCents' &&
      typeof row.previousValue === 'number' &&
      typeof row.newValue === 'number' &&
      row.newValue > row.previousValue
    ) {
      codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.DEPOSIT_INCREASED);
      messages.push('Deposit requirement increases for the published scope.');
    }
    if (
      row.field === 'minimumAgeYears' &&
      typeof row.previousValue === 'number' &&
      typeof row.newValue === 'number' &&
      row.newValue > row.previousValue
    ) {
      codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.MINIMUM_AGE_INCREASED);
      messages.push('Minimum driver age increases for the published scope.');
    }
  }

  if (input.bookingImpact.confirmed.count > 0) {
    codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.CONFIRMED_BOOKINGS_AFFECTED);
    messages.push(
      `${input.bookingImpact.confirmed.count} confirmed booking(s) may no longer match published rules; existing bookings are not changed automatically.`,
    );
  }

  if (input.manualApprovalImpact.pendingApprovalCount > 0) {
    codes.add(RENTAL_RULE_CRITICAL_CHANGE_CODES.PENDING_APPROVALS_AFFECTED);
    messages.push(
      `${input.manualApprovalImpact.pendingApprovalCount} pending manual approval(s) may need re-evaluation after publish.`,
    );
  }

  const codeList = [...codes];
  return {
    isCritical: codeList.length > 0,
    requiresAcknowledgement: codeList.length > 0,
    codes: codeList,
    messages,
  };
}

export function resolveRevisionBlastRadius(scopeType: RentalRuleRevisionScopeType): {
  includesAllVehicles: boolean;
  includesAllCategories: boolean;
  directVehicleId: string | null;
  directCategoryId: string | null;
} {
  switch (scopeType) {
    case 'ORGANIZATION':
      return {
        includesAllVehicles: true,
        includesAllCategories: true,
        directVehicleId: null,
        directCategoryId: null,
      };
    case 'CATEGORY':
      return {
        includesAllVehicles: false,
        includesAllCategories: false,
        directVehicleId: null,
        directCategoryId: null,
      };
    case 'VEHICLE':
      return {
        includesAllVehicles: false,
        includesAllCategories: false,
        directVehicleId: null,
        directCategoryId: null,
      };
    default:
      return {
        includesAllVehicles: false,
        includesAllCategories: false,
        directVehicleId: null,
        directCategoryId: null,
      };
  }
}
