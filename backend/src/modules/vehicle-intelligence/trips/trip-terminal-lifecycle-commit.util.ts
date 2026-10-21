import { TripStatus } from '@prisma/client';

import type {
  TerminalLifecycleCommit,
  TerminalLifecycleIntent,
} from './trip-detection.types';

export type DurableTerminalOutcome =
  | 'NOT_TERMINAL'
  | 'TERMINAL_EXPECTED'
  | 'AMBIGUOUS';

export type DurableTerminalTripSnapshot = {
  id: string;
  vehicleId?: string;
  tripStatus: TripStatus;
  endTime?: Date | null;
  rawDetectionMeta?: unknown;
};

/** Pure durable-state classifier for terminal finalize/discard commit ambiguity. */
export function classifyDurableTerminalOutcome(params: {
  intent: TerminalLifecycleIntent;
  trip: DurableTerminalTripSnapshot | null;
}): DurableTerminalOutcome {
  const { intent, trip } = params;

  if (intent === 'NONE') {
    return 'NOT_TERMINAL';
  }

  if (!trip) {
    return 'AMBIGUOUS';
  }

  if (intent === 'COMPLETE') {
    if (trip.tripStatus === TripStatus.COMPLETED) {
      return 'TERMINAL_EXPECTED';
    }
    if (trip.tripStatus === TripStatus.ONGOING) {
      return 'NOT_TERMINAL';
    }
    return 'AMBIGUOUS';
  }

  if (intent === 'CANCEL') {
    if (trip.tripStatus === TripStatus.CANCELLED) {
      return 'TERMINAL_EXPECTED';
    }
    if (trip.tripStatus === TripStatus.ONGOING) {
      return 'NOT_TERMINAL';
    }
    return 'AMBIGUOUS';
  }

  return 'AMBIGUOUS';
}

export type DurableTerminalTripReader = {
  vehicleTrip: {
    findUnique: (args: unknown) => Promise<DurableTerminalTripSnapshot | null>;
  };
};

export async function readDurableTerminalTrip(
  prisma: DurableTerminalTripReader,
  tripId: string,
): Promise<DurableTerminalTripSnapshot | null> {
  try {
    return await prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        tripStatus: true,
        endTime: true,
        rawDetectionMeta: true,
      },
    });
  } catch {
    return null;
  }
}

export async function readDurableTerminalOutcome(
  prisma: DurableTerminalTripReader,
  params: {
    intent: TerminalLifecycleIntent;
    tripId: string;
  },
): Promise<DurableTerminalOutcome> {
  const trip = await readDurableTerminalTrip(prisma, params.tripId);
  return classifyDurableTerminalOutcome({
    intent: params.intent,
    trip,
  });
}

export function resolveTerminalRestingRecoveryWake(params: {
  restingTransitionSucceeded: boolean;
  terminalTripId: string | null;
  terminalLifecycleCommit: TerminalLifecycleCommit;
  terminalLifecycleIntent: TerminalLifecycleIntent;
  durableOutcome: DurableTerminalOutcome | null;
}): {
  shouldWake: boolean;
  effectiveCommit: TerminalLifecycleCommit;
  durableOutcome: DurableTerminalOutcome | null;
} {
  if (params.restingTransitionSucceeded || !params.terminalTripId) {
    return {
      shouldWake: false,
      effectiveCommit: params.terminalLifecycleCommit,
      durableOutcome: params.durableOutcome,
    };
  }

  if (
    params.terminalLifecycleCommit === 'COMPLETED' ||
    params.terminalLifecycleCommit === 'CANCELLED'
  ) {
    return {
      shouldWake: true,
      effectiveCommit: params.terminalLifecycleCommit,
      durableOutcome: params.durableOutcome,
    };
  }

  if (
    params.terminalLifecycleCommit === 'NONE' &&
    params.terminalLifecycleIntent !== 'NONE'
  ) {
    if (params.durableOutcome === 'TERMINAL_EXPECTED') {
      return {
        shouldWake: true,
        effectiveCommit:
          params.terminalLifecycleIntent === 'COMPLETE' ? 'COMPLETED' : 'CANCELLED',
        durableOutcome: params.durableOutcome,
      };
    }
    if (params.durableOutcome === 'AMBIGUOUS') {
      return {
        shouldWake: true,
        effectiveCommit: 'NONE',
        durableOutcome: params.durableOutcome,
      };
    }
  }

  return {
    shouldWake: false,
    effectiveCommit: params.terminalLifecycleCommit,
    durableOutcome: params.durableOutcome,
  };
}

export function buildTerminalCommitAmbiguityForensics(params: {
  durableOutcome: DurableTerminalOutcome;
  terminalLifecycleIntent: TerminalLifecycleIntent;
  terminalTripId: string;
  errorMessage: string;
}): Record<string, unknown> {
  return {
    decision: 'TERMINAL_COMMIT_AMBIGUITY',
    durableOutcome: params.durableOutcome,
    terminalLifecycleIntent: params.terminalLifecycleIntent,
    terminalTripId: params.terminalTripId,
    promiseError: params.errorMessage,
  };
}
