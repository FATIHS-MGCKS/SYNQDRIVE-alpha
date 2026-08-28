import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  EnergyRecoveryVehicleInventoryRow,
  ManualReviewEntry,
} from './energy-events-recovery.types';
import {
  KS_MX_2024_TOKEN_ID,
  TESLA_KS_FH_660E_TOKEN_ID,
} from './energy-events-recovery.constants';

export const FULL_SANITIZED_SUMMARY_ARTIFACT_FILENAME =
  'energy-events-recovery-full-sanitized-summary-2026-08.json';

/** Raw FULL DB preview artifacts must never be committed — VPS/private storage only. */
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

const TOKEN_ALIAS: Record<number, VehicleAlias> = {
  187784: 'ICE_A',
  187361: 'ICE_B',
  192922: 'ICE_C',
  186946: 'EV_A',
  187336: 'CANONICAL_REFUEL_CASE',
  190497: 'INACCESSIBLE_ICE',
};

export function vehicleAliasForToken(tokenId: number): VehicleAlias {
  return TOKEN_ALIAS[tokenId] ?? 'UNKNOWN';
}

export function vehicleAliasForLabel(label: string): VehicleAlias {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('ks mx')) return 'CANONICAL_REFUEL_CASE';
  if (normalized.includes('golf') || normalized.includes('9755')) return 'INACCESSIBLE_ICE';
  if (normalized.includes('tiguan') || normalized.includes('7503')) return 'ICE_C';
  if (normalized.includes('arteon') || normalized.includes('hmü')) return 'ICE_A';
  if (normalized.includes('ks ms') || normalized.includes('audi a4')) return 'ICE_B';
  if (normalized.includes('tesla') || normalized.includes('ks fh')) return 'EV_A';
  return 'UNKNOWN';
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

function sanitizeInventoryRow(
  row: EnergyRecoveryVehicleInventoryRow,
): Record<string, unknown> {
  const alias = vehicleAliasForToken(row.tokenId);
  return {
    alias,
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
): Record<string, unknown> {
  const alias =
    candidate.tokenId === KS_MX_2024_TOKEN_ID &&
    candidate.classification === 'WOULD_CREATE' &&
    candidate.mechanism === 'refuel'
      ? 'CANONICAL_REFUEL_CASE'
      : candidate.tokenId === TESLA_KS_FH_660E_TOKEN_ID &&
          candidate.classification === 'WOULD_UPDATE' &&
          candidate.mechanism === 'recharge'
        ? 'CANONICAL_RECHARGE_OVERLAP_CASE'
        : vehicleAliasForToken(candidate.tokenId);

  const odometerDeltaKm =
    candidate.odometerStartKm != null && candidate.odometerEndKm != null
      ? Math.abs(candidate.odometerEndKm - candidate.odometerStartKm)
      : null;

  return {
    alias,
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
): Record<string, unknown> {
  return {
    alias: vehicleAliasForLabel(entry.vehicle),
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
    vehicles: report.vehicles.map(sanitizeInventoryRow),
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
    candidateEvidence: writeCandidates.map(sanitizeCandidateEvidence),
    manualReviewEvidence: report.manualReviewReport.map(sanitizeManualReviewEntry),
    canonicalAcceptance: {
      CANONICAL_REFUEL_CASE: {
        found: report.acceptance.ksMx2024.found,
        classification: report.acceptance.ksMx2024.classification,
        month: report.acceptance.ksMx2024.segmentStart
          ? monthBucket(report.acceptance.ksMx2024.segmentStart)
          : null,
      },
      CANONICAL_RECHARGE_OVERLAP_CASE: {
        detectedSessions: report.acceptance.teslaRecharge.detectedSessions,
        wouldCreate: report.acceptance.teslaRecharge.wouldCreate,
        wouldUpdate: report.summary.WOULD_UPDATE,
        alreadyIdentical: report.acceptance.teslaRecharge.alreadyIdentical,
        manualReview: report.acceptance.teslaRecharge.manualReview,
        writePhaseInvariant:
          'Jul-16 Tesla session is SAME_PHYSICAL_SESSION / WOULD_UPDATE; reconcile overlapping legacy recharge subsegments before write-back to avoid duplicate logical charge sessions.',
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
  return {
    artifactKind: 'sanitized_quick_evidence',
    privacyPolicy:
      'Repository-safe evidence only. Operational identifiers (plates, tokenIds, UUIDs, exact odometer) are omitted.',
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
    vehicles: report.vehicles.map(sanitizeInventoryRow),
    requestAccounting: report.requestAccounting,
    refuelDetections: report.refuelDetections,
    rechargeDetections: report.rechargeDetections,
    deduplicatedCandidateCount: report.deduplicatedCandidateCount,
    summary: report.summary,
    candidateEvidence: report.candidates.map(sanitizeCandidateEvidence),
    trafficBudget: report.trafficBudget,
    acceptance: {
      CANONICAL_REFUEL_CASE: {
        found: report.acceptance.ksMx2024.found,
        classification: report.acceptance.ksMx2024.classification,
        month: report.acceptance.ksMx2024.segmentStart
          ? monthBucket(report.acceptance.ksMx2024.segmentStart)
          : null,
      },
      EV_A: report.acceptance.teslaRecharge,
    },
    dbWritesPerformed: report.dbWritesPerformed,
    backfillGate: report.backfillGate,
    manualReviewCount: report.manualReviewCount,
    gateBlockers: report.gateBlockers,
    zeroWriteStatus: report.dbWritesPerformed === false,
  };
}
