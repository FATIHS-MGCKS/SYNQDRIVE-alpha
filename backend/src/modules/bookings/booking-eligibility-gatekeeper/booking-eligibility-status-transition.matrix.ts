import type { BookingStatus } from '@prisma/client';
import type {
  BookingEligibilityGateStage,
  BookingEligibilityGateStatus,
} from './booking-eligibility-gatekeeper.types';
import type { BookingEligibilityTransitionPolicyMode } from './booking-eligibility-transition.policy';

/** Canonical booking lifecycle statuses in Prisma — no READY_FOR_PICKUP / PICKED_UP aliases. */
export const BOOKING_ELIGIBILITY_LIFECYCLE_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const satisfies readonly BookingStatus[];

export type BookingEligibilityLifecycleStatus =
  (typeof BOOKING_ELIGIBILITY_LIFECYCLE_STATUSES)[number];

export type BookingEligibilityTransitionSource =
  | BookingStatus
  | 'DRAFT';

export type BookingEligibilityInvalidationFact =
  | 'customer'
  | 'vehicle'
  | 'period'
  | 'document_status'
  | 'license_validity'
  | 'rule_revision'
  | 'additional_drivers'
  | 'foreign_travel'
  | 'deposit_payment';

export type BookingEligibilityTransitionDecision = {
  allowed: boolean;
  enforceEligibility: boolean;
  policyMode: BookingEligibilityTransitionPolicyMode | null;
  gateStage: BookingEligibilityGateStage | null;
  invalidatesPriorDecision: boolean;
  reason?: string;
};

export type BookingEligibilityMutationFlags = {
  customerIdChanged?: boolean;
  vehicleIdChanged?: boolean;
  datesChanged?: boolean;
  paymentIntentChanged?: boolean;
  extrasChanged?: boolean;
  additionalDriversChanged?: boolean;
  statusChanged?: boolean;
};

const TERMINAL_STATUSES = new Set<BookingStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const ENFORCED_TARGET_MODES: Partial<
  Record<BookingStatus, BookingEligibilityTransitionPolicyMode>
> = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
};

function gateStageForMode(
  mode: BookingEligibilityTransitionPolicyMode,
): BookingEligibilityGateStage {
  if (mode === 'CONFIRMED') return 'CONFIRM';
  if (mode === 'ACTIVE') return 'PICKUP';
  return 'CREATE';
}

function hasInvalidatingMutation(flags: BookingEligibilityMutationFlags): boolean {
  return Boolean(
    flags.customerIdChanged ||
      flags.vehicleIdChanged ||
      flags.datesChanged ||
      flags.paymentIntentChanged ||
      flags.extrasChanged ||
      flags.additionalDriversChanged ||
      flags.statusChanged,
  );
}

export function listInvalidationFactsFromMutation(
  flags: BookingEligibilityMutationFlags,
): BookingEligibilityInvalidationFact[] {
  const facts: BookingEligibilityInvalidationFact[] = [];
  if (flags.customerIdChanged) {
    facts.push('customer', 'document_status', 'license_validity');
  }
  if (flags.vehicleIdChanged) facts.push('vehicle', 'rule_revision');
  if (flags.datesChanged) facts.push('period', 'license_validity', 'rule_revision');
  if (flags.paymentIntentChanged) facts.push('deposit_payment');
  if (flags.extrasChanged) facts.push('foreign_travel', 'rule_revision');
  if (flags.additionalDriversChanged) facts.push('additional_drivers', 'rule_revision');
  if (flags.statusChanged) facts.push('rule_revision');
  return [...new Set(facts)];
}

export function resolveBookingEligibilityTransition(input: {
  from: BookingEligibilityTransitionSource;
  to: BookingStatus;
  isWizardDraft?: boolean;
  mutation?: BookingEligibilityMutationFlags;
}): BookingEligibilityTransitionDecision {
  const mutation = input.mutation ?? {};
  const isWizardDraft = input.isWizardDraft === true;

  if (input.from === 'DRAFT' && input.to === 'PENDING' && isWizardDraft) {
    return {
      allowed: true,
      enforceEligibility: false,
      policyMode: 'DRAFT',
      gateStage: null,
      invalidatesPriorDecision: false,
    };
  }

  if (TERMINAL_STATUSES.has(input.from as BookingStatus) && !mutation.statusChanged) {
    return {
      allowed: true,
      enforceEligibility: false,
      policyMode: null,
      gateStage: null,
      invalidatesPriorDecision: false,
      reason: 'Terminal booking — only note updates bypass eligibility enforcement.',
    };
  }

  if (input.to === 'CANCELLED' || input.to === 'NO_SHOW' || input.to === 'COMPLETED') {
    return {
      allowed: true,
      enforceEligibility: false,
      policyMode: null,
      gateStage: null,
      invalidatesPriorDecision: false,
    };
  }

  if (input.from === 'CONFIRMED' && input.to === 'ACTIVE') {
    return {
      allowed: true,
      enforceEligibility: true,
      policyMode: 'ACTIVE',
      gateStage: 'PICKUP',
      invalidatesPriorDecision: true,
      reason: 'Pickup requires fresh PICKUP-stage gatekeeper evaluation.',
    };
  }

  if (input.to === 'ACTIVE' && input.from !== 'CONFIRMED') {
    return {
      allowed: false,
      enforceEligibility: true,
      policyMode: 'ACTIVE',
      gateStage: 'PICKUP',
      invalidatesPriorDecision: true,
      reason: 'ACTIVE requires CONFIRMED source status and pickup handover.',
    };
  }

  const policyMode = ENFORCED_TARGET_MODES[input.to];
  if (!policyMode) {
    return {
      allowed: false,
      enforceEligibility: false,
      policyMode: null,
      gateStage: null,
      invalidatesPriorDecision: false,
      reason: `Unsupported target status ${input.to}`,
    };
  }

  const gateStage = gateStageForMode(policyMode);
  const invalidatesPriorDecision = hasInvalidatingMutation(mutation);

  if (policyMode === 'PENDING' && isWizardDraft) {
    return {
      allowed: true,
      enforceEligibility: false,
      policyMode: 'DRAFT',
      gateStage: null,
      invalidatesPriorDecision: false,
    };
  }

  const enforceOnStatusChange = mutation.statusChanged === true;
  const enforceOnMutation =
    policyMode === 'CONFIRMED' || policyMode === 'PENDING'
      ? hasInvalidatingMutation(mutation)
      : false;

  return {
    allowed: true,
    enforceEligibility: enforceOnStatusChange || enforceOnMutation,
    policyMode,
    gateStage,
    invalidatesPriorDecision,
  };
}

export function shouldEnforceBookingEligibilityForUpdate(input: {
  existingStatus: BookingStatus;
  targetStatus: BookingStatus;
  isWizardDraft: boolean;
  mutation: BookingEligibilityMutationFlags;
}): boolean {
  const decision = resolveBookingEligibilityTransition({
    from: input.existingStatus,
    to: input.targetStatus,
    isWizardDraft: input.isWizardDraft,
    mutation: input.mutation,
  });
  return decision.enforceEligibility;
}

export function gateStatusAllowsTransition(
  status: BookingEligibilityGateStatus,
  mode: BookingEligibilityTransitionPolicyMode,
): boolean {
  switch (mode) {
    case 'DRAFT':
      return true;
    case 'PENDING':
      return (
        status === 'ELIGIBLE' ||
        status === 'MANUAL_APPROVAL_REQUIRED' ||
        status === 'MISSING_INFORMATION'
      );
    case 'CONFIRMED':
    case 'ACTIVE':
      return status === 'ELIGIBLE' || status === 'MANUAL_APPROVAL_REQUIRED';
    default:
      return false;
  }
}

export function buildBookingEligibilityTransitionMatrix(): Array<{
  from: BookingEligibilityTransitionSource;
  to: BookingStatus;
  decision: BookingEligibilityTransitionDecision;
}> {
  const sources: BookingEligibilityTransitionSource[] = [
    'DRAFT',
    'PENDING',
    'CONFIRMED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ];
  const targets: BookingStatus[] = [
    'PENDING',
    'CONFIRMED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ];

  const rows: Array<{
    from: BookingEligibilityTransitionSource;
    to: BookingStatus;
    decision: BookingEligibilityTransitionDecision;
  }> = [];

  for (const from of sources) {
    for (const to of targets) {
      if (from === to) continue;
      rows.push({
        from,
        to,
        decision: resolveBookingEligibilityTransition({
          from,
          to,
          mutation: { statusChanged: true },
        }),
      });
    }
  }

  return rows;
}
