import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS,
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from './energy-events-recovery.constants';
import {
  buildUpsertPayload,
  coalesceSegments,
  isMateriallyIdentical,
  isSegmentPersistable,
  pruneStaleCoalescedSubSegments,
  resolveStaleSubsegmentPruneAuthorization,
  type CoalescedEnergySegment,
  type EnergyEventUpsertPayload,
} from './energy-events.pipeline';
import { simulateRecoveryWindow } from './energy-events-recovery-dry-run';
import type { EnergyEventsRecoveryPlan } from './energy-events-recovery-plan';
import {
  runEnergyEventsRecoveryDryRun,
  type RecoveryDryRunDeps,
  type RecoveryVehicleInput,
} from './energy-events-recovery-runner';
import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  EnergyVehicleEnergyClass,
} from './energy-events-recovery.types';
import type { RecoveryExistingEnergyEvent } from './energy-events-recovery-read.repository';

export const APPROVED_PRE_WRITE_COUNTS = {
  WOULD_CREATE: 3,
  WOULD_UPDATE: 1,
  WOULD_SKIP_NOT_PERSISTABLE: 2,
  MANUAL_REVIEW_EXCLUDE: 15,
  MANUAL_REVIEW_NEEDS: 0,
  FETCH_FAILED: 0,
} as const;

export type WriteActionResult =
  | 'CREATED'
  | 'UPDATED'
  | 'NO_OP_ALREADY_PRESENT'
  | 'CONFLICT'
  | 'FAILED'
  | 'SKIPPED_IDEMPOTENCY';

export interface EnergyEventsTableSnapshot {
  capturedAt: string;
  totalRows: number;
  outageWindowRows: number;
  newestCreatedAt: string | null;
  newestUpdatedAt: string | null;
  tableDigest: string;
}

export interface SanitizedWriteAuditEntry {
  alias: string;
  mechanism: 'refuel' | 'recharge';
  requestedAction: 'CREATE' | 'UPDATE';
  result: WriteActionResult;
  legacySubsegmentsReconciled: number;
  timestamp: string;
}

export interface WriteSetEntry {
  alias: string;
  mechanism: 'refuel' | 'recharge';
  classification: 'WOULD_CREATE' | 'WOULD_UPDATE';
  requestedAction: 'CREATE' | 'UPDATE';
  dimoSegmentId: string;
  vehicleId: string;
  existingRowId: string | null;
  windowFrom: string;
  windowTo: string;
  energyClass: EnergyVehicleEnergyClass;
  legacySubsegmentIds: string[];
}

export interface ControlledWriteBackfillResult {
  codeSha: string;
  recoveryPlanVersion: string;
  preWriteSnapshot: EnergyEventsTableSnapshot;
  preWriteReport: EnergyRecoveryDryRunReport;
  writeSet: WriteSetEntry[];
  audit: SanitizedWriteAuditEntry[];
  postWriteSnapshot?: EnergyEventsTableSnapshot;
  postWriteReport?: EnergyRecoveryDryRunReport;
  idempotencyReport?: EnergyRecoveryDryRunReport;
  legacySubsegmentsReconciledTotal: number;
  applied: boolean;
  idempotencyVerified: boolean;
}

export interface RollbackPlanEntry {
  alias: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE_LEGACY';
  dimoSegmentId: string;
  rowId: string | null;
  priorRow: Record<string, unknown> | null;
}

export async function captureRollbackPlan(
  prisma: PrismaClient,
  writeSet: WriteSetEntry[],
): Promise<RollbackPlanEntry[]> {
  const plan: RollbackPlanEntry[] = [];

  for (const entry of writeSet) {
    if (entry.requestedAction === 'CREATE') {
      plan.push({
        alias: entry.alias,
        action: 'CREATE',
        dimoSegmentId: entry.dimoSegmentId,
        rowId: null,
        priorRow: null,
      });
      continue;
    }

    if (entry.existingRowId) {
      const priorRow = await prisma.vehicleEnergyEvent.findUnique({
        where: { id: entry.existingRowId },
      });
      plan.push({
        alias: entry.alias,
        action: 'UPDATE',
        dimoSegmentId: entry.dimoSegmentId,
        rowId: entry.existingRowId,
        priorRow: priorRow ? (priorRow as unknown as Record<string, unknown>) : null,
      });
    }

    for (const subId of entry.legacySubsegmentIds) {
      const priorRow = await prisma.vehicleEnergyEvent.findUnique({
        where: { dimoSegmentId: subId },
      });
      if (priorRow) {
        plan.push({
          alias: `${entry.alias}_LEGACY`,
          action: 'DELETE_LEGACY',
          dimoSegmentId: subId,
          rowId: priorRow.id,
          priorRow: priorRow as unknown as Record<string, unknown>,
        });
      }
    }
  }

  return plan;
}

const EXISTING_EVENT_SELECT = {
  id: true,
  vehicleId: true,
  dimoSegmentId: true,
  kind: true,
  detectionMechanism: true,
  startTime: true,
  endTime: true,
  durationSeconds: true,
  startLatitude: true,
  startLongitude: true,
  endLatitude: true,
  endLongitude: true,
  fuelDeltaLiters: true,
  fuelDeltaPercent: true,
  socDeltaPercent: true,
  energyDeltaKwh: true,
  odometerStartKm: true,
  odometerEndKm: true,
  confidence: true,
  rawDetectionMeta: true,
} as const;

export async function refreshVehicleExistingEvents(
  prisma: PrismaClient,
  vehicles: RecoveryVehicleInput[],
): Promise<RecoveryVehicleInput[]> {
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const vehicleIds = vehicles.map((vehicle) => vehicle.vehicleId);
  const events = await prisma.vehicleEnergyEvent.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      startTime: { gte: outageStart, lt: recoveryCutoff },
    },
    select: EXISTING_EVENT_SELECT,
  });

  const eventsByVehicle = new Map<string, RecoveryExistingEnergyEvent[]>();
  for (const event of events) {
    const bucket = eventsByVehicle.get(event.vehicleId) ?? [];
    const { vehicleId: _vehicleId, ...existingEvent } = event;
    bucket.push(existingEvent as RecoveryExistingEnergyEvent);
    eventsByVehicle.set(event.vehicleId, bucket);
  }

  return vehicles.map((vehicle) => ({
    ...vehicle,
    existingEvents: eventsByVehicle.get(vehicle.vehicleId) ?? [],
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function aliasForCandidate(
  candidate: EnergyRecoveryCandidate,
  report: EnergyRecoveryDryRunReport,
): string {
  if (
    candidate.mechanism === 'refuel' &&
    candidate.classification === 'WOULD_CREATE' &&
    report.acceptance.canonicalRefuel.found &&
    candidate.startTime === report.acceptance.canonicalRefuel.segmentStart
  ) {
    return 'CANONICAL_REFUEL_CASE';
  }
  if (
    candidate.mechanism === 'recharge' &&
    candidate.classification === 'WOULD_UPDATE' &&
    candidate.existingRowId != null
  ) {
    return 'CANONICAL_RECHARGE_OVERLAP_CASE';
  }
  if (candidate.mechanism === 'recharge' && candidate.classification === 'WOULD_CREATE') {
    return 'EV_RECHARGE_CREATE';
  }
  return `${candidate.mechanism.toUpperCase()}_WRITE`;
}

export async function captureEnergyEventsTableSnapshot(
  prisma: PrismaClient,
): Promise<EnergyEventsTableSnapshot> {
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);

  const aggregate = await prisma.$queryRawUnsafe<
    Array<{
      total: number;
      outage_rows: number;
      newest_created: Date | null;
      newest_updated: Date | null;
    }>
  >(
    `SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE start_time >= $1 AND start_time < $2)::int AS outage_rows,
      max(created_at) AS newest_created,
      max(updated_at) AS newest_updated
    FROM vehicle_energy_events`,
    outageStart,
    recoveryCutoff,
  );

  const digestRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; dimo_segment_id: string; updated_at: Date }>
  >(
    `SELECT id, dimo_segment_id, updated_at FROM vehicle_energy_events ORDER BY id`,
  );

  const digest = createHash('sha256')
    .update(JSON.stringify(digestRows))
    .digest('hex');

  const row = aggregate[0];
  return {
    capturedAt: new Date().toISOString(),
    totalRows: row?.total ?? 0,
    outageWindowRows: row?.outage_rows ?? 0,
    newestCreatedAt: row?.newest_created?.toISOString() ?? null,
    newestUpdatedAt: row?.newest_updated?.toISOString() ?? null,
    tableDigest: digest,
  };
}

export function validatePostWriteReport(report: EnergyRecoveryDryRunReport): void {
  if (report.summary.WOULD_CREATE !== 0 || report.summary.WOULD_UPDATE !== 0) {
    throw new Error(
      `Post-write recovery pending writes: CREATE=${report.summary.WOULD_CREATE} UPDATE=${report.summary.WOULD_UPDATE}`,
    );
  }
  if (report.summary.FETCH_FAILED !== 0) {
    throw new Error(`Post-write FETCH_FAILED=${report.summary.FETCH_FAILED}`);
  }
}

export function validatePostWriteCompletionReport(
  report: EnergyRecoveryDryRunReport,
): void {
  validatePostWriteReport(report);
  const needs = report.manualReviewReport.filter(
    (entry) => entry.recommendation === 'NEEDS_FURTHER_EVIDENCE',
  ).length;
  if (needs !== 0) {
    throw new Error(`Post-write completion NEEDS=${needs}`);
  }
  if (report.gateBlockers.length > 0) {
    throw new Error(
      `Post-write completion gate blockers: ${report.gateBlockers.join(', ')}`,
    );
  }
}

export function validateIdempotencyReport(report: EnergyRecoveryDryRunReport): void {
  validatePostWriteCompletionReport(report);
}

export function validatePreWriteReport(report: EnergyRecoveryDryRunReport): void {
  const blockers: string[] = [];
  if (report.dbComparisonStatus !== 'ok') {
    blockers.push('DB_COMPARISON_NOT_OK');
  }
  if (report.summary.FETCH_FAILED !== APPROVED_PRE_WRITE_COUNTS.FETCH_FAILED) {
    blockers.push(`FETCH_FAILED:${report.summary.FETCH_FAILED}`);
  }
  if (report.summary.WOULD_CREATE !== APPROVED_PRE_WRITE_COUNTS.WOULD_CREATE) {
    blockers.push(`WOULD_CREATE:${report.summary.WOULD_CREATE}`);
  }
  if (report.summary.WOULD_UPDATE !== APPROVED_PRE_WRITE_COUNTS.WOULD_UPDATE) {
    blockers.push(`WOULD_UPDATE:${report.summary.WOULD_UPDATE}`);
  }
  if (
    report.summary.WOULD_SKIP_NOT_PERSISTABLE !==
    APPROVED_PRE_WRITE_COUNTS.WOULD_SKIP_NOT_PERSISTABLE
  ) {
    blockers.push(
      `WOULD_SKIP:${report.summary.WOULD_SKIP_NOT_PERSISTABLE}`,
    );
  }
  const excludeCount = report.manualReviewReport.filter(
    (entry) => entry.recommendation === 'EXCLUDE_FROM_BACKFILL',
  ).length;
  const needsCount = report.manualReviewReport.filter(
    (entry) => entry.recommendation === 'NEEDS_FURTHER_EVIDENCE',
  ).length;
  if (excludeCount !== APPROVED_PRE_WRITE_COUNTS.MANUAL_REVIEW_EXCLUDE) {
    blockers.push(`MANUAL_REVIEW_EXCLUDE:${excludeCount}`);
  }
  if (needsCount !== APPROVED_PRE_WRITE_COUNTS.MANUAL_REVIEW_NEEDS) {
    blockers.push(`MANUAL_REVIEW_NEEDS:${needsCount}`);
  }
  if (report.recoveryPlan?.unmatchedCount) {
    blockers.push(`UNMATCHED:${report.recoveryPlan.unmatchedCount}`);
  }
  if (report.recoveryPlan?.ambiguousCount) {
    blockers.push(`AMBIGUOUS:${report.recoveryPlan.ambiguousCount}`);
  }
  if (blockers.length > 0) {
    throw new Error(`Pre-write recovery gate mismatch: ${blockers.join(', ')}`);
  }
}

export function buildWriteSet(
  report: EnergyRecoveryDryRunReport,
): WriteSetEntry[] {
  return buildWriteSetFromCandidates(
    report,
    (candidate) =>
      candidate.classification === 'WOULD_CREATE' ||
      candidate.classification === 'WOULD_UPDATE',
    4,
  );
}

export function buildRemainingWriteSet(
  report: EnergyRecoveryDryRunReport,
  provenStaleSubsegmentIds: Set<string> = new Set(
    report.legacySubsegmentsWouldReplace,
  ),
): WriteSetEntry[] {
  const entries = buildWriteSetFromCandidates(
    report,
    (candidate) => {
      if (candidate.classification !== 'WOULD_CREATE' &&
          candidate.classification !== 'WOULD_UPDATE') {
        return false;
      }
      if (
        candidate.classification === 'WOULD_UPDATE' &&
        candidate.mechanism === 'recharge' &&
        provenStaleSubsegmentIds.has(candidate.dimoSegmentId)
      ) {
        return false;
      }
      return true;
    },
    undefined,
    true,
  );

  return entries.sort((left, right) => {
    if (left.mechanism === 'recharge' && right.mechanism !== 'recharge') {
      return -1;
    }
    if (right.mechanism === 'recharge' && left.mechanism !== 'recharge') {
      return 1;
    }
    return 0;
  });
}

function buildWriteSetFromCandidates(
  report: EnergyRecoveryDryRunReport,
  predicate: (candidate: EnergyRecoveryCandidate) => boolean,
  expectedSize?: number,
  allowEmpty = false,
): WriteSetEntry[] {
  const writeCandidates = report.candidates.filter(predicate);

  if (expectedSize != null && writeCandidates.length !== expectedSize) {
    throw new Error(
      `Write set size ${writeCandidates.length} != ${expectedSize} approved candidates`,
    );
  }
  if (writeCandidates.length === 0) {
    if (allowEmpty) {
      return [];
    }
    throw new Error('Write set is empty');
  }

  return writeCandidates.map((candidate) => {
    const inventory = report.vehicles.find(
      (row) => row.vehicleId === candidate.vehicleId,
    );
    if (!inventory) {
      throw new Error(`Missing inventory row for write candidate ${candidate.mechanism}`);
    }

    const legacySubsegmentIds =
      candidate.classification === 'WOULD_UPDATE' &&
      candidate.mechanism === 'recharge'
        ? report.legacySubsegmentsWouldReplace.filter((subId) =>
            candidate.coalescedFromSegmentIds.includes(subId),
          )
        : [];

    return {
      alias: aliasForCandidate(candidate, report),
      mechanism: candidate.mechanism,
      classification: candidate.classification as 'WOULD_CREATE' | 'WOULD_UPDATE',
      requestedAction:
        candidate.classification === 'WOULD_CREATE' ? 'CREATE' : 'UPDATE',
      dimoSegmentId: candidate.dimoSegmentId,
      vehicleId: candidate.vehicleId,
      existingRowId: candidate.existingRowId,
      windowFrom: candidate.windowFrom,
      windowTo: candidate.windowTo,
      energyClass: inventory.energyClass,
      legacySubsegmentIds,
    };
  });
}

async function resolvePayloadForWriteEntry(
  entry: WriteSetEntry,
  vehicle: RecoveryVehicleInput,
  fetchSegments: RecoveryDryRunDeps['fetchSegments'],
): Promise<{
  payload: EnergyEventUpsertPayload;
  coalesced: CoalescedEnergySegment;
  legacySubsegmentIds: string[];
  coalescedGroups: CoalescedEnergySegment[];
  mechanismOutcomes: Array<{ mechanism: string; status: string }>;
}> {
  const fetchResult = await fetchSegments(
    vehicle.tokenId,
    new Date(entry.windowFrom),
    new Date(entry.windowTo),
    entry.energyClass,
  );

  const simulated = simulateRecoveryWindow({
    vehicleId: vehicle.vehicleId,
    label: vehicle.label,
    tokenId: vehicle.tokenId,
    windowFrom: new Date(entry.windowFrom),
    windowTo: new Date(entry.windowTo),
    segments: fetchResult.segments,
    mechanismOutcomes: fetchResult.outcomes,
    existingEvents: vehicle.existingEvents,
    detectorConfigVersion: 'e2-2026-08',
  });

  const persistable = fetchResult.segments.filter(isSegmentPersistable);
  const coalesced = coalesceSegments(persistable);
  const group = coalesced.find(
    (segment) => segment.coalescedSegmentId === entry.dimoSegmentId,
  );
  if (!group) {
    throw new Error(
      `Could not resolve coalesced segment for write alias ${entry.alias}`,
    );
  }

  const match = simulated.candidates.find(
    (candidate) => candidate.dimoSegmentId === entry.dimoSegmentId,
  );
  if (
    match &&
    match.classification !== entry.classification &&
    match.classification !== 'ALREADY_IDENTICAL'
  ) {
    throw new Error(
      `Classification drift for ${entry.alias}: expected ${entry.classification}, observed ${match.classification}`,
    );
  }

  const legacySubsegmentIds = simulated.legacySubsegmentsWouldReplace.filter(
    (subId) => group.coalescedFromSegmentIds.includes(subId),
  );

  return {
    payload: buildUpsertPayload(vehicle.vehicleId, group),
    coalesced: group,
    legacySubsegmentIds,
    coalescedGroups: coalesced,
    mechanismOutcomes: fetchResult.outcomes,
  };
}

async function reconcileCanonicalRechargeLegacySubsegments(options: {
  prisma: PrismaClient;
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
  coalesced: CoalescedEnergySegment[];
  mechanismOutcomes: Array<{ mechanism: string; status: string }>;
}): Promise<number> {
  const { prunedCount } = await pruneStaleCoalescedSubSegments({
    vehicleId: options.vehicleId,
    windowFrom: options.windowFrom,
    windowTo: options.windowTo,
    coalesced: options.coalesced,
    mechanismOutcomes: options.mechanismOutcomes,
    findEnergyEventByDimoSegmentId: (dimoSegmentId) =>
      options.prisma.vehicleEnergyEvent.findUnique({
        where: { dimoSegmentId },
      }),
    findStaleCandidates: (staleSubsegmentIds) =>
      options.prisma.vehicleEnergyEvent.findMany({
        where: {
          vehicleId: options.vehicleId,
          startTime: { gte: options.windowFrom, lte: options.windowTo },
          dimoSegmentId: { in: staleSubsegmentIds },
        },
        select: { id: true, dimoSegmentId: true },
      }),
    deleteEnergyEventsByIds: async (ids) => {
      if (ids.length === 0) {
        return 0;
      }
      const result = await options.prisma.vehicleEnergyEvent.deleteMany({
        where: { id: { in: ids } },
      });
      return result.count;
    },
  });
  return prunedCount;
}

export async function collectProvenStaleRechargeSubsegmentIdsFromReport(options: {
  report: EnergyRecoveryDryRunReport;
  vehiclesById: Map<string, RecoveryVehicleInput>;
  fetchSegments: RecoveryDryRunDeps['fetchSegments'];
}): Promise<Set<string>> {
  const windows = new Set<string>();
  const staleIds = new Set<string>();

  for (const candidate of options.report.candidates) {
    if (candidate.mechanism !== 'recharge') {
      continue;
    }
    const windowKey = `${candidate.vehicleId}:${candidate.windowFrom}:${candidate.windowTo}`;
    if (windows.has(windowKey)) {
      continue;
    }
    windows.add(windowKey);

    const vehicle = options.vehiclesById.get(candidate.vehicleId);
    const inventory = options.report.vehicles.find(
      (row) => row.vehicleId === candidate.vehicleId,
    );
    if (!vehicle || !inventory) {
      continue;
    }

    const fetchResult = await options.fetchSegments(
      vehicle.tokenId,
      new Date(candidate.windowFrom),
      new Date(candidate.windowTo),
      inventory.energyClass,
    );
    const persistable = fetchResult.segments.filter(isSegmentPersistable);
    const coalesced = coalesceSegments(persistable);
    const authorization = resolveStaleSubsegmentPruneAuthorization(
      coalesced,
      fetchResult.outcomes,
    );
    if (authorization) {
      for (const subsegmentId of authorization.staleSubsegmentIds) {
        staleIds.add(subsegmentId);
      }
    }
  }

  return staleIds;
}

export async function reconcileCanonicalRechargeWindowsFromReport(options: {
  prisma: PrismaClient;
  report: EnergyRecoveryDryRunReport;
  vehiclesById: Map<string, RecoveryVehicleInput>;
  fetchSegments: RecoveryDryRunDeps['fetchSegments'];
}): Promise<number> {
  const windows = new Set<string>();
  let reconciled = 0;

  for (const candidate of options.report.candidates) {
    if (candidate.mechanism !== 'recharge') {
      continue;
    }
    const windowKey = `${candidate.vehicleId}:${candidate.windowFrom}:${candidate.windowTo}`;
    if (windows.has(windowKey)) {
      continue;
    }
    windows.add(windowKey);

    const vehicle = options.vehiclesById.get(candidate.vehicleId);
    const inventory = options.report.vehicles.find(
      (row) => row.vehicleId === candidate.vehicleId,
    );
    if (!vehicle || !inventory) {
      continue;
    }

    const fetchResult = await options.fetchSegments(
      vehicle.tokenId,
      new Date(candidate.windowFrom),
      new Date(candidate.windowTo),
      inventory.energyClass,
    );
    const persistable = fetchResult.segments.filter(isSegmentPersistable);
    const coalesced = coalesceSegments(persistable);
    reconciled += await reconcileCanonicalRechargeLegacySubsegments({
      prisma: options.prisma,
      vehicleId: candidate.vehicleId,
      windowFrom: new Date(candidate.windowFrom),
      windowTo: new Date(candidate.windowTo),
      coalesced,
      mechanismOutcomes: fetchResult.outcomes,
    });
  }

  return reconciled;
}

async function applyUpsertPayload(
  prisma: PrismaClient,
  payload: EnergyEventUpsertPayload,
  requestedAction: 'CREATE' | 'UPDATE',
): Promise<{ result: WriteActionResult; rowId: string | null }> {
  const existing = await prisma.vehicleEnergyEvent.findUnique({
    where: { dimoSegmentId: payload.dimoSegmentId },
  });

  const data = {
    vehicleId: payload.vehicleId,
    kind: payload.kind,
    detectionMechanism: payload.detectionMechanism,
    startTime: payload.startTime,
    endTime: payload.endTime,
    durationSeconds: payload.durationSeconds,
    startLatitude: payload.startLatitude,
    startLongitude: payload.startLongitude,
    endLatitude: payload.endLatitude,
    endLongitude: payload.endLongitude,
    fuelDeltaLiters: payload.fuelDeltaLiters,
    fuelDeltaPercent: payload.fuelDeltaPercent,
    socDeltaPercent: payload.socDeltaPercent,
    energyDeltaKwh: payload.energyDeltaKwh,
    odometerStartKm: payload.odometerStartKm,
    odometerEndKm: payload.odometerEndKm,
    confidence: payload.confidence,
    rawDetectionMeta: payload.rawDetectionMeta as object,
  };

  if (existing) {
    if (isMateriallyIdentical(existing, payload)) {
      return { result: 'NO_OP_ALREADY_PRESENT', rowId: existing.id };
    }
    if (requestedAction === 'CREATE') {
      return { result: 'CONFLICT', rowId: existing.id };
    }
    const row = await prisma.vehicleEnergyEvent.update({
      where: { id: existing.id },
      data,
    });
    return { result: 'UPDATED', rowId: row.id };
  }

  if (requestedAction === 'UPDATE') {
    return { result: 'CONFLICT', rowId: null };
  }

  const row = await prisma.vehicleEnergyEvent.create({
    data: { ...data, dimoSegmentId: payload.dimoSegmentId },
  });
  return { result: 'CREATED', rowId: row.id };
}

export async function executeControlledWriteBackfill(options: {
  prisma: PrismaClient;
  vehicles: RecoveryVehicleInput[];
  recoveryPlan: EnergyEventsRecoveryPlan;
  fetchSegments: RecoveryDryRunDeps['fetchSegments'];
  applyWrites: boolean;
  verifyIdempotency: boolean;
  interRequestDelayMs?: number;
  codeSha?: string;
  completeRemaining?: boolean;
}): Promise<ControlledWriteBackfillResult> {
  const delayMs =
    options.interRequestDelayMs ?? ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS;
  const vehiclesById = new Map(
    options.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]),
  );

  const preWriteSnapshot = await captureEnergyEventsTableSnapshot(options.prisma);

  const preWriteReport = await runEnergyEventsRecoveryDryRun(options.vehicles, {
    fetchSegments: options.fetchSegments,
    interRequestDelayMs: delayMs,
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    recoveryPlan: options.recoveryPlan,
  });

  if (!options.completeRemaining) {
    validatePreWriteReport(preWriteReport);
  }
  const writeSet = options.completeRemaining
    ? buildRemainingWriteSet(preWriteReport)
    : buildWriteSet(preWriteReport);

  const audit: SanitizedWriteAuditEntry[] = [];
  let legacySubsegmentsReconciledTotal = 0;

  if (!options.applyWrites) {
    return {
      codeSha: options.codeSha ?? 'unknown',
      recoveryPlanVersion: options.recoveryPlan.planVersion,
      preWriteSnapshot,
      preWriteReport: {
        ...preWriteReport,
        candidates: [],
        manualReviewReport: preWriteReport.manualReviewReport.map((entry) => ({
          ...entry,
          vehicle: 'redacted',
          tokenId: 0,
          dimoSegmentId: 'redacted',
        })),
      },
      writeSet: writeSet.map((entry) => ({
        ...entry,
        dimoSegmentId: 'redacted',
        vehicleId: 'redacted',
        existingRowId: null,
        legacySubsegmentIds: [],
      })),
      audit,
      legacySubsegmentsReconciledTotal: 0,
      applied: false,
      idempotencyVerified: false,
    };
  }

  if (options.completeRemaining) {
    legacySubsegmentsReconciledTotal += await reconcileCanonicalRechargeWindowsFromReport({
      prisma: options.prisma,
      report: preWriteReport,
      vehiclesById,
      fetchSegments: options.fetchSegments,
    });

    const refreshedVehicles = await refreshVehicleExistingEvents(
      options.prisma,
      options.vehicles,
    );
    for (const vehicle of refreshedVehicles) {
      vehiclesById.set(vehicle.vehicleId, vehicle);
    }
    options.vehicles = refreshedVehicles;
    const refreshedReport = await runEnergyEventsRecoveryDryRun(refreshedVehicles, {
      fetchSegments: options.fetchSegments,
      interRequestDelayMs: delayMs,
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      recoveryPlan: options.recoveryPlan,
    });
    const provenStaleSubsegmentIds =
      await collectProvenStaleRechargeSubsegmentIdsFromReport({
        report: refreshedReport,
        vehiclesById,
        fetchSegments: options.fetchSegments,
      });
    writeSet.length = 0;
    writeSet.push(
      ...buildRemainingWriteSet(refreshedReport, provenStaleSubsegmentIds),
    );
  }

  for (let index = 0; index < writeSet.length; index++) {
    const entry = writeSet[index];
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const vehicle = vehiclesById.get(entry.vehicleId);
    if (!vehicle) {
      audit.push({
        alias: entry.alias,
        mechanism: entry.mechanism,
        requestedAction: entry.requestedAction,
        result: 'FAILED',
        legacySubsegmentsReconciled: 0,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    try {
      const resolved = await resolvePayloadForWriteEntry(
        entry,
        vehicle,
        options.fetchSegments,
      );

      const txResult = await options.prisma.$transaction(async (tx) => {
        const upsert = await applyUpsertPayload(
          tx as PrismaClient,
          resolved.payload,
          entry.requestedAction,
        );

        let reconciled = 0;
        if (
          entry.mechanism === 'recharge' &&
          (upsert.result === 'UPDATED' ||
            upsert.result === 'NO_OP_ALREADY_PRESENT')
        ) {
          reconciled = await reconcileCanonicalRechargeLegacySubsegments({
            prisma: tx as PrismaClient,
            vehicleId: entry.vehicleId,
            windowFrom: new Date(entry.windowFrom),
            windowTo: new Date(entry.windowTo),
            coalesced: resolved.coalescedGroups,
            mechanismOutcomes: resolved.mechanismOutcomes,
          });
        }

        return { upsert, reconciled };
      });

      legacySubsegmentsReconciledTotal += txResult.reconciled;
      audit.push({
        alias: entry.alias,
        mechanism: entry.mechanism,
        requestedAction: entry.requestedAction,
        result: txResult.upsert.result,
        legacySubsegmentsReconciled: txResult.reconciled,
        timestamp: new Date().toISOString(),
      });

      if (txResult.upsert.result === 'CONFLICT') {
        throw new Error(`Write conflict on ${entry.alias}`);
      }
    } catch (error) {
      audit.push({
        alias: entry.alias,
        mechanism: entry.mechanism,
        requestedAction: entry.requestedAction,
        result: 'FAILED',
        legacySubsegmentsReconciled: 0,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  const postWriteSnapshot = await captureEnergyEventsTableSnapshot(options.prisma);
  let vehiclesAfterWrite = await refreshVehicleExistingEvents(
    options.prisma,
    options.vehicles,
  );
  let postWriteReport = await runEnergyEventsRecoveryDryRun(vehiclesAfterWrite, {
    fetchSegments: options.fetchSegments,
    interRequestDelayMs: delayMs,
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    recoveryPlan: options.recoveryPlan,
  });

  if (options.completeRemaining) {
    legacySubsegmentsReconciledTotal += await reconcileCanonicalRechargeWindowsFromReport({
      prisma: options.prisma,
      report: postWriteReport,
      vehiclesById,
      fetchSegments: options.fetchSegments,
    });
    vehiclesAfterWrite = await refreshVehicleExistingEvents(
      options.prisma,
      options.vehicles,
    );
    postWriteReport = await runEnergyEventsRecoveryDryRun(vehiclesAfterWrite, {
      fetchSegments: options.fetchSegments,
      interRequestDelayMs: delayMs,
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      recoveryPlan: options.recoveryPlan,
    });
  }

  validatePostWriteCompletionReport(postWriteReport);

  let idempotencyReport: EnergyRecoveryDryRunReport | undefined;
  let idempotencyVerified = false;

  if (options.verifyIdempotency) {
    for (let index = 0; index < writeSet.length; index++) {
      const entry = writeSet[index];
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }
      const vehicle = vehiclesById.get(entry.vehicleId)!;
      const resolved = await resolvePayloadForWriteEntry(
        entry,
        vehicle,
        options.fetchSegments,
      );
      const upsert = await applyUpsertPayload(
        options.prisma,
        resolved.payload,
        entry.requestedAction,
      );
      if (upsert.result !== 'NO_OP_ALREADY_PRESENT') {
        throw new Error(
          `Idempotency failure on ${entry.alias}: ${upsert.result}`,
        );
      }
    }

    idempotencyReport = await runEnergyEventsRecoveryDryRun(vehiclesAfterWrite, {
      fetchSegments: options.fetchSegments,
      interRequestDelayMs: delayMs,
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      recoveryPlan: options.recoveryPlan,
    });
    validateIdempotencyReport(idempotencyReport);
    idempotencyVerified = true;
  }

  const created = audit.filter((entry) => entry.result === 'CREATED').length;
  const updated = audit.filter((entry) => entry.result === 'UPDATED').length;
  if (created + updated > 0 && postWriteSnapshot.tableDigest === preWriteSnapshot.tableDigest) {
    throw new Error('Post-write digest unchanged despite successful mutations');
  }

  return {
    codeSha: options.codeSha ?? 'unknown',
    recoveryPlanVersion: options.recoveryPlan.planVersion,
    preWriteSnapshot,
    preWriteReport: {
      ...preWriteReport,
      candidates: [],
      manualReviewReport: [],
    },
    writeSet: writeSet.map((entry) => ({
      ...entry,
      dimoSegmentId: 'redacted',
      vehicleId: 'redacted',
      existingRowId: null,
      legacySubsegmentIds: [],
    })),
    audit,
    postWriteSnapshot,
    postWriteReport: {
      ...postWriteReport,
      candidates: [],
      manualReviewReport: [],
    },
    idempotencyReport,
    legacySubsegmentsReconciledTotal,
    applied: true,
    idempotencyVerified,
  };
}
