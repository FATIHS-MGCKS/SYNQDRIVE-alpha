const EXPECTED_STATION_SELECTABLE_STATUSES = ['ACTIVE'] as const;
import {
  EXPECTED_STATION_POLICY_VERSION,
  ExpectedStationClearReason,
  ExpectedStationOrigin,
  ExpectedStationPolicyIssueCode,
  ExpectedStationRequestChannel,
  ExpectedStationTransferStatus,
  type ClearExpectedStationPolicyInput,
  type ExpectedStationContextRef,
  type ExpectedStationOrigin as ExpectedStationOriginType,
  type ExpectedStationPolicyEvaluation,
  type ExpectedStationPolicyIssue,
  type ExpectedStationReconciliationEvaluation,
  type ExpectedStationSnapshot,
  type HomeMutationExpectedInvariantInput,
  type SetExpectedStationPolicyInput,
} from './expected-station.policy.types';

export * from './expected-station.policy.types';

export const EXPECTED_STATION_ORIGIN_PRIORITY: Record<ExpectedStationOriginType, number> = {
  [ExpectedStationOrigin.PLANNED_TRANSFER]: 400,
  [ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN]: 300,
  [ExpectedStationOrigin.PLANNED_REPOSITIONING]: 200,
  [ExpectedStationOrigin.OPERATIONAL_GOAL]: 100,
};

function issue(
  code: ExpectedStationPolicyIssue['code'],
  message: string,
): ExpectedStationPolicyIssue {
  return { code, message };
}

function denied(
  blockingReasons: ExpectedStationPolicyIssue[],
  partial?: Partial<ExpectedStationPolicyEvaluation>,
): ExpectedStationPolicyEvaluation {
  return {
    allowed: false,
    idempotent: false,
    blockingReasons,
    warnings: partial?.warnings ?? [],
  };
}

function allowed(
  partial?: Partial<ExpectedStationPolicyEvaluation>,
): ExpectedStationPolicyEvaluation {
  return {
    allowed: true,
    idempotent: partial?.idempotent ?? false,
    blockingReasons: [],
    warnings: partial?.warnings ?? [],
  };
}

export function getExpectedStationPolicyVersion(): typeof EXPECTED_STATION_POLICY_VERSION {
  return EXPECTED_STATION_POLICY_VERSION;
}

export function getExpectedStationOriginPriority(
  origin: ExpectedStationOriginType,
): number {
  return EXPECTED_STATION_ORIGIN_PRIORITY[origin];
}

export function hasExpectedStationContext(context: ExpectedStationContextRef): boolean {
  return Boolean(
    context.transferId?.trim() ||
      context.bookingId?.trim() ||
      context.reasonCode?.trim(),
  );
}

export function isActiveTransferExpectedContext(input: {
  origin: ExpectedStationOriginType;
  transferStatus?: ExpectedStationTransferStatus | null;
}): boolean {
  if (input.origin !== ExpectedStationOrigin.PLANNED_TRANSFER) {
    return false;
  }
  return (
    input.transferStatus === ExpectedStationTransferStatus.PLANNED ||
    input.transferStatus === ExpectedStationTransferStatus.READY ||
    input.transferStatus === ExpectedStationTransferStatus.IN_TRANSIT ||
    input.transferStatus === ExpectedStationTransferStatus.OVERDUE
  );
}

function validateOriginContext(
  origin: ExpectedStationOriginType,
  context: ExpectedStationContextRef,
): ExpectedStationPolicyIssue[] {
  const blockingReasons: ExpectedStationPolicyIssue[] = [];

  if (!hasExpectedStationContext(context)) {
    blockingReasons.push(
      issue(
        ExpectedStationPolicyIssueCode.CONTEXT_REQUIRED,
        'Expected station writes require transferId, bookingId, or reasonCode context.',
      ),
    );
    return blockingReasons;
  }

  if (origin === ExpectedStationOrigin.PLANNED_TRANSFER && !context.transferId?.trim()) {
    blockingReasons.push(
      issue(
        ExpectedStationPolicyIssueCode.CONTEXT_REQUIRED,
        'Planned transfer expected position requires transferId.',
      ),
    );
  }

  if (
    origin === ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN &&
    !context.bookingId?.trim()
  ) {
    blockingReasons.push(
      issue(
        ExpectedStationPolicyIssueCode.CONTEXT_REQUIRED,
        'Confirmed one-way return expected position requires bookingId.',
      ),
    );
  }

  if (
    origin === ExpectedStationOrigin.OPERATIONAL_GOAL &&
    !context.reasonCode?.trim()
  ) {
    blockingReasons.push(
      issue(
        ExpectedStationPolicyIssueCode.CONTEXT_REQUIRED,
        'Operational expected goals require an explicit reasonCode.',
      ),
    );
  }

  return blockingReasons;
}

function validateTargetStationStatus(
  targetStationStatus?: string | null,
): ExpectedStationPolicyIssue[] {
  if (!targetStationStatus) {
    return [];
  }

  if (targetStationStatus === 'ARCHIVED') {
    return [
      issue(
        ExpectedStationPolicyIssueCode.TARGET_STATION_ARCHIVED,
        'Archived stations cannot be assigned as expected destination.',
      ),
    ];
  }

  if (
    !EXPECTED_STATION_SELECTABLE_STATUSES.includes(
      targetStationStatus as (typeof EXPECTED_STATION_SELECTABLE_STATUSES)[number],
    )
  ) {
    return [
      issue(
        ExpectedStationPolicyIssueCode.TARGET_STATION_INACTIVE,
        'Inactive stations cannot be assigned as expected destination.',
      ),
    ];
  }

  return [];
}

function isSameExpectedAssignment(
  existing: ExpectedStationSnapshot,
  input: SetExpectedStationPolicyInput,
): boolean {
  return (
    existing.expectedStationId === input.targetStationId &&
    existing.expectedStationSource === input.origin
  );
}

export function evaluateHomeMutationExpectedInvariant(
  input: HomeMutationExpectedInvariantInput,
): ExpectedStationPolicyEvaluation {
  if (
    input.touchesExpectedStationId ||
    input.touchesExpectedStationSource ||
    input.touchesExpectedStationSetAt
  ) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.HOME_MUTATION_MUST_NOT_TOUCH_EXPECTED,
        'Home station mutations must not modify expected station fields.',
      ),
    ]);
  }

  return allowed();
}

export function evaluateSetExpectedStationPolicy(
  input: SetExpectedStationPolicyInput,
): ExpectedStationPolicyEvaluation {
  if (!input.origin) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.SOURCE_REQUIRED,
        'Expected station source/origin is required.',
      ),
    ]);
  }

  if (input.requestChannel === ExpectedStationRequestChannel.UI_DIRECT_FIELD) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.UI_DIRECT_FIELD_FORBIDDEN,
        'Expected station cannot be changed via arbitrary UI field edits.',
      ),
    ]);
  }

  const parsedSetAt =
    input.sourceSetAt instanceof Date
      ? input.sourceSetAt
      : new Date(input.sourceSetAt);
  if (Number.isNaN(parsedSetAt.getTime())) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.TIMESTAMP_REQUIRED,
        'Expected station sourceSetAt must be a valid timestamp.',
      ),
    ]);
  }

  const blockingReasons = [
    ...validateOriginContext(input.origin, input.context),
    ...validateTargetStationStatus(input.targetStationStatus ?? null),
  ];
  if (blockingReasons.length > 0) {
    return denied(blockingReasons);
  }

  const existing = input.existing;
  if (existing && isSameExpectedAssignment(existing, input)) {
    return allowed({ idempotent: true });
  }

  if (existing?.expectedStationId && existing.expectedStationSource) {
    const existingOrigin = existing.expectedStationSource as ExpectedStationOriginType;
    const existingPriority = getExpectedStationOriginPriority(existingOrigin);
    const incomingPriority = getExpectedStationOriginPriority(input.origin);

    if (
      isActiveTransferExpectedContext({
        origin: existingOrigin,
        transferStatus: existing.context?.transferStatus,
      }) &&
      incomingPriority < existingPriority
    ) {
      return denied([
        issue(
          ExpectedStationPolicyIssueCode.ACTIVE_TRANSFER_PRIORITY,
          'An active transfer expected position cannot be overridden by a lower-priority origin.',
        ),
      ]);
    }

    if (incomingPriority < existingPriority) {
      return denied([
        issue(
          ExpectedStationPolicyIssueCode.LOWER_PRIORITY_CONFLICT,
          'Incoming expected origin has lower priority than the current expected context.',
        ),
      ]);
    }
  }

  return allowed();
}

export function evaluateClearExpectedStationPolicy(
  input: ClearExpectedStationPolicyInput,
): ExpectedStationPolicyEvaluation {
  if (input.requestChannel === ExpectedStationRequestChannel.UI_DIRECT_FIELD) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.UI_DIRECT_FIELD_FORBIDDEN,
        'Expected station cannot be cleared via arbitrary UI field edits.',
      ),
    ]);
  }

  if (!input.clearReason) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.CLEAR_REASON_REQUIRED,
        'Clearing expected station requires an explicit reason.',
      ),
    ]);
  }

  const clearedAt =
    input.clearedAt instanceof Date ? input.clearedAt : new Date(input.clearedAt);
  if (Number.isNaN(clearedAt.getTime())) {
    return denied([
      issue(
        ExpectedStationPolicyIssueCode.TIMESTAMP_REQUIRED,
        'Expected station clear timestamp must be valid.',
      ),
    ]);
  }

  if (!input.expectedStationId) {
    return allowed({ idempotent: true });
  }

  if (input.clearReason === ExpectedStationClearReason.DESTINATION_REACHED) {
    const arrivalStationId =
      input.actualArrivalStationId ?? input.currentStationId ?? null;
    if (!arrivalStationId || arrivalStationId !== input.expectedStationId) {
      return denied([
        issue(
          ExpectedStationPolicyIssueCode.DESTINATION_NOT_FULFILLED,
          'Expected station can only be cleared after the destination has been reached.',
        ),
      ]);
    }
  }

  return allowed();
}

export function evaluateStaleExpectedStationReconciliation(input: {
  snapshot: ExpectedStationSnapshot;
  contextStillValid: boolean;
}): ExpectedStationReconciliationEvaluation {
  if (!input.snapshot.expectedStationId) {
    return {
      stale: false,
      recommendedAction: 'NONE',
      blockingReasons: [],
    };
  }

  if (input.contextStillValid) {
    return {
      stale: false,
      recommendedAction: 'NONE',
      blockingReasons: [],
    };
  }

  return {
    stale: true,
    recommendedAction: 'MARK_FOR_RECONCILIATION',
    blockingReasons: [
      issue(
        ExpectedStationPolicyIssueCode.STALE_CONTEXT_RECONCILIATION_ONLY,
        'Stale expected position without valid context must be marked via reconciliation, not silently cleared.',
      ),
    ],
  };
}

export function shouldRejectStaleExpectedAutoClear(
  reconciliation: ExpectedStationReconciliationEvaluation,
): boolean {
  return reconciliation.stale && reconciliation.recommendedAction === 'MARK_FOR_RECONCILIATION';
}
