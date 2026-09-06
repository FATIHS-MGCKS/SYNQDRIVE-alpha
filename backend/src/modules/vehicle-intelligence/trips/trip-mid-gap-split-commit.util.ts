import { TripStatus } from '@prisma/client';

export type DurableLiveSplitOutcome =
  | 'NOT_COMMITTED'
  | 'COMMITTED_LINKED'
  | 'AMBIGUOUS';

export type DurableLiveSplitTripSnapshot = {
  id: string;
  tripStatus: TripStatus;
  startTime: Date;
  endTime?: Date | null;
  rawDetectionMeta?: unknown;
};

export function readSplitFromTripMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const splitFrom = (meta as Record<string, unknown>).splitFrom;
  return typeof splitFrom === 'string' ? splitFrom : null;
}

function readSplitTriggeredBy(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const triggeredBy = (meta as Record<string, unknown>).splitTriggeredBy;
  return typeof triggeredBy === 'string' ? triggeredBy : null;
}

function sameInstant(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return a.getTime() === b.getTime();
}

/** Pure durable-state classifier for live mid-gap split commit ambiguity. */
export function classifyDurableLiveSplitOutcome(params: {
  originalTripId: string;
  expectedFirstEndAt: Date;
  expectedSecondStartAt: Date;
  originalTrip: DurableLiveSplitTripSnapshot | null;
  ongoingTrips: DurableLiveSplitTripSnapshot[];
}): DurableLiveSplitOutcome {
  const { originalTrip, ongoingTrips, originalTripId, expectedFirstEndAt, expectedSecondStartAt } =
    params;

  if (!originalTrip) {
    return 'AMBIGUOUS';
  }

  const linkedContinuations = ongoingTrips.filter(
    (trip) => readSplitFromTripMeta(trip.rawDetectionMeta) === originalTripId,
  );

  if (originalTrip.tripStatus === TripStatus.ONGOING) {
    if (ongoingTrips.length !== 1) {
      return 'AMBIGUOUS';
    }
    if (ongoingTrips[0].id !== originalTripId) {
      return 'AMBIGUOUS';
    }
    if (linkedContinuations.length !== 0) {
      return 'AMBIGUOUS';
    }
    return 'NOT_COMMITTED';
  }

  if (originalTrip.tripStatus !== TripStatus.COMPLETED) {
    return 'AMBIGUOUS';
  }

  if (!sameInstant(originalTrip.endTime, expectedFirstEndAt)) {
    return 'AMBIGUOUS';
  }

  if (linkedContinuations.length !== 1) {
    return 'AMBIGUOUS';
  }

  if (ongoingTrips.length !== 1) {
    return 'AMBIGUOUS';
  }

  const continuation = linkedContinuations[0];
  if (continuation.tripStatus !== TripStatus.ONGOING) {
    return 'AMBIGUOUS';
  }

  if (!sameInstant(continuation.startTime, expectedSecondStartAt)) {
    return 'AMBIGUOUS';
  }

  const trip1TriggeredBy = readSplitTriggeredBy(originalTrip.rawDetectionMeta);
  if (trip1TriggeredBy != null && trip1TriggeredBy !== 'LIVE_FSM') {
    return 'AMBIGUOUS';
  }

  const continuationTriggeredBy = readSplitTriggeredBy(continuation.rawDetectionMeta);
  if (continuationTriggeredBy != null && continuationTriggeredBy !== 'LIVE_FSM') {
    return 'AMBIGUOUS';
  }

  return 'COMMITTED_LINKED';
}

export type DurableLiveSplitOutcomeReader = {
  vehicleTrip: {
    findUnique: (args: unknown) => Promise<DurableLiveSplitTripSnapshot | null>;
    findMany: (args: unknown) => Promise<DurableLiveSplitTripSnapshot[]>;
  };
};

export async function readDurableLiveSplitOutcome(
  prisma: DurableLiveSplitOutcomeReader,
  params: {
    vehicleId: string;
    originalTripId: string;
    expectedFirstEndAt: Date;
    expectedSecondStartAt: Date;
  },
): Promise<DurableLiveSplitOutcome> {
  try {
    const [originalTrip, ongoingTrips] = await Promise.all([
      prisma.vehicleTrip.findUnique({
        where: { id: params.originalTripId },
        select: {
          id: true,
          tripStatus: true,
          startTime: true,
          endTime: true,
          rawDetectionMeta: true,
        },
      }),
      prisma.vehicleTrip.findMany({
        where: {
          vehicleId: params.vehicleId,
          tripStatus: TripStatus.ONGOING,
        },
        select: {
          id: true,
          tripStatus: true,
          startTime: true,
          endTime: true,
          rawDetectionMeta: true,
        },
      }),
    ]);

    return classifyDurableLiveSplitOutcome({
      originalTripId: params.originalTripId,
      expectedFirstEndAt: params.expectedFirstEndAt,
      expectedSecondStartAt: params.expectedSecondStartAt,
      originalTrip,
      ongoingTrips,
    });
  } catch {
    return 'AMBIGUOUS';
  }
}

export function buildMidGapCommitAmbiguityForensics(params: {
  durableOutcome: DurableLiveSplitOutcome;
  originalTripId: string;
  expectedFirstEndAt: Date;
  expectedSecondStartAt: Date;
  errorMessage: string;
}): Record<string, unknown> {
  return {
    decision: 'SPLIT_COMMIT_AMBIGUITY',
    durableOutcome: params.durableOutcome,
    originalTripId: params.originalTripId,
    expectedFirstEndAt: params.expectedFirstEndAt.toISOString(),
    expectedSecondStartAt: params.expectedSecondStartAt.toISOString(),
    promiseError: params.errorMessage,
  };
}
