import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  EnergyRecoveryVehicleInventoryRow,
  ManualReviewEntry,
} from './energy-events-recovery.types';

export const FULL_SANITIZED_SUMMARY_ARTIFACT_FILENAME =
  'energy-events-recovery-full-sanitized-summary-2026-08.json';

/** Raw FULL DB preview artifacts must never be committed — secured storage only. */
export const RAW_FULL_DB_ARTIFACT_GLOB = 'energy-events-recovery-full-db-preview-*.json';

export type VehicleAlias =
  | 'ICE_A'
  | 'ICE_B'
  | 'ICE_C'
  | 'EV_A'
  | 'CANONICAL_REFUEL_CASE'
  | 'CANONICAL_RECHARGE_OVERLAP_CASE'
  | 'INACCESSIBLE_ICE'
  | 'UNKNOWN';

interface SanitizationContext {
  aliasByInventorySlot: Map<string, VehicleAlias>;
  canonicalRefuelSlot: string | null;
  canonicalRechargeOverlapSlot: string | null;
}

function inventorySlotKey(row: {
  vehicleId: string | null;
  energyClass: EnergyRecoveryVehicleInventoryRow['energyClass'];
  label: string;
}): string {
  return `${row.energyClass}:${row.vehicleId ?? row.label}`;
}

function candidateSlotKey(
  candidate: EnergyRecoveryCandidate,
  vehicles: EnergyRecoveryVehicleInventoryRow[],
): string {
  const row = vehicles.find(
    (vehicle) =>
      vehicle.vehicleId === candidate.vehicleId ||
      vehicle.tokenId === candidate.tokenId,
  );
  if (row) return inventorySlotKey(row);
  return `candidate:${candidate.vehicleId}`;
}

function manualReviewSlotKey(
  entry: ManualReviewEntry,
  vehicles: EnergyRecoveryVehicleInventoryRow[],
): string {
  const row = vehicles.find((vehicle) => vehicle.tokenId === entry.tokenId);
  if (row) return inventorySlotKey(row);
  return `manual-review:${entry.tokenId}`;
}

export function buildSanitizationContext(
  report: EnergyRecoveryDryRunReport,
): SanitizationContext {
  const aliasByInventorySlot = new Map<string, VehicleAlias>();

  const iceRows = report.vehicles
    .filter((row) => row.energyClass === 'REFUEL_CANDIDATE')
    .sort((left, right) => inventorySlotKey(left).localeCompare(inventorySlotKey(right)));
  const iceAliases: VehicleAlias[] = ['ICE_A', 'ICE_B', 'ICE_C'];
  iceRows.forEach((row, index) => {
    aliasByInventorySlot.set(
      inventorySlotKey(row),
      iceAliases[index] ?? 'UNKNOWN',
    );
  });

  const evRow = report.vehicles.find(
    (row) => row.energyClass === 'RECHARGE_CANDIDATE',
  );
  if (evRow) {
    aliasByInventorySlot.set(inventorySlotKey(evRow), 'EV_A');
  }

  const inaccessibleRow = report.vehicles.find(
    (row) => row.energyClass === 'DIMO_ACCESS_FAILED',
  );
  if (inaccessibleRow) {
    aliasByInventorySlot.set(inventorySlotKey(inaccessibleRow), 'INACCESSIBLE_ICE');
  }

  const canonicalRefuelCandidate = report.candidates.find(
    (candidate) =>
      candidate.mechanism === 'refuel' &&
      candidate.classification === 'WOULD_CREATE' &&
      report.acceptance.canonicalRefuel.found &&
      candidate.startTime === report.acceptance.canonicalRefuel.segmentStart,
  );

  const canonicalRechargeCandidate = report.candidates.find(
    (candidate) =>
      candidate.mechanism === 'recharge' &&
      candidate.classification === 'WOULD_UPDATE' &&
      candidate.existingRowId != null,
  );

  return {
    aliasByInventorySlot,
    canonicalRefuelSlot: canonicalRefuelCandidate
      ? candidateSlotKey(canonicalRefuelCandidate, report.vehicles)
      : null,
    canonicalRechargeOverlapSlot: canonicalRechargeCandidate
      ? candidateSlotKey(canonicalRechargeCandidate, report.vehicles)
      : null,
  };
}

export function durationBucket(seconds: number): string {
  if (seconds < 15 * 60) return 'under_15m';
  if (seconds < 2 * 60 * 60) return '15m_to_2h';
  if (seconds < 4 * 60 * 60) return '2h_to_4h';
  return 'over_4h';
}

export function odometerDeltaBucket(deltaKm: number | null | undefined): string | null {
  if (deltaKm == null) return null;
  const km = Math.abs(deltaKm);
  if (km <= 10) return '0_to_10km';
  if (km <= 50) return '11_to_50km';
  if (km <= 100) return '51_to_100km';
  if (km <= 150) return '101_to_150km';
  return 'over_150km';
}

export function fuelDeltaBucket(liters: number | null | undefined): string | null {
  if (liters == null) return null;
  const value = Math.abs(liters);
  if (value < 10) return 'under_10L';
  if (value <= 30) return '10_to_30L';
  return 'over_30L';
}

export function monthBucket(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

function resolveAlias(
  slotKey: string,
  ctx: SanitizationContext,
): VehicleAlias {
  if (slotKey === ctx.canonicalRefuelSlot) return 'CANONICAL_REFUEL_CASE';
  if (slotKey === ctx.canonicalRechargeOverlapSlot) {
    return 'CANONICAL_RECHARGE_OVERLAP_CASE';
  }
  return ctx.aliasByInventorySlot.get(slotKey) ?? 'UNKNOWN';
}

function sanitizeInventoryRow(
  row: EnergyRecoveryVehicleInventoryRow,
  ctx: SanitizationContext,
): Record<string, unknown> {
  return {
    alias: resolveAlias(inventorySlotKey(row), ctx),
    powertrain: row.powertrain,
    energyClass: row.energyClass,
    dimoAccessAvailable: row.dimoAccessAvailable,
    dbVehicleMapped: row.dbVehicleMapped,
    relativeFuelAvailable: row.relativeFuelAvailable,
    absoluteFuelAvailable: row.absoluteFuelAvailable,
    rechargeSocAvailable: row.rechargeSocAvailable,
    existingEventCountInWindow: row.existingEventCountInWindow,
  };
}

export function sanitizeCandidateEvidence(
  candidate: EnergyRecoveryCandidate,
  report: EnergyRecoveryDryRunReport,
  ctx: SanitizationContext = buildSanitizationContext(report),
): Record<string, unknown> {
  const odometerDeltaKm =
    candidate.odometerStartKm != null && candidate.odometerEndKm != null
      ? Math.abs(candidate.odometerEndKm - candidate.odometerStartKm)
      : null;

  return {
    alias: resolveAlias(candidateSlotKey(candidate, report.vehicles), ctx),
    classification: candidate.classification,
    mechanism: candidate.mechanism,
    month: monthBucket(candidate.startTime),
    durationBucket: durationBucket(candidate.durationSeconds),
    odometerDeltaBucket: odometerDeltaBucket(odometerDeltaKm),
    fuelDeltaBucket: fuelDeltaBucket(candidate.fuelDeltaLiters),
    confidence: candidate.confidence,
    manualReviewReasons: candidate.manualReviewReasons,
    overlapRelation: candidate.overlapRelation ?? null,
    existingDbRelation: candidate.existingDbRelation ?? null,
  };
}

export function sanitizeManualReviewEntry(
  entry: ManualReviewEntry,
  report: EnergyRecoveryDryRunReport,
  ctx: SanitizationContext = buildSanitizationContext(report),
): Record<string, unknown> {
  return {
    alias: resolveAlias(manualReviewSlotKey(entry, report.vehicles), ctx),
    mechanism: entry.mechanism,
    month: monthBucket(entry.startTime),
    durationBucket: durationBucket(entry.durationSeconds),
    odometerDeltaBucket: odometerDeltaBucket(entry.odometerDeltaKm),
    fuelDeltaBucket: fuelDeltaBucket(entry.fuelDeltaLiters),
    confidence: entry.confidence,
    plausibilityReasons: entry.plausibilityReasons,
    disposition: entry.recommendation,
  };
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

export function buildSanitizedFullSummaryArtifact(
  report: EnergyRecoveryDryRunReport,
): Record<string, unknown> {
  const ctx = buildSanitizationContext(report);
  const dispositionCounts = countBy(
    report.manualReviewReport.map((entry) => entry.recommendation),
  );
  const reasonCounts = countBy(
    report.manualReviewReport.flatMap((entry) => entry.plausibilityReasons),
  );

  const writeCandidates = report.candidates.filter((candidate) =>
    ['WOULD_CREATE', 'WOULD_UPDATE'].includes(candidate.classification),
  );

  return {
    artifactKind: 'sanitized_full_summary',
    privacyPolicy:
      'Repository-safe aggregate evidence only. Raw FULL DB preview reports with operational identifiers are generated on secured infrastructure and must not be committed.',
    generatedAt: report.generatedAt,
    codeShaUnderTest: report.codeShaUnderTest,
    baseMainSha: report.baseMainSha,
    detectorConfigVersion: report.detectorConfigVersion,
    refuelDetectorConfig: report.refuelDetectorConfig,
    rechargeDetectorConfig: report.rechargeDetectorConfig,
    outageStart: report.outageStart,
    recoveryCutoff: report.recoveryCutoff,
    windowSizeHours: report.windowSizeHours,
    mode: report.mode,
    dbComparisonEnabled: report.dbComparisonEnabled,
    dbComparisonStatus: report.dbComparisonStatus,
    dbVehicleMappingFailures: report.dbVehicleMappingFailures,
    vehicles: report.vehicles.map((row) => sanitizeInventoryRow(row, ctx)),
    requestAccounting: report.requestAccounting,
    refuelDetections: report.refuelDetections,
    rechargeDetections: report.rechargeDetections,
    deduplicatedCandidateCount: report.deduplicatedCandidateCount,
    summary: report.summary,
    classificationCounts: report.summary,
    reasonCounts,
    dispositionCounts,
    manualReviewResolvedSemantics: {
      APPROVE_FOR_BACKFILL: 'eligible_for_write',
      EXCLUDE_FROM_BACKFILL: 'intentionally_skipped_resolved',
      NEEDS_FURTHER_EVIDENCE: 'unresolved_blocker',
      resolvedDispositions: ['APPROVE_FOR_BACKFILL', 'EXCLUDE_FROM_BACKFILL'],
      blockingDispositions: ['NEEDS_FURTHER_EVIDENCE'],
    },
    manualReviewAggregate: {
      total: report.manualReviewCount,
      resolved:
        (dispositionCounts.APPROVE_FOR_BACKFILL ?? 0) +
        (dispositionCounts.EXCLUDE_FROM_BACKFILL ?? 0),
      unresolved: dispositionCounts.NEEDS_FURTHER_EVIDENCE ?? 0,
      excludeFromBackfill: dispositionCounts.EXCLUDE_FROM_BACKFILL ?? 0,
      needsFurtherEvidence: dispositionCounts.NEEDS_FURTHER_EVIDENCE ?? 0,
    },
    candidateEvidence: writeCandidates.map((candidate) =>
      sanitizeCandidateEvidence(candidate, report, ctx),
    ),
    manualReviewEvidence: report.manualReviewReport.map((entry) =>
      sanitizeManualReviewEntry(entry, report, ctx),
    ),
    canonicalAcceptance: {
      CANONICAL_REFUEL_CASE: {
        found: report.acceptance.canonicalRefuel.found,
        classification: report.acceptance.canonicalRefuel.classification,
        month: report.acceptance.canonicalRefuel.segmentStart
          ? monthBucket(report.acceptance.canonicalRefuel.segmentStart)
          : null,
      },
      CANONICAL_RECHARGE_OVERLAP_CASE: {
        detectedSessions: report.acceptance.canonicalEvRecharge.detectedSessions,
        wouldCreate: report.acceptance.canonicalEvRecharge.wouldCreate,
        wouldUpdate: report.summary.WOULD_UPDATE,
        alreadyIdentical: report.acceptance.canonicalEvRecharge.alreadyIdentical,
        manualReview: report.acceptance.canonicalEvRecharge.manualReview,
        writePhaseInvariant:
          'Jul-16 extended recharge session is SAME_PHYSICAL_SESSION / WOULD_UPDATE; reconcile overlapping legacy recharge subsegments before write-back to avoid duplicate logical charge sessions.',
      },
    },
    trafficBudget: report.trafficBudget,
    fetchFailures: report.fetchFailures.length,
    dbWritesPerformed: report.dbWritesPerformed,
    backfillGate: report.backfillGate,
    manualReviewCount: report.manualReviewCount,
    gateBlockers: report.gateBlockers,
    zeroWriteStatus: report.dbWritesPerformed === false,
    finalGate: report.backfillGate,
  };
}

export function buildSanitizedQuickArtifact(
  report: EnergyRecoveryDryRunReport,
): Record<string, unknown> {
  const ctx = buildSanitizationContext(report);
  return {
    artifactKind: 'sanitized_quick_evidence',
    privacyPolicy:
      'Repository-safe evidence only. Operational identifiers are omitted from committed artifacts.',
    generatedAt: report.generatedAt,
    codeShaUnderTest: report.codeShaUnderTest,
    baseMainSha: report.baseMainSha,
    detectorConfigVersion: report.detectorConfigVersion,
    refuelDetectorConfig: report.refuelDetectorConfig,
    rechargeDetectorConfig: report.rechargeDetectorConfig,
    outageStart: report.outageStart,
    recoveryCutoff: report.recoveryCutoff,
    windowSizeHours: report.windowSizeHours,
    mode: report.mode,
    dbComparisonEnabled: report.dbComparisonEnabled,
    dbComparisonStatus: report.dbComparisonStatus,
    vehicles: report.vehicles.map((row) => sanitizeInventoryRow(row, ctx)),
    requestAccounting: report.requestAccounting,
    refuelDetections: report.refuelDetections,
    rechargeDetections: report.rechargeDetections,
    deduplicatedCandidateCount: report.deduplicatedCandidateCount,
    summary: report.summary,
    candidateEvidence: report.candidates.map((candidate) =>
      sanitizeCandidateEvidence(candidate, report, ctx),
    ),
    trafficBudget: report.trafficBudget,
    acceptance: {
      CANONICAL_REFUEL_CASE: {
        found: report.acceptance.canonicalRefuel.found,
        classification: report.acceptance.canonicalRefuel.classification,
        month: report.acceptance.canonicalRefuel.segmentStart
          ? monthBucket(report.acceptance.canonicalRefuel.segmentStart)
          : null,
      },
      EV_A: report.acceptance.canonicalEvRecharge,
    },
    dbWritesPerformed: report.dbWritesPerformed,
    backfillGate: report.backfillGate,
    manualReviewCount: report.manualReviewCount,
    gateBlockers: report.gateBlockers,
    zeroWriteStatus: report.dbWritesPerformed === false,
  };
}
