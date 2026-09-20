import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { canExecuteFallbackG2Handoff } from '@config/raw-fuel-refuel-fallback.config';
import { computeOrphanCreatedAtRange } from './physical-refuel-orphan-range.util';
import { isV2CoordinateEligibleForEnrichment } from './physical-refuel-coordinate.policy';
import { RETRYABLE_COORDINATE_STATUS_LIST } from './physical-refuel-coordinate-retry.policy';
import { FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS } from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';
import {
  AUTHORITY_RECHECK_HOLD_REASON,
  isPermanentIdentityAmbiguityReason,
  isSafeLateSiblingAuthorityRecheckRow,
  reconciliationImpliesLateSiblingAfterFinalization,
} from './physical-refuel-late-sibling-authority.util';

export interface PhysicalRefuelRecoveryWorkItem {
  vehicleId: string;
  triggerEventId: string;
  reason:
    | 'orphan_refuel'
    | 'settlement_due'
    | 'stale_enrichment'
    | 'lost_enqueue'
    | 'coordinate_initial'
    | 'coordinate_retry'
    | 'authority_recheck';
}

export interface PhysicalRefuelRecoveryQuota {
  settlementDue: number;
  orphanRefuel: number;
  staleEnrichment: number;
  lostEnqueue: number;
  coordinateInitial: number;
  coordinateRetry: number;
  authorityRecheck: number;
}

const FINAL_ELIGIBLE_STATES = [
  PhysicalRefuelFinalityState.FINAL_CANONICAL,
  PhysicalRefuelFinalityState.FINAL_DISTINCT,
] as const;

export function computePhysicalRefuelRecoveryQuota(batchSize: number): PhysicalRefuelRecoveryQuota {
  const settlementDue = Math.max(1, Math.ceil(batchSize * 0.25));
  const orphanRefuel = Math.max(1, Math.ceil(batchSize * 0.2));
  const staleEnrichment = Math.max(1, Math.ceil(batchSize * 0.15));
  const lostEnqueue = Math.max(1, Math.ceil(batchSize * 0.15));
  const authorityRecheck = batchSize >= 12 ? 1 : 0;
  const coordinateInitial = Math.max(1, Math.ceil(batchSize * 0.15));
  const coordinateRetry = Math.max(
    0,
    batchSize -
      settlementDue -
      orphanRefuel -
      staleEnrichment -
      lostEnqueue -
      coordinateInitial -
      authorityRecheck,
  );
  return {
    settlementDue,
    orphanRefuel,
    staleEnrichment,
    lostEnqueue,
    coordinateInitial,
    coordinateRetry,
    authorityRecheck,
  };
}

function fallbackAuthorityEnergyEventFilter(
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventWhereInput | Record<string, never> {
  if (fallbackG2Authorized) return {};
  return {
    OR: [
      { detectionSource: null },
      { detectionSource: { not: 'SYNQDRIVE_RAW_FUEL_FALLBACK' } },
    ],
  };
}

export function buildSettlementDueRecoveryWhere(
  asOf: Date,
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    finalityState: {
      in: [PhysicalRefuelFinalityState.PROVISIONAL, PhysicalRefuelFinalityState.SETTLING],
    },
    nextReconciliationAt: { lte: asOf },
    energyEvent: fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
  };
}

export function buildStaleEnrichmentRecoveryWhere(
  staleBefore: Date,
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    enrichmentEligible: true,
    finalityState: { in: [...FINAL_ELIGIBLE_STATES] },
    energyEvent: {
      ...fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
      fuelStationEnrichment: {
        is: {
          OR: [
            { processingStatus: 'PENDING' },
            {
              processingStatus: 'PROCESSING',
              lastAttemptAt: { lt: staleBefore },
            },
          ],
        },
      },
    },
  };
}

export function buildLostEnqueueRecoveryCandidateWhere(
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    enrichmentEligible: true,
    enrichmentEnqueuedAt: null,
    finalityState: { in: [...FINAL_ELIGIBLE_STATES] },
    coordinateLatitude: { not: null },
    coordinateLongitude: { not: null },
    coordinateSource: { not: null },
    energyEvent: {
      ...fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
      fuelStationEnrichment: { is: null },
    },
  };
}

/** Structural marker: actionable lost_enqueue backlog uses DB-side COUNT, not findMany materialization. */
export const LOST_ENQUEUE_ACTIONABLE_COUNT_USES_DB_AGGREGATE = true;

export async function countActionableLostEnqueueRecovery(
  prisma: PrismaClient,
  fallbackG2Authorized: boolean,
): Promise<number> {
  const authorityClause = fallbackG2Authorized
    ? Prisma.empty
    : Prisma.sql`AND (vee.detection_source IS NULL OR vee.detection_source <> 'SYNQDRIVE_RAW_FUEL_FALLBACK')`;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM vehicle_energy_event_refuel_reconciliations r
    INNER JOIN vehicle_energy_events vee ON vee.id = r.energy_event_id
    LEFT JOIN vehicle_energy_event_fuel_station_enrichments e ON e.energy_event_id = r.energy_event_id
    WHERE r.enrichment_eligible = true
      AND r.enrichment_enqueued_at IS NULL
      AND r.finality_state IN ('FINAL_CANONICAL', 'FINAL_DISTINCT')
      AND r.coordinate_latitude IS NOT NULL
      AND r.coordinate_longitude IS NOT NULL
      AND r.coordinate_source IS NOT NULL
      AND r.coordinate_source <> ''
      AND r.coordinate_latitude > '-Infinity'::float8
      AND r.coordinate_latitude < 'Infinity'::float8
      AND r.coordinate_longitude > '-Infinity'::float8
      AND r.coordinate_longitude < 'Infinity'::float8
      AND e.energy_event_id IS NULL
      ${authorityClause}
  `);

  return Number(rows[0]?.count ?? 0n);
}

export function buildCoordinateInitialRecoveryWhere(
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    enrichmentEligible: true,
    enrichmentEnqueuedAt: null,
    finalityState: { in: [...FINAL_ELIGIBLE_STATES] },
    coordinateSelectionStatus: null,
    energyEvent: {
      ...fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
      fuelStationEnrichment: { is: null },
    },
  };
}

export function buildCoordinateRetryRecoveryWhere(
  asOf: Date,
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    enrichmentEligible: true,
    enrichmentEnqueuedAt: null,
    finalityState: { in: [...FINAL_ELIGIBLE_STATES] },
    coordinateSelectionStatus: { in: [...RETRYABLE_COORDINATE_STATUS_LIST] },
    nextCoordinateRetryAt: { lte: asOf },
    energyEvent: {
      ...fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
      fuelStationEnrichment: { is: null },
    },
  };
}

export function buildAuthorityRecheckRecoveryWhere(
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventRefuelReconciliationWhereInput {
  return {
    finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
    lateSiblingConflict: true,
    reason: { not: AUTHORITY_RECHECK_HOLD_REASON },
    NOT: {
      OR: [
        { reason: 'non_transitive_identity_component' },
        { reason: 'pairwise_identity_insufficient' },
        { reason: 'missing_system_observation_time' },
      ],
    },
    energyEvent: fallbackAuthorityEnergyEventFilter(fallbackG2Authorized),
  };
}

export function buildOrphanRefuelRecoveryWhere(
  orphanCreatedAt: { gte: Date; lte: Date },
  fallbackG2Authorized: boolean,
): Prisma.VehicleEnergyEventWhereInput {
  return {
    kind: EnergyEventKind.REFUEL,
    createdAt: orphanCreatedAt,
    refuelReconciliation: { is: null },
    ...(fallbackG2Authorized
      ? {}
      : {
          OR: [
            { detectionSource: null },
            { detectionSource: { not: 'SYNQDRIVE_RAW_FUEL_FALLBACK' } },
          ],
        }),
  };
}

export async function countActionablePhysicalRefuelRecoveryReasons(
  prisma: PrismaClient,
  asOf: Date,
  v2OwnershipCutoverAt: Date,
  orphanLookbackFrom: Date,
  staleProcessingMs: number = FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  orphanRefuels: number;
  reconciliationDue: number;
  staleEnrichment: number;
  lostEnqueuePending: number;
  coordinateInitialDue: number;
  coordinateRetryDue: number;
}> {
  const orphanCreatedAt = computeOrphanCreatedAtRange({
    v2OwnershipCutoverAt,
    orphanLookbackFrom,
    asOf,
  });
  const staleBefore = new Date(asOf.getTime() - staleProcessingMs);
  const fallbackG2Authorized = canExecuteFallbackG2Handoff(env);

  const [
    orphanRefuels,
    reconciliationDue,
    staleEnrichment,
    lostEnqueuePending,
    coordinateInitialDue,
    coordinateRetryDue,
  ] = await Promise.all([
    prisma.vehicleEnergyEvent.count({
      where: buildOrphanRefuelRecoveryWhere(orphanCreatedAt, fallbackG2Authorized),
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: buildSettlementDueRecoveryWhere(asOf, fallbackG2Authorized),
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: buildStaleEnrichmentRecoveryWhere(staleBefore, fallbackG2Authorized),
    }),
    countActionableLostEnqueueRecovery(prisma, fallbackG2Authorized),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: buildCoordinateInitialRecoveryWhere(fallbackG2Authorized),
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: buildCoordinateRetryRecoveryWhere(asOf, fallbackG2Authorized),
    }),
  ]);

  return {
    orphanRefuels,
    reconciliationDue,
    staleEnrichment,
    lostEnqueuePending,
    coordinateInitialDue,
    coordinateRetryDue,
  };
}

export async function findPhysicalRefuelRecoveryWork(
  prisma: PrismaClient,
  params: {
    batchSize: number;
    asOf: Date;
    v2OwnershipCutoverAt: Date;
    orphanLookbackFrom: Date;
    staleProcessingMs?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<PhysicalRefuelRecoveryWorkItem[]> {
  const work: PhysicalRefuelRecoveryWorkItem[] = [];
  const seenVehicles = new Set<string>();
  const quota = computePhysicalRefuelRecoveryQuota(params.batchSize);
  const staleBefore = new Date(
    params.asOf.getTime() - (params.staleProcessingMs ?? FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS),
  );
  const env = params.env ?? process.env;
  const fallbackG2Authorized = canExecuteFallbackG2Handoff(env);

  const pushWork = async (item: PhysicalRefuelRecoveryWorkItem) => {
    if (seenVehicles.has(item.vehicleId)) return false;
    if (work.length >= params.batchSize) return false;

    const trigger = await prisma.vehicleEnergyEvent.findUnique({
      where: { id: item.triggerEventId },
      select: { detectionSource: true },
    });
    if (
      trigger?.detectionSource === 'SYNQDRIVE_RAW_FUEL_FALLBACK' &&
      !fallbackG2Authorized
    ) {
      return false;
    }

    seenVehicles.add(item.vehicleId);
    work.push(item);
    return true;
  };

  const orphanCreatedAt = computeOrphanCreatedAtRange({
    v2OwnershipCutoverAt: params.v2OwnershipCutoverAt,
    orphanLookbackFrom: params.orphanLookbackFrom,
    asOf: params.asOf,
  });

  const dueReconciliations = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildSettlementDueRecoveryWhere(params.asOf, fallbackG2Authorized),
    orderBy: { nextReconciliationAt: 'asc' },
    take: quota.settlementDue,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of dueReconciliations) {
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'settlement_due',
    });
  }

  if (work.length >= params.batchSize) return work;

  const orphans = await prisma.vehicleEnergyEvent.findMany({
    where: buildOrphanRefuelRecoveryWhere(orphanCreatedAt, fallbackG2Authorized),
    orderBy: { createdAt: 'asc' },
    take: quota.orphanRefuel,
    select: { id: true, vehicleId: true },
  });

  for (const row of orphans) {
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.id,
      reason: 'orphan_refuel',
    });
  }

  if (work.length >= params.batchSize) return work;

  const staleEnrichment = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildStaleEnrichmentRecoveryWhere(staleBefore, fallbackG2Authorized),
    orderBy: { reconciledAt: 'asc' },
    take: quota.staleEnrichment,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of staleEnrichment) {
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'stale_enrichment',
    });
  }

  if (work.length >= params.batchSize) return work;

  const lostEnqueue = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildLostEnqueueRecoveryCandidateWhere(fallbackG2Authorized),
    orderBy: { reconciledAt: 'asc' },
    take: quota.lostEnqueue,
    select: {
      vehicleId: true,
      energyEventId: true,
      coordinateLatitude: true,
      coordinateLongitude: true,
      coordinateSource: true,
    },
  });

  for (const row of lostEnqueue) {
    if (
      !isV2CoordinateEligibleForEnrichment({
        latitude: row.coordinateLatitude,
        longitude: row.coordinateLongitude,
        source: row.coordinateSource,
      })
    ) {
      continue;
    }
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'lost_enqueue',
    });
  }

  if (work.length >= params.batchSize) return work;

  const coordinateInitial = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildCoordinateInitialRecoveryWhere(fallbackG2Authorized),
    orderBy: { reconciledAt: 'asc' },
    take: quota.coordinateInitial,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of coordinateInitial) {
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'coordinate_initial',
    });
  }

  if (work.length >= params.batchSize) return work;

  const coordinateRetry = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildCoordinateRetryRecoveryWhere(params.asOf, fallbackG2Authorized),
    orderBy: [{ nextCoordinateRetryAt: 'asc' }, { reconciledAt: 'asc' }],
    take: quota.coordinateRetry,
    select: { vehicleId: true, energyEventId: true },
  });

  for (const row of coordinateRetry) {
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'coordinate_retry',
    });
  }

  if (work.length >= params.batchSize) return work;

  const authorityRecheckCandidates = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: buildAuthorityRecheckRecoveryWhere(fallbackG2Authorized),
    orderBy: { updatedAt: 'asc' },
    take: Math.max(quota.authorityRecheck * 4, quota.authorityRecheck),
    include: {
      energyEvent: { include: { fuelStationEnrichment: true } },
    },
  });

  const canonicalOwnerCache = new Map<
    string,
    Awaited<ReturnType<typeof prisma.vehicleEnergyEventRefuelReconciliation.findUnique>>
  >();

  for (const row of authorityRecheckCandidates) {
    if (work.filter((w) => w.reason === 'authority_recheck').length >= quota.authorityRecheck) {
      break;
    }
    if (isPermanentIdentityAmbiguityReason(row.reason, row.reasonCodes)) {
      continue;
    }
    if (!reconciliationImpliesLateSiblingAfterFinalization(row)) {
      continue;
    }
    let ownerRowForPolicy:
      | (typeof authorityRecheckCandidates)[number]
      | NonNullable<Awaited<ReturnType<typeof prisma.vehicleEnergyEventRefuelReconciliation.findUnique>>>
      = row;
    if (row.canonicalEventId) {
      const cached = canonicalOwnerCache.get(row.canonicalEventId);
      let canonicalOwnerRow = cached;
      if (cached === undefined) {
        canonicalOwnerRow = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
          where: { energyEventId: row.canonicalEventId },
          include: {
            energyEvent: { include: { fuelStationEnrichment: true } },
          },
        });
        canonicalOwnerCache.set(row.canonicalEventId, canonicalOwnerRow);
      }
      if (canonicalOwnerRow) {
        ownerRowForPolicy = canonicalOwnerRow;
      }
    }
    if (!isSafeLateSiblingAuthorityRecheckRow(row, ownerRowForPolicy)) {
      continue;
    }
    await pushWork({
      vehicleId: row.vehicleId,
      triggerEventId: row.energyEventId,
      reason: 'authority_recheck',
    });
  }

  return work;
}

export async function countPhysicalRefuelRecoveryBacklog(
  prisma: PrismaClient,
  asOf: Date,
  v2OwnershipCutoverAt: Date,
  orphanLookbackFrom: Date,
  staleProcessingMs: number = FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, number>> {
  const [
    actionable,
    provisional,
    settling,
    insufficient,
    finalCanonical,
    finalDistinct,
    lateSibling,
    coordinateHold,
  ] = await Promise.all([
    countActionablePhysicalRefuelRecoveryReasons(
      prisma,
      asOf,
      v2OwnershipCutoverAt,
      orphanLookbackFrom,
      staleProcessingMs,
      env,
    ),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { finalityState: PhysicalRefuelFinalityState.PROVISIONAL },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { finalityState: PhysicalRefuelFinalityState.SETTLING },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { finalityState: PhysicalRefuelFinalityState.FINAL_DISTINCT },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { lateSiblingConflict: true },
    }),
    prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: {
        coordinateSelectionStatus: { not: null },
        enrichmentEligible: true,
        enrichmentEnqueuedAt: null,
      },
    }),
  ]);

  return {
    provisional,
    settling,
    insufficientEvidence: insufficient,
    finalCanonical,
    finalDistinct,
    reconciliationDue: actionable.reconciliationDue,
    lostEnqueuePending: actionable.lostEnqueuePending,
    orphanRefuels: actionable.orphanRefuels,
    lateSiblingConflict: lateSibling,
    coordinateHold,
    coordinateInitialDue: actionable.coordinateInitialDue,
    coordinateRetryDue: actionable.coordinateRetryDue,
    staleEnrichment: actionable.staleEnrichment,
  };
}
