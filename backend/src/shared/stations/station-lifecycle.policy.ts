/**
 * Pure Stations V2 lifecycle policy (Prompt 15).
 * Evaluates allowed transitions, invariants, and command outcomes without I/O.
 */
import { StationStatus } from '@prisma/client';
import {
  StationLifecycleCommand,
  StationLifecycleContext,
  StationLifecycleEvaluation,
  StationLifecycleEvaluationInput,
  StationLifecycleMutations,
  StationLifecycleReason,
  StationLifecycleReasonCode,
  StationLifecycleRequiredAction,
  StationLifecycleRequiredActionCode,
  StationLifecycleSnapshot,
  StationLifecycleWarning,
  StationLifecycleWarningCode,
} from './station-lifecycle.policy.types';

export * from './station-lifecycle.policy.types';

export const STATION_LIFECYCLE_STATUSES: readonly StationStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
];

/** Explicit lifecycle transitions — not via generic PATCH (R1). */
export const STATION_STATUS_TRANSITIONS: Readonly<
  Record<StationStatus, readonly StationStatus[]>
> = {
  ACTIVE: ['INACTIVE', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export const SELECTABLE_BOOKING_STATION_STATUSES: readonly StationStatus[] = ['ACTIVE'];

function reason(
  code: StationLifecycleReasonCode,
  message: string,
): StationLifecycleReason {
  return { code, message };
}

function warning(
  code: StationLifecycleWarningCode,
  message: string,
): StationLifecycleWarning {
  return { code, message };
}

function requiredAction(
  code: StationLifecycleRequiredActionCode,
  message: string,
): StationLifecycleRequiredAction {
  return { code, message };
}

function denied(
  blockingReasons: StationLifecycleReason[],
  partial?: Partial<StationLifecycleEvaluation>,
): StationLifecycleEvaluation {
  return {
    allowed: false,
    blockingReasons,
    warnings: partial?.warnings ?? [],
    requiredActions: partial?.requiredActions ?? [],
    enforcedMutations: partial?.enforcedMutations,
  };
}

function allowed(
  partial?: Partial<StationLifecycleEvaluation>,
): StationLifecycleEvaluation {
  return {
    allowed: true,
    blockingReasons: [],
    warnings: partial?.warnings ?? [],
    requiredActions: partial?.requiredActions ?? [],
    enforcedMutations: partial?.enforcedMutations,
  };
}

export function isAllowedStatusTransition(
  from: StationStatus,
  to: StationStatus,
): boolean {
  if (from === to) return true;
  return (STATION_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export function assertArchivedInvariants(
  station: StationLifecycleSnapshot,
): StationLifecycleReason[] {
  if (station.status !== 'ARCHIVED') return [];

  const violations: StationLifecycleReason[] = [];
  if (station.isPrimary) {
    violations.push(
      reason(
        StationLifecycleReasonCode.ARCHIVED_INVARIANT_VIOLATION,
        'Archived stations must not remain primary (R2).',
      ),
    );
  }
  if (station.pickupEnabled) {
    violations.push(
      reason(
        StationLifecycleReasonCode.ARCHIVED_INVARIANT_VIOLATION,
        'Archived stations must have pickupEnabled=false (R2).',
      ),
    );
  }
  if (station.returnEnabled) {
    violations.push(
      reason(
        StationLifecycleReasonCode.ARCHIVED_INVARIANT_VIOLATION,
        'Archived stations must have returnEnabled=false (R2).',
      ),
    );
  }
  if (station.archivedAt == null) {
    violations.push(
      reason(
        StationLifecycleReasonCode.ARCHIVED_INVARIANT_VIOLATION,
        'Archived stations must have archivedAt set (R2).',
      ),
    );
  }
  return violations;
}

export function buildArchiveMutations(
  station: StationLifecycleSnapshot,
): StationLifecycleMutations {
  const archivedAt =
    station.archivedAt instanceof Date
      ? station.archivedAt
      : station.archivedAt
        ? new Date(station.archivedAt)
        : new Date();

  return {
    status: 'ARCHIVED',
    isPrimary: false,
    pickupEnabled: false,
    returnEnabled: false,
    archivedAt,
  };
}

export function buildRestoreMutations(
  station: StationLifecycleSnapshot,
  context: StationLifecycleContext = {},
): StationLifecycleMutations {
  const pickupEnabled =
    context.restorePickupEnabled !== undefined
      ? context.restorePickupEnabled
      : station.pickupEnabled;
  const returnEnabled =
    context.restoreReturnEnabled !== undefined
      ? context.restoreReturnEnabled
      : station.returnEnabled;

  return {
    status: 'ACTIVE',
    archivedAt: null,
    pickupEnabled,
    returnEnabled,
    isPrimary: false,
  };
}

function evaluateTransition(
  from: StationStatus,
  to: StationStatus,
): StationLifecycleReason | null {
  if (from === to) return null;
  if (!isAllowedStatusTransition(from, to)) {
    return reason(
      StationLifecycleReasonCode.INVALID_STATUS_TRANSITION,
      `Status transition ${from} → ${to} is not allowed.`,
    );
  }
  return null;
}

function evaluateArchive(
  station: StationLifecycleSnapshot,
  context: StationLifecycleContext,
): StationLifecycleEvaluation {
  if (station.status === 'ARCHIVED') {
    return allowed({
      warnings: [
        warning(
          StationLifecycleWarningCode.IDEMPOTENT_ARCHIVE,
          'Station is already archived.',
        ),
      ],
    });
  }

  const transitionError = evaluateTransition(station.status, 'ARCHIVED');
  if (transitionError) {
    return denied([transitionError]);
  }

  const requiredActions: StationLifecycleRequiredAction[] = [
    requiredAction(
      StationLifecycleRequiredActionCode.APPLY_ARCHIVED_INVARIANTS,
      'Clear primary flag and disable pickup/return when archiving.',
    ),
  ];
  const warnings: StationLifecycleWarning[] = [];

  if (station.isPrimary) {
    const successorId = context.successorPrimaryStationId?.trim();
    if (!successorId) {
      return denied(
        [
          reason(
            StationLifecycleReasonCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
            'Primary station cannot be archived without a regulated successor.',
          ),
        ],
        {
          requiredActions: [
            requiredAction(
              StationLifecycleRequiredActionCode.SET_SUCCESSOR_PRIMARY,
              'Designate another active station as the new primary before archiving.',
            ),
          ],
        },
      );
    }
    if (station.id && successorId === station.id) {
      return denied([
        reason(
          StationLifecycleReasonCode.SUCCESSOR_PRIMARY_IS_SELF,
          'Successor primary station must be a different station.',
        ),
      ]);
    }
    if (context.successorPrimaryStationStatus !== 'ACTIVE') {
      return denied([
        reason(
          StationLifecycleReasonCode.SUCCESSOR_PRIMARY_NOT_ACTIVE,
          'Successor primary station must be ACTIVE.',
        ),
      ]);
    }
    requiredActions.push(
      requiredAction(
        StationLifecycleRequiredActionCode.TRANSFER_PRIMARY_BEFORE_ARCHIVE,
        'Transfer primary to the successor station in the same transaction.',
      ),
    );
  }

  if ((context.activeBookingCount ?? 0) > 0) {
    warnings.push(
      warning(
        StationLifecycleWarningCode.ACTIVE_BOOKINGS_ON_ARCHIVE,
        'Station has active bookings; historical references will remain.',
      ),
    );
  }

  return allowed({
    warnings,
    requiredActions,
    enforcedMutations: buildArchiveMutations(station),
  });
}

function evaluateRestore(
  station: StationLifecycleSnapshot,
  context: StationLifecycleContext,
): StationLifecycleEvaluation {
  if (station.status !== 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.NOT_ARCHIVED,
        'Only archived stations can be restored.',
      ),
    ]);
  }

  const transitionError = evaluateTransition(station.status, 'ACTIVE');
  if (transitionError) {
    return denied([transitionError]);
  }

  const enforcedMutations = buildRestoreMutations(station, context);
  const warnings: StationLifecycleWarning[] = [
    warning(
      StationLifecycleWarningCode.RESTORE_DOES_NOT_REENABLE_CAPABILITIES,
      'Restore does not blindly re-enable pickup/return capabilities.',
    ),
  ];
  const requiredActions: StationLifecycleRequiredAction[] = [
    requiredAction(
      StationLifecycleRequiredActionCode.CLEAR_ARCHIVED_AT,
      'Clear archivedAt when restoring to ACTIVE.',
    ),
  ];

  if (!enforcedMutations.pickupEnabled || !enforcedMutations.returnEnabled) {
    warnings.push(
      warning(
        StationLifecycleWarningCode.RESTORE_CAPABILITIES_REMAIN_DISABLED,
        'Pickup and/or return remain disabled after restore until explicitly configured.',
      ),
    );
    requiredActions.push(
      requiredAction(
        StationLifecycleRequiredActionCode.REVIEW_CAPABILITIES_AFTER_RESTORE,
        'Review and configure pickup/return capabilities after restore.',
      ),
    );
  }

  return allowed({
    warnings,
    requiredActions,
    enforcedMutations,
  });
}

function evaluateActivate(
  station: StationLifecycleSnapshot,
): StationLifecycleEvaluation {
  if (station.status === 'ACTIVE') {
    return allowed({
      warnings: [
        warning(
          StationLifecycleWarningCode.IDEMPOTENT_ACTIVATE,
          'Station is already active.',
        ),
      ],
    });
  }
  if (station.status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.INVALID_STATUS_TRANSITION,
        'Archived stations must be restored via RestoreStation, not activated directly.',
      ),
    ], {
      requiredActions: [
        requiredAction(
          StationLifecycleRequiredActionCode.USE_LIFECYCLE_COMMAND,
          'Use RestoreStation to move ARCHIVED → ACTIVE.',
        ),
      ],
    });
  }

  const transitionError = evaluateTransition(station.status, 'ACTIVE');
  if (transitionError) {
    return denied([transitionError]);
  }

  return allowed({
    enforcedMutations: { status: 'ACTIVE' },
  });
}

function evaluateDeactivate(
  station: StationLifecycleSnapshot,
): StationLifecycleEvaluation {
  if (station.status === 'INACTIVE') {
    return allowed({
      warnings: [
        warning(
          StationLifecycleWarningCode.IDEMPOTENT_DEACTIVATE,
          'Station is already inactive.',
        ),
      ],
    });
  }
  if (station.status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.STATION_ARCHIVED,
        'Archived stations cannot be deactivated.',
      ),
    ]);
  }

  const transitionError = evaluateTransition(station.status, 'INACTIVE');
  if (transitionError) {
    return denied([transitionError]);
  }

  return allowed({
    enforcedMutations: { status: 'INACTIVE' },
  });
}

function evaluateSetPrimary(
  station: StationLifecycleSnapshot,
): StationLifecycleEvaluation {
  if (station.status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.SET_PRIMARY_ON_ARCHIVED,
        'Archived stations cannot be set as primary.',
      ),
    ]);
  }
  if (station.status === 'INACTIVE') {
    return denied(
      [
        reason(
          StationLifecycleReasonCode.SET_PRIMARY_ON_INACTIVE,
          'Only active stations can be set as primary.',
        ),
      ],
      {
        requiredActions: [
          requiredAction(
            StationLifecycleRequiredActionCode.ACTIVATE_STATION_FIRST,
            'Activate the station before setting it as primary.',
          ),
        ],
      },
    );
  }

  return allowed({
    enforcedMutations: { isPrimary: true, status: 'ACTIVE' },
  });
}

function evaluateUpdateCapabilities(
  station: StationLifecycleSnapshot,
  context: StationLifecycleContext,
): StationLifecycleEvaluation {
  if (station.status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.CAPABILITY_CHANGE_ON_ARCHIVED,
        'Capabilities cannot be changed on archived stations.',
      ),
    ]);
  }
  if (station.status === 'INACTIVE') {
    return denied([
      reason(
        StationLifecycleReasonCode.CAPABILITY_CHANGE_ON_INACTIVE,
        'Capabilities cannot be changed while the station is inactive.',
      ),
    ], {
      requiredActions: [
        requiredAction(
          StationLifecycleRequiredActionCode.ACTIVATE_STATION_FIRST,
          'Activate the station before changing pickup/return capabilities.',
        ),
      ],
    });
  }

  const enforcedMutations: StationLifecycleMutations = {};
  if (context.nextPickupEnabled !== undefined) {
    enforcedMutations.pickupEnabled = context.nextPickupEnabled;
  }
  if (context.nextReturnEnabled !== undefined) {
    enforcedMutations.returnEnabled = context.nextReturnEnabled;
  }

  return allowed({
    enforcedMutations:
      Object.keys(enforcedMutations).length > 0 ? enforcedMutations : undefined,
  });
}

function evaluateGenericStatusPatch(
  station: StationLifecycleSnapshot,
  context: StationLifecycleContext,
): StationLifecycleEvaluation {
  if (context.proposedStatus === undefined || context.proposedStatus === station.status) {
    return allowed();
  }

  return denied(
    [
      reason(
        StationLifecycleReasonCode.STATUS_CHANGE_VIA_GENERIC_UPDATE_FORBIDDEN,
        'Status must not be changed via generic update; use lifecycle commands (R1).',
      ),
    ],
    {
      requiredActions: [
        requiredAction(
          StationLifecycleRequiredActionCode.USE_LIFECYCLE_COMMAND,
          'Use Activate, Deactivate, Archive, or Restore commands instead.',
        ),
      ],
    },
  );
}

function evaluateCreate(context: StationLifecycleContext): StationLifecycleEvaluation {
  const status = context.createStatus ?? 'ACTIVE';
  if (status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.CREATE_WITH_ARCHIVED_STATUS,
        'New stations cannot be created directly in ARCHIVED status.',
      ),
    ]);
  }
  if (!STATION_LIFECYCLE_STATUSES.includes(status)) {
    return denied([
      reason(
        StationLifecycleReasonCode.INVALID_STATUS_TRANSITION,
        `Invalid create status: ${status}.`,
      ),
    ]);
  }
  return allowed({
    enforcedMutations: { status },
  });
}

function evaluateBookingSelection(
  station: StationLifecycleSnapshot,
  purpose: 'pickup' | 'return',
): StationLifecycleEvaluation {
  if (station.status === 'ARCHIVED') {
    return denied([
      reason(
        StationLifecycleReasonCode.STATION_ARCHIVED,
        'Archived stations cannot be selected for new bookings.',
      ),
    ]);
  }
  if (station.status === 'INACTIVE') {
    return denied([
      reason(
        StationLifecycleReasonCode.STATION_INACTIVE,
        'Inactive stations cannot be selected for new bookings.',
      ),
    ]);
  }
  if (!SELECTABLE_BOOKING_STATION_STATUSES.includes(station.status)) {
    return denied([
      reason(
        StationLifecycleReasonCode.STATION_NOT_ACTIVE,
        'Only active stations can be selected for new bookings.',
      ),
    ]);
  }
  if (purpose === 'pickup' && !station.pickupEnabled) {
    return denied([
      reason(
        StationLifecycleReasonCode.PICKUP_DISABLED,
        'Pickup is disabled for this station.',
      ),
    ]);
  }
  if (purpose === 'return' && !station.returnEnabled) {
    return denied([
      reason(
        StationLifecycleReasonCode.RETURN_DISABLED,
        'Return is disabled for this station.',
      ),
    ]);
  }
  return allowed();
}

function evaluateHistoricalRead(
  station: StationLifecycleSnapshot,
): StationLifecycleEvaluation {
  if (station.status === 'INACTIVE') {
    return allowed({
      warnings: [
        warning(
          StationLifecycleWarningCode.INACTIVE_HISTORICAL_READ,
          'Inactive station remains readable for historical context.',
        ),
      ],
    });
  }
  if (station.status === 'ARCHIVED') {
    return allowed({
      warnings: [
        warning(
          StationLifecycleWarningCode.ARCHIVED_HISTORICAL_READ,
          'Archived station remains readable for historical context.',
        ),
      ],
    });
  }
  return allowed();
}

/**
 * Central lifecycle policy evaluator for Stations V2 commands.
 */
export function evaluateStationLifecycle(
  input: StationLifecycleEvaluationInput,
): StationLifecycleEvaluation {
  const context = input.context ?? {};
  const { station, command } = input;

  switch (command) {
    case StationLifecycleCommand.ARCHIVE:
      return evaluateArchive(station, context);
    case StationLifecycleCommand.RESTORE:
      return evaluateRestore(station, context);
    case StationLifecycleCommand.ACTIVATE:
      return evaluateActivate(station);
    case StationLifecycleCommand.DEACTIVATE:
      return evaluateDeactivate(station);
    case StationLifecycleCommand.SET_PRIMARY:
      return evaluateSetPrimary(station);
    case StationLifecycleCommand.UPDATE_CAPABILITIES:
      return evaluateUpdateCapabilities(station, context);
    case StationLifecycleCommand.GENERIC_STATUS_PATCH:
      return evaluateGenericStatusPatch(station, context);
    case StationLifecycleCommand.CREATE:
      return evaluateCreate(context);
    case StationLifecycleCommand.BOOKING_PICKUP:
      return evaluateBookingSelection(station, 'pickup');
    case StationLifecycleCommand.BOOKING_RETURN:
      return evaluateBookingSelection(station, 'return');
    case StationLifecycleCommand.HISTORICAL_READ:
      return evaluateHistoricalRead(station);
    case StationLifecycleCommand.UPDATE_MASTER_DATA:
      if (station.status === 'ARCHIVED') {
        return allowed({
          warnings: [
            warning(
              StationLifecycleWarningCode.ARCHIVED_HISTORICAL_READ,
              'Master data may be updated on archived stations for correction only.',
            ),
          ],
        });
      }
      return allowed();
    default:
      return allowed();
  }
}
