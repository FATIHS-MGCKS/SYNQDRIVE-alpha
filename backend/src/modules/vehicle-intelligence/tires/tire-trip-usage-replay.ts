import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import type { TireTripUsageLedger } from '@prisma/client';
import { ledgerRowToAggregateDelta } from './tire-trip-usage-attribution';

export const TIRE_TRIP_USAGE_MAX_REPLAY_ATTEMPTS = 4;

export type TireTripUsageMetricName =
  | 'duplicate_prevented'
  | 'ledger_created'
  | 'ledger_revised'
  | 'ledger_invalidated'
  | 'aggregate_rebuilt';

export interface SetupUsageAggregateTotals {
  distanceKm: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelerationCount: number;
  harshBrakingCount: number;
  harshCorneringCount: number;
  activeLedgerRows: number;
}

export class TireTripUsageReplayConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TireTripUsageReplayConflictError';
  }
}

export function pgAdvisoryLockKeys(seed: string): [number, number] {
  const hash = createHash('sha256').update(seed).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

export function advisoryLockSeed(tripId: string, tireSetupId: string): string {
  return `tire-trip-usage:${tripId}:${tireSetupId}`;
}

export function isRetryableTripUsageError(err: unknown): boolean {
  if (err instanceof TireTripUsageReplayConflictError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2002' || err.code === 'P2034';
  }
  return false;
}

export function isActiveLedgerRow(row: Pick<TireTripUsageLedger, 'invalidatedAt'>): boolean {
  return row.invalidatedAt == null;
}

export function sumActiveLedgerRows(
  rows: Array<{
    invalidatedAt: Date | null;
    distanceKm: number;
    cityKm: number;
    ruralKm: number;
    highwayKm: number;
    harshAccelerationCount: number;
    harshBrakingCount: number;
    harshCorneringCount: number;
  }>,
): SetupUsageAggregateTotals {
  const active = rows.filter(isActiveLedgerRow);
  return active.reduce<SetupUsageAggregateTotals>(
    (acc, row) => ({
      distanceKm: round3(acc.distanceKm + row.distanceKm),
      cityKm: round3(acc.cityKm + row.cityKm),
      ruralKm: round3(acc.ruralKm + row.ruralKm),
      highwayKm: round3(acc.highwayKm + row.highwayKm),
      harshAccelerationCount: acc.harshAccelerationCount + row.harshAccelerationCount,
      harshBrakingCount: acc.harshBrakingCount + row.harshBrakingCount,
      harshCorneringCount: acc.harshCorneringCount + row.harshCorneringCount,
      activeLedgerRows: acc.activeLedgerRows + 1,
    }),
    {
      distanceKm: 0,
      cityKm: 0,
      ruralKm: 0,
      highwayKm: 0,
      harshAccelerationCount: 0,
      harshBrakingCount: 0,
      harshCorneringCount: 0,
      activeLedgerRows: 0,
    },
  );
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function acquireTripUsageAdvisoryLock(
  tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> },
  tripId: string,
  tireSetupId: string,
): Promise<void> {
  const [k1, k2] = pgAdvisoryLockKeys(advisoryLockSeed(tripId, tireSetupId));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock((${k1})::int, (${k2})::int)`;
}

type LedgerAggregateClient = {
  tireTripUsageLedger: {
    findMany: (args: {
      where: { tireSetupId: string; invalidatedAt: null };
    }) => Promise<TireTripUsageLedger[]>;
  };
  vehicleTireSetup: {
    update: (args: {
      where: { id: string };
      data: {
        totalKmOnSet: number;
        cityKm: number;
        ruralKm: number;
        highwayKm: number;
        harshAccelEvents: number;
        harshBrakeEvents: number;
        harshCornerEvents: number;
      };
    }) => Promise<unknown>;
  };
};

/**
 * Rebuild setup counters from active (non-invalidated) ledger rows — source of truth.
 */
export async function rebuildSetupUsageAggregatesFromLedger(
  tx: LedgerAggregateClient,
  tireSetupId: string,
): Promise<SetupUsageAggregateTotals> {
  const rows = await tx.tireTripUsageLedger.findMany({
    where: { tireSetupId, invalidatedAt: null },
  });
  const totals = sumActiveLedgerRows(rows);
  await tx.vehicleTireSetup.update({
    where: { id: tireSetupId },
    data: {
      totalKmOnSet: totals.distanceKm,
      cityKm: totals.cityKm,
      ruralKm: totals.ruralKm,
      highwayKm: totals.highwayKm,
      harshAccelEvents: totals.harshAccelerationCount,
      harshBrakeEvents: totals.harshBrakingCount,
      harshCornerEvents: totals.harshCorneringCount,
    },
  });
  return totals;
}

export function buildRevisionAuditPayload(args: {
  tripId: string;
  tireSetupId: string;
  previousFingerprint: string | null;
  nextFingerprint: string;
  previousValues: ReturnType<typeof ledgerRowToAggregateDelta> | null;
  nextValues: ReturnType<typeof ledgerRowToAggregateDelta>;
  trigger?: string;
  reason?: string;
}): Record<string, unknown> {
  return {
    command: 'reviseTripUsage',
    tripId: args.tripId,
    tireSetupId: args.tireSetupId,
    previousFingerprint: args.previousFingerprint,
    nextFingerprint: args.nextFingerprint,
    previousValues: args.previousValues,
    nextValues: args.nextValues,
    trigger: args.trigger ?? 'replay',
    reason: args.reason ?? 'source_fingerprint_changed',
  };
}

export function buildInvalidationAuditPayload(args: {
  tripId: string;
  tireSetupId: string;
  previousFingerprint: string | null;
  reason: string;
  supersededByTripId?: string | null;
}): Record<string, unknown> {
  return {
    command: 'invalidateTripUsage',
    tripId: args.tripId,
    tireSetupId: args.tireSetupId,
    previousFingerprint: args.previousFingerprint,
    reason: args.reason,
    supersededByTripId: args.supersededByTripId ?? null,
    policy: 'no_silent_delete',
  };
}

export async function withTripUsageReplayRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? TIRE_TRIP_USAGE_MAX_REPLAY_ATTEMPTS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableTripUsageError(err) || attempt >= maxAttempts) {
        throw err;
      }
    }
  }
  throw lastError;
}
