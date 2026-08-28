/**
 * READ-ONLY forensic closure diagnostic for the E3A energy-event recovery.
 *
 * Performs no CREATE/UPDATE/DELETE: the Prisma client is wrapped in the
 * recovery mutation guard, so any accidental write throws.
 *
 * For every pending WOULD_UPDATE candidate it prints:
 *  - the canonical field-by-field diff (SEMANTIC vs NON_SEMANTIC_METADATA)
 *  - the current DIMO segment representation of the same physical window
 *  - deterministic prune-authority assessment against persisted provenance
 * plus the unresolved manual-review population.
 *
 * Output is sanitized: vehicle ids, DIMO token ids, row ids and coordinates are
 * replaced by stable aliases.
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import type { DimoEnergyEventSegment } from '../../src/modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '../../src/modules/dimo/energy-events/energy-mechanism-fetch.types';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import { buildRecoveryVehicleInput } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
  type RecoveryExistingEnergyEvent,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import { runEnergyEventsRecoveryDryRun } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import { captureEnergyEventsTableSnapshot } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  buildUpsertPayload,
  coalesceSegments,
  isSegmentPersistable,
  type CoalescedEnergySegment,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events.pipeline';
import {
  assessOverlapPopulation,
  assessSubsegmentProvenance,
  diffCanonicalMaterialIdentity,
  readStoredCoalesceProvenance,
  redactSegmentIdentity,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-forensics';
import {
  fetchEnergyEventSegmentsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
} from './energy-events-standalone-dimo-fetch';

{
  const envPath = require('path').resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const PLAN_PATH = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();
const OUTPUT_PATH = process.argv
  .find((arg) => arg.startsWith('--out='))
  ?.slice('--out='.length);

interface CapturedWindowFetch {
  tokenId: number;
  windowFrom: string;
  windowTo: string;
  segments: DimoEnergyEventSegment[];
  outcomes: EnergyMechanismFetchOutcome[];
}

const tokenAliases = new Map<number, string>();
function aliasTokenId(tokenId: number): string {
  const existing = tokenAliases.get(tokenId);
  if (existing) return existing;
  const alias = `T${tokenAliases.size + 1}`;
  tokenAliases.set(tokenId, alias);
  return alias;
}

const vehicleAliases = new Map<string, string>();
function aliasVehicleId(vehicleId: string): string {
  const existing = vehicleAliases.get(vehicleId);
  if (existing) return existing;
  const alias = `V${vehicleAliases.size + 1}`;
  vehicleAliases.set(vehicleId, alias);
  return alias;
}

const rowAliases = new Map<string, string>();
function aliasRowId(rowId: string | null): string | null {
  if (!rowId) return null;
  const existing = rowAliases.get(rowId);
  if (existing) return existing;
  const alias = `ROW${rowAliases.size + 1}`;
  rowAliases.set(rowId, alias);
  return alias;
}

const opaqueSegmentAliases = new Map<string, string>();

/**
 * Canonical `dimo-<mechanism>-<tokenId>-...` ids keep their readable shape with
 * the token id aliased. Provider-issued opaque ids are replaced wholesale so no
 * upstream identifier can leak into shared output.
 */
function aliasSegmentId(segmentId: string): string {
  const redacted = redactSegmentIdentity(segmentId, aliasTokenId);
  if (redacted !== segmentId) return redacted;
  const existing = opaqueSegmentAliases.get(segmentId);
  if (existing) return existing;
  const alias = `SEG${opaqueSegmentAliases.size + 1}`;
  opaqueSegmentAliases.set(segmentId, alias);
  return alias;
}

function sanitizeSegment(segment: DimoEnergyEventSegment) {
  return {
    segmentId: aliasSegmentId(segment.segmentId),
    mechanism: segment.mechanism,
    startTime: segment.startTime,
    endTime: segment.endTime,
    isOngoing: segment.isOngoing,
    startedBeforeRange: segment.startedBeforeRange,
    durationSeconds: segment.durationSeconds,
    hasStartGeo: segment.startLatitude != null && segment.startLongitude != null,
    hasEndGeo: segment.endLatitude != null && segment.endLongitude != null,
    odometerStartKm: segment.odometerStartKm,
    odometerEndKm: segment.odometerEndKm,
    fuelStartLiters: segment.fuelStartLiters,
    fuelEndLiters: segment.fuelEndLiters,
    fuelDeltaLiters: segment.fuelDeltaLiters,
    fuelStartPercent: segment.fuelStartPercent,
    fuelEndPercent: segment.fuelEndPercent,
    fuelDeltaPercent: segment.fuelDeltaPercent,
    socStartPercent: segment.socStartPercent,
    socEndPercent: segment.socEndPercent,
    socDeltaPercent: segment.socDeltaPercent,
    energyStartKwh: segment.energyStartKwh,
    energyEndKwh: segment.energyEndKwh,
    energyDeltaKwh: segment.energyDeltaKwh,
    persistable: isSegmentPersistable(segment),
  };
}

function sanitizeMeta(meta: unknown): unknown {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return meta ?? null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (key === 'coalescedFromSegmentIds' && Array.isArray(value)) {
      out[key] = value.map((item) =>
        typeof item === 'string' ? aliasSegmentId(item) : item,
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Row write provenance, read separately so the production recovery read path
 * keeps its narrow column selection. Distinguishes rows this recovery wrote
 * from rows that predate it.
 */
const rowWriteProvenance = new Map<string, { createdAt: string; updatedAt: string }>();

function sanitizeDbRow(row: RecoveryExistingEnergyEvent) {
  const provenance = readStoredCoalesceProvenance(row.rawDetectionMeta);
  const writeProvenance = rowWriteProvenance.get(row.id) ?? null;
  return {
    rowAlias: aliasRowId(row.id),
    createdAt: writeProvenance?.createdAt ?? null,
    updatedAt: writeProvenance?.updatedAt ?? null,
    dimoSegmentId: aliasSegmentId(row.dimoSegmentId),
    kind: row.kind,
    detectionMechanism: row.detectionMechanism,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationSeconds: row.durationSeconds,
    hasStartGeo: row.startLatitude != null && row.startLongitude != null,
    hasEndGeo: row.endLatitude != null && row.endLongitude != null,
    fuelDeltaLiters: row.fuelDeltaLiters,
    fuelDeltaPercent: row.fuelDeltaPercent,
    socDeltaPercent: row.socDeltaPercent,
    energyDeltaKwh: row.energyDeltaKwh,
    odometerStartKm: row.odometerStartKm,
    odometerEndKm: row.odometerEndKm,
    confidence: row.confidence,
    rawDetectionMeta: sanitizeMeta(row.rawDetectionMeta),
    storedCoalesceProvenance: {
      coalescedFromCount: provenance.coalescedFromCount,
      coalescedFromSegmentIds:
        provenance.coalescedFromSegmentIds.map(aliasSegmentId),
    },
  };
}

function sanitizePayloadMeta(payload: ReturnType<typeof buildUpsertPayload>) {
  return {
    dimoSegmentId: aliasSegmentId(payload.dimoSegmentId),
    kind: payload.kind,
    detectionMechanism: payload.detectionMechanism,
    startTime: payload.startTime.toISOString(),
    endTime: payload.endTime.toISOString(),
    durationSeconds: payload.durationSeconds,
    fuelDeltaLiters: payload.fuelDeltaLiters,
    fuelDeltaPercent: payload.fuelDeltaPercent,
    socDeltaPercent: payload.socDeltaPercent,
    energyDeltaKwh: payload.energyDeltaKwh,
    odometerStartKm: payload.odometerStartKm,
    odometerEndKm: payload.odometerEndKm,
    confidence: payload.confidence,
    rawDetectionMeta: sanitizeMeta(payload.rawDetectionMeta),
  };
}

function sanitizeDiff(diff: ReturnType<typeof diffCanonicalMaterialIdentity>) {
  return {
    materiallyIdentical: diff.materiallyIdentical,
    semanticDiffCount: diff.semanticDiffCount,
    nonSemanticDiffCount: diff.nonSemanticDiffCount,
    fieldDiffs: diff.fieldDiffs,
    metaDiffs: diff.metaDiffs.map((entry) => ({
      key: entry.key,
      diffClass: entry.diffClass,
      fieldClass: entry.fieldClass,
      dbValue:
        entry.key === 'coalescedFromSegmentIds' && Array.isArray(entry.dbValue)
          ? entry.dbValue.map((item) =>
              typeof item === 'string' ? aliasSegmentId(item) : item,
            )
          : (entry.dbValue ?? null),
      detectorValue:
        entry.key === 'coalescedFromSegmentIds' &&
        Array.isArray(entry.detectorValue)
          ? entry.detectorValue.map((item) =>
              typeof item === 'string' ? aliasSegmentId(item) : item,
            )
          : (entry.detectorValue ?? null),
    })),
  };
}

async function main() {
  if (!process.env.DATABASE_URL || !PLAN_PATH) {
    throw new Error('DATABASE_URL and ENERGY_EVENTS_RECOVERY_PLAN_PATH required');
  }

  const recoveryPlan = parseEnergyEventsRecoveryPlan(
    JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')),
  );
  const rawPrisma = new PrismaClient();
  const snapshot = await captureEnergyEventsTableSnapshot(rawPrisma);
  const prisma = createMutationGuardedPrismaClient(rawPrisma);
  const repository = createPrismaRecoveryReadRepository(prisma);
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const rows = await repository.loadRecoveryVehicleDbRows({
    outageStart,
    recoveryCutoff,
  });

  for (const row of await prisma.vehicleEnergyEvent.findMany({
    where: { startTime: { gte: outageStart, lt: recoveryCutoff } },
    select: { id: true, createdAt: true, updatedAt: true },
  })) {
    rowWriteProvenance.set(row.id, {
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  const accounting = createDimoRequestAccounting();
  const tokenIds = rows.map((row) => row.tokenId);
  const dimoAccessByTokenId = await probeDimoAccessForTokenIds(tokenIds, accounting);
  const accessibleTokenIds = tokenIds.filter((tokenId) => dimoAccessByTokenId[tokenId]);
  const availableSignalsByTokenId = await probeAvailableSignalsForTokenIds(
    accessibleTokenIds,
    accounting,
  );
  const vehicles = rows.map((row) =>
    buildRecoveryVehicleInput(
      { ...row, dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false },
      availableSignalsByTokenId[row.tokenId] ?? null,
      'full',
    ),
  );

  const captured: CapturedWindowFetch[] = [];
  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: async (tokenId, from, to, energyClass) => {
      const result = await fetchEnergyEventSegmentsStandalone(
        tokenId,
        from,
        to,
        energyClass,
      );
      captured.push({
        tokenId,
        windowFrom: from.toISOString(),
        windowTo: to.toISOString(),
        segments: result.segments,
        outcomes: result.outcomes,
      });
      return result;
    },
    interRequestDelayMs: 500,
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    recoveryPlan,
  });

  const existingEventsByVehicleId = new Map(
    vehicles.map((vehicle) => [vehicle.vehicleId, vehicle.existingEvents]),
  );
  const tokenIdByVehicleId = new Map(
    vehicles.map((vehicle) => [vehicle.vehicleId, vehicle.tokenId]),
  );

  function coalescedGroupsForWindow(
    tokenId: number,
    windowFrom: string,
  ): CoalescedEnergySegment[] {
    const fetch = captured.find(
      (entry) => entry.tokenId === tokenId && entry.windowFrom === windowFrom,
    );
    if (!fetch) return [];
    const successfulMechanisms = new Set(
      fetch.outcomes
        .filter((outcome) => outcome.status !== 'FAILED')
        .map((outcome) => outcome.mechanism),
    );
    return coalesceSegments(
      fetch.segments
        .filter((segment) => successfulMechanisms.has(segment.mechanism))
        .filter(isSegmentPersistable),
    );
  }

  /** Segment ids the current detector emits as their own persistable event. */
  const currentlyEmittedByTokenId = new Map<number, Set<string>>();
  for (const entry of captured) {
    const groups = coalescedGroupsForWindow(entry.tokenId, entry.windowFrom);
    const set =
      currentlyEmittedByTokenId.get(entry.tokenId) ?? new Set<string>();
    for (const group of groups) set.add(group.coalescedSegmentId);
    currentlyEmittedByTokenId.set(entry.tokenId, set);
  }

  const pending = report.candidates.filter(
    (candidate) =>
      candidate.classification === 'WOULD_CREATE' ||
      candidate.classification === 'WOULD_UPDATE',
  );

  const unresolvedManualReviewSegmentIds = new Set(
    report.manualReviewReport
      .filter(
        (entry) =>
          entry.recommendation !== 'APPROVE_FOR_BACKFILL' &&
          entry.recommendation !== 'EXCLUDE_FROM_BACKFILL',
      )
      .map((entry) => entry.dimoSegmentId),
  );

  /** Pending writes plus every candidate that still blocks the gate. */
  const analysisTargets = report.candidates.filter(
    (candidate) =>
      candidate.classification === 'WOULD_CREATE' ||
      candidate.classification === 'WOULD_UPDATE' ||
      (candidate.classification === 'MANUAL_REVIEW_REQUIRED' &&
        unresolvedManualReviewSegmentIds.has(candidate.dimoSegmentId)),
  );

  /**
   * Every window whose fetch mentions one of the candidate's segment ids. A
   * canonical event that appears with different payloads in two adjacent
   * windows can never converge to ALREADY_IDENTICAL, so this is captured
   * explicitly.
   */
  function crossWindowOccurrences(
    tokenId: number,
    relevantSegmentIds: Set<string>,
    canonicalDimoSegmentId: string,
    vehicleId: string,
    dbRow: RecoveryExistingEnergyEvent | null,
  ) {
    return captured
      .filter((entry) => entry.tokenId === tokenId)
      .map((entry) => {
        const matching = entry.segments.filter((segment) =>
          relevantSegmentIds.has(segment.segmentId),
        );
        const groups = coalescedGroupsForWindow(entry.tokenId, entry.windowFrom);
        const group =
          groups.find(
            (candidateGroup) =>
              candidateGroup.coalescedSegmentId === canonicalDimoSegmentId,
          ) ?? null;
        if (matching.length === 0 && !group) return null;
        const payload = group ? buildUpsertPayload(vehicleId, group) : null;
        return {
          windowFrom: entry.windowFrom,
          windowTo: entry.windowTo,
          matchingSegments: matching.map(sanitizeSegment),
          canonicalGroupPresent: Boolean(group),
          canonicalGroupPayload: payload ? sanitizePayloadMeta(payload) : null,
          diffAgainstDbRow:
            dbRow && payload
              ? sanitizeDiff(diffCanonicalMaterialIdentity(dbRow, payload))
              : null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  }

  const candidateForensics = analysisTargets.map((candidate) => {
    const tokenId = tokenIdByVehicleId.get(candidate.vehicleId) ?? candidate.tokenId;
    const groups = coalescedGroupsForWindow(tokenId, candidate.windowFrom);
    const group =
      groups.find(
        (entry) => entry.coalescedSegmentId === candidate.dimoSegmentId,
      ) ?? null;
    const existingEvents = existingEventsByVehicleId.get(candidate.vehicleId) ?? [];
    const dbRow =
      existingEvents.find((row) => row.dimoSegmentId === candidate.dimoSegmentId) ??
      null;
    const payload = group ? buildUpsertPayload(candidate.vehicleId, group) : null;
    const windowFetch = captured.find(
      (entry) =>
        entry.tokenId === tokenId && entry.windowFrom === candidate.windowFrom,
    );

    const sameMechanismRows = existingEvents.filter(
      (row) =>
        row.kind === (candidate.mechanism === 'refuel' ? 'REFUEL' : 'RECHARGE'),
    );

    const overlapPopulation = assessOverlapPopulation({
      candidate: {
        dimoSegmentId: candidate.dimoSegmentId,
        startTime: new Date(candidate.startTime),
        endTime: new Date(candidate.endTime),
        socDeltaPercent: candidate.socDeltaPercent,
        energyDeltaKwh: candidate.energyDeltaKwh,
        coalescedFromSegmentIds: candidate.coalescedFromSegmentIds,
      },
      population: sameMechanismRows.map((row) => ({
        id: row.id,
        dimoSegmentId: row.dimoSegmentId,
        startTime: row.startTime,
        endTime: row.endTime,
        socDeltaPercent: row.socDeltaPercent,
        energyDeltaKwh: row.energyDeltaKwh,
      })),
    });

    const provenance =
      dbRow &&
      assessSubsegmentProvenance({
        row: {
          id: dbRow.id,
          dimoSegmentId: dbRow.dimoSegmentId,
          startTime: dbRow.startTime,
          endTime: dbRow.endTime,
          socDeltaPercent: dbRow.socDeltaPercent,
          energyDeltaKwh: dbRow.energyDeltaKwh,
        },
        candidateParentRows: sameMechanismRows.map((row) => ({
          ...row,
          startTime: row.startTime,
          endTime: row.endTime,
        })),
        detectedGroups: groups,
        vehicleId: candidate.vehicleId,
        currentlyEmittedSegmentIds:
          currentlyEmittedByTokenId.get(tokenId) ?? new Set<string>(),
      });

    return {
      vehicleAlias: aliasVehicleId(candidate.vehicleId),
      tokenAlias: aliasTokenId(tokenId),
      classification: candidate.classification,
      manualReviewReasons: candidate.manualReviewReasons,
      mechanism: candidate.mechanism,
      dimoSegmentId: aliasSegmentId(candidate.dimoSegmentId),
      coalescedFromSegmentIds:
        candidate.coalescedFromSegmentIds.map(aliasSegmentId),
      windowFrom: candidate.windowFrom,
      windowTo: candidate.windowTo,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      durationSeconds: candidate.durationSeconds,
      existingRowAlias: aliasRowId(candidate.existingRowId),
      detectorGroupFound: Boolean(group),
      detectorPayload: payload ? sanitizePayloadMeta(payload) : null,
      dbRow: dbRow ? sanitizeDbRow(dbRow) : null,
      canonicalDiff:
        dbRow && payload
          ? sanitizeDiff(diffCanonicalMaterialIdentity(dbRow, payload))
          : null,
      overlapPopulation: {
        ...overlapPopulation,
        candidateDimoSegmentId: aliasSegmentId(
          overlapPopulation.candidateDimoSegmentId,
        ),
        overlappingRowIds: overlapPopulation.overlappingRowIds.map(aliasRowId),
      },
      provenance: provenance
        ? {
            ...provenance,
            rowId: aliasRowId(provenance.rowId),
            dimoSegmentId: aliasSegmentId(provenance.dimoSegmentId),
            parentDimoSegmentId: provenance.parentDimoSegmentId
              ? aliasSegmentId(provenance.parentDimoSegmentId)
              : null,
          }
        : null,
      crossWindowOccurrences: crossWindowOccurrences(
        tokenId,
        new Set([candidate.dimoSegmentId, ...candidate.coalescedFromSegmentIds]),
        candidate.dimoSegmentId,
        candidate.vehicleId,
        dbRow,
      ),
      currentDimoWindowSegments:
        windowFetch?.segments
          .filter((segment) => segment.mechanism === candidate.mechanism)
          .map(sanitizeSegment) ?? [],
      detectorGroupsInWindow: groups
        .filter((entry) => entry.mechanism === candidate.mechanism)
        .map((entry) => ({
          coalescedSegmentId: aliasSegmentId(entry.coalescedSegmentId),
          coalescedFromSegmentIds:
            entry.coalescedFromSegmentIds.map(aliasSegmentId),
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationSeconds: entry.durationSeconds,
          socDeltaPercent: entry.socDeltaPercent,
          energyDeltaKwh: entry.energyDeltaKwh,
          fuelDeltaLiters: entry.fuelDeltaLiters,
        })),
      sameMechanismDbRowsInVehicle: sameMechanismRows.map(sanitizeDbRow),
    };
  });

  const manualReview = report.manualReviewReport.map((entry) => ({
    tokenAlias: aliasTokenId(entry.tokenId),
    mechanism: entry.mechanism,
    startTime: entry.startTime,
    endTime: entry.endTime,
    durationSeconds: entry.durationSeconds,
    socDeltaPercent: entry.socDeltaPercent,
    energyDeltaKwh: entry.energyDeltaKwh,
    fuelDeltaLiters: entry.fuelDeltaLiters,
    fuelDeltaPercent: entry.fuelDeltaPercent,
    odometerDeltaKm: entry.odometerDeltaKm,
    plausibilityReasons: entry.plausibilityReasons,
    overlapRelation: entry.overlapRelation
      ? entry.overlapRelation.replace(/dimo-\S+/g, (match) => aliasSegmentId(match))
      : null,
    existingDbRelation: entry.existingDbRelation ? 'present' : null,
    existingRowAlias: aliasRowId(entry.existingRowId),
    dimoSegmentId: aliasSegmentId(entry.dimoSegmentId),
    recommendation: entry.recommendation,
    resolved:
      entry.recommendation === 'APPROVE_FOR_BACKFILL' ||
      entry.recommendation === 'EXCLUDE_FROM_BACKFILL',
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    mutationGuard: 'vehicleEnergyEvent writes blocked',
    snapshot,
    summary: report.summary,
    gateBlockers: report.gateBlockers,
    backfillGate: report.backfillGate,
    legacySubsegmentsWouldReplaceCount: report.legacySubsegmentsWouldReplace.length,
    legacySubsegmentsWouldReplace:
      report.legacySubsegmentsWouldReplace.map(aliasSegmentId),
    fetchFailures: report.fetchFailures.length,
    recoveryPlan: report.recoveryPlan,
    pendingCount: pending.length,
    candidateForensics,
    manualReviewUnresolved: manualReview.filter((entry) => !entry.resolved),
    manualReviewResolvedCount: manualReview.filter((entry) => entry.resolved).length,
    acceptance: report.acceptance,
  };

  const serialized = JSON.stringify(output, null, 2);
  if (OUTPUT_PATH) {
    fs.writeFileSync(OUTPUT_PATH, serialized);
    console.log(`forensic report written: ${OUTPUT_PATH}`);
  } else {
    console.log(serialized);
  }
  await rawPrisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
