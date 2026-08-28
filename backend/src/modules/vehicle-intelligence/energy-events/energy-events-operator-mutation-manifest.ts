import { createHash } from 'crypto';
import type { EnergyEventsTableSnapshot } from './energy-events-recovery-write-backfill';
import {
  assessOverlapPopulation,
  readStoredCoalesceProvenance,
  type OverlapPopulationAssessment,
} from './energy-events-recovery-forensics';

export const OPERATOR_MUTATION_MANIFEST_VERSION = 'e3a-operator-m1-2026-08';

export type OperatorDisposition =
  | 'APPROVE_FOR_BACKFILL'
  | 'EXPLICIT_OPERATOR_AUTHORIZED_PRUNE';

/** Immutable identifying fingerprint used for pre-mutation invariant checks. */
export interface EnergyEventRowFingerprint {
  rowId: string;
  vehicleId: string;
  dimoSegmentId: string;
  kind: 'REFUEL' | 'RECHARGE';
  detectionMechanism: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  fuelDeltaLiters: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: string;
  coalescedFromCount: number | null;
  coalescedFromSegmentIds: string[];
}

export interface OperatorManifestRow {
  disposition: OperatorDisposition;
  rowId: string | null;
  dimoSegmentId: string;
  mechanism: 'refuel' | 'recharge';
  vehicleId: string;
  fingerprint: EnergyEventRowFingerprint | null;
  forensicAlias: string | null;
  redundancyReason: string | null;
  overlapRelationshipToM1: string | null;
}

export interface OperatorMutationInvariants {
  expectedPreMutationRowCount: number;
  expectedM1PresentBeforeMutation: false;
  expectedLegacyPruneRowIds: string[];
  expectedLegacyPruneCount: number;
  expectedExcludedOverlapRowIds: string[];
  scopedDigestAlgorithm: 'sha256-over-id-dimo-updated';
  preMutationTableDigest: string;
  preMutationScopedDigest: string;
  abortOnUnexpectedOverlapOutsideManifest: true;
  abortOnMissingLegacyRow: true;
  abortOnFingerprintMismatch: true;
  abortOnM1AlreadyPresent: true;
}

export interface ExpectedPostMutationState {
  expectedRowCountDelta: number;
  expectedFinalRowCount: number;
  expectedM1Present: true;
  expectedLegacyPruneRowIdsAbsent: string[];
  expectedManualReviewUnresolvedCount: number;
  expectedWouldCreate: number;
  expectedWouldUpdate: number;
  expectedAlreadyIdentical: number;
  expectedGateBlockers: string[];
  notes: string[];
}

export interface OperatorManifestExcludedRow {
  rowId: string;
  dimoSegmentId: string;
  mechanism: 'refuel' | 'recharge';
  vehicleId: string;
  fingerprint: EnergyEventRowFingerprint;
  forensicAlias: string | null;
  exclusionReason: string;
  overlapRelationshipToM1: string;
}

export interface OperatorMutationManifest {
  manifestVersion: string;
  generatedAt: string;
  reviewProvenance: string;
  forensicClosureReference: string;
  preMutationSnapshot: EnergyEventsTableSnapshot;
  m1: OperatorManifestRow;
  explicitOperatorAuthorizedPrunes: OperatorManifestRow[];
  excludedFromPrune: OperatorManifestExcludedRow[];
  overlapPopulationAssessment: OverlapPopulationAssessment;
  invariants: OperatorMutationInvariants;
  expectedPostMutation: ExpectedPostMutationState;
  idempotencyExpectations: {
    secondDryRunWouldCreateForM1: 0;
    secondDryRunWouldUpdateFromPrecisionDrift: 0;
    secondDryRunPruneActionsForRemovedLegacyIds: 0;
    secondDryRunManualReviewUnresolvedForM1: 0;
    secondDryRunGateBlockers: string[];
  };
  rollback: {
    backupArtifactRequired: true;
    backupRowIds: string[];
    restoreOrder: Array<'DELETE_M1_IF_CREATED' | 'RESTORE_PRUNED_ROWS'>;
  };
}

export interface PersistedEnergyEventRow {
  id: string;
  vehicleId: string;
  dimoSegmentId: string;
  kind: 'REFUEL' | 'RECHARGE';
  detectionMechanism: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: string;
  rawDetectionMeta: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

function toIso(value: Date): string {
  return value.toISOString();
}

export function buildRowFingerprint(row: PersistedEnergyEventRow): EnergyEventRowFingerprint {
  const provenance = readStoredCoalesceProvenance(row.rawDetectionMeta);
  return {
    rowId: row.id,
    vehicleId: row.vehicleId,
    dimoSegmentId: row.dimoSegmentId,
    kind: row.kind,
    detectionMechanism: row.detectionMechanism,
    startTime: toIso(row.startTime),
    endTime: toIso(row.endTime),
    durationSeconds: row.durationSeconds,
    socDeltaPercent: row.socDeltaPercent,
    energyDeltaKwh: row.energyDeltaKwh,
    fuelDeltaLiters: row.fuelDeltaLiters,
    odometerStartKm: row.odometerStartKm,
    odometerEndKm: row.odometerEndKm,
    confidence: row.confidence,
    coalescedFromCount: provenance?.coalescedFromCount ?? null,
    coalescedFromSegmentIds: provenance?.coalescedFromSegmentIds ?? [],
  };
}

function containedIn(
  row: { startTime: Date; endTime: Date },
  parent: { startTime: Date; endTime: Date },
): boolean {
  return (
    row.startTime.getTime() >= parent.startTime.getTime() &&
    row.endTime.getTime() <= parent.endTime.getTime()
  );
}

function overlaps(
  left: { startTime: Date; endTime: Date },
  right: { startTime: Date; endTime: Date },
): boolean {
  return (
    Math.max(left.startTime.getTime(), right.startTime.getTime()) <
    Math.min(left.endTime.getTime(), right.endTime.getTime())
  );
}

export interface BuildOperatorManifestInput {
  reviewProvenance: string;
  forensicClosureReference: string;
  preMutationSnapshot: EnergyEventsTableSnapshot;
  m1DetectorPayload: {
    dimoSegmentId: string;
    vehicleId: string;
    mechanism: 'recharge';
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    fuelDeltaLiters: number | null;
    odometerStartKm: number | null;
    odometerEndKm: number | null;
    confidence: string;
    coalescedFromSegmentIds: string[];
    rawDetectionMeta: unknown;
  };
  vehicleRechargeRows: PersistedEnergyEventRow[];
  aliasByRowId?: Map<string, string>;
}

export function buildOperatorMutationManifest(
  input: BuildOperatorManifestInput,
): OperatorMutationManifest {
  const m1Payload = input.m1DetectorPayload;
  const m1Candidate = {
    dimoSegmentId: m1Payload.dimoSegmentId,
    startTime: m1Payload.startTime,
    endTime: m1Payload.endTime,
    socDeltaPercent: m1Payload.socDeltaPercent,
    energyDeltaKwh: m1Payload.energyDeltaKwh,
    coalescedFromSegmentIds: m1Payload.coalescedFromSegmentIds,
  };

  const overlapAssessment = assessOverlapPopulation({
    candidate: m1Candidate,
    population: input.vehicleRechargeRows.map((row) => ({
      id: row.id,
      dimoSegmentId: row.dimoSegmentId,
      startTime: row.startTime,
      endTime: row.endTime,
      socDeltaPercent: row.socDeltaPercent,
      energyDeltaKwh: row.energyDeltaKwh,
    })),
  });

  const overlappingRows = input.vehicleRechargeRows.filter(
    (row) =>
      row.dimoSegmentId !== m1Payload.dimoSegmentId &&
      overlaps(row, m1Payload),
  );
  const containedRows = overlappingRows.filter((row) => containedIn(row, m1Payload));
  const excludedRows = overlappingRows.filter((row) => !containedIn(row, m1Payload));

  if (containedRows.length !== overlapAssessment.containedRowCount) {
    throw new Error(
      `Contained legacy population mismatch: built=${containedRows.length} assessed=${overlapAssessment.containedRowCount}`,
    );
  }

  const m1Existing = input.vehicleRechargeRows.find(
    (row) => row.dimoSegmentId === m1Payload.dimoSegmentId,
  );
  if (m1Existing) {
    throw new Error(
      `M1 dimoSegmentId already present in DB (${m1Existing.id}); manifest requires absent-before-create`,
    );
  }

  const pruneRows = [...containedRows].sort((a, b) =>
    a.startTime.getTime() - b.startTime.getTime(),
  );

  const scopedDigest = createHash('sha256')
    .update(
      [...pruneRows, ...excludedRows]
        .map(
          (row) =>
            `${row.id}|${row.dimoSegmentId}|${row.updatedAt?.toISOString() ?? ''}`,
        )
        .sort()
        .join('\n'),
    )
    .digest('hex');

  const m1Fingerprint: EnergyEventRowFingerprint = {
    rowId: 'PENDING_CREATE',
    vehicleId: m1Payload.vehicleId,
    dimoSegmentId: m1Payload.dimoSegmentId,
    kind: 'RECHARGE',
    detectionMechanism: m1Payload.mechanism,
    startTime: toIso(m1Payload.startTime),
    endTime: toIso(m1Payload.endTime),
    durationSeconds: m1Payload.durationSeconds,
    socDeltaPercent: m1Payload.socDeltaPercent,
    energyDeltaKwh: m1Payload.energyDeltaKwh,
    fuelDeltaLiters: m1Payload.fuelDeltaLiters,
    odometerStartKm: m1Payload.odometerStartKm,
    odometerEndKm: m1Payload.odometerEndKm,
    confidence: m1Payload.confidence,
    coalescedFromCount: m1Payload.coalescedFromSegmentIds.length,
    coalescedFromSegmentIds: [...m1Payload.coalescedFromSegmentIds],
  };

  const aliasByRowId = input.aliasByRowId ?? new Map<string, string>();

  const explicitOperatorAuthorizedPrunes: OperatorManifestRow[] = pruneRows.map(
    (row) => ({
      disposition: 'EXPLICIT_OPERATOR_AUTHORIZED_PRUNE',
      rowId: row.id,
      dimoSegmentId: row.dimoSegmentId,
      mechanism: 'recharge',
      vehicleId: row.vehicleId,
      fingerprint: buildRowFingerprint(row),
      forensicAlias: aliasByRowId.get(row.id) ?? null,
      redundancyReason: 'REDUNDANT_POPULATION_PROVENANCE_ABSENT: temporally contained legacy sliding-window singleton subsumed by M1 canonical Jul-16 recharge session; explicit operator authorization required because automatic pruneAuthority is false',
      overlapRelationshipToM1: 'TEMPORALLY_CONTAINED_WITHIN_M1',
    }),
  );

  const excludedFromPrune: OperatorManifestExcludedRow[] = excludedRows.map(
    (row) => ({
      rowId: row.id,
      dimoSegmentId: row.dimoSegmentId,
      mechanism: 'recharge',
      vehicleId: row.vehicleId,
      fingerprint: buildRowFingerprint(row),
      forensicAlias: aliasByRowId.get(row.id) ?? null,
      exclusionReason:
        'TEMPORAL_OVERLAP_BUT_NOT_FULLY_CONTAINED_WITHIN_M1 — excluded from closed-set prune manifest; automatic pruneAuthority remains false',
      overlapRelationshipToM1:
        'OVERLAPS_M1_END_BOUNDARY_EXTENDS_BEYOND_M1_END',
    }),
  );

  const pruneIds = explicitOperatorAuthorizedPrunes.map((row) => row.rowId!);
  const expectedFinalRowCount =
    input.preMutationSnapshot.totalRows + 1 - pruneIds.length;

  const postNotes: string[] = [
    `ROW13-equivalent excluded overlap tail (${excludedRows.length} row(s)) may still overlap M1 after mutation and require separate disposition if gate does not clear.`,
    'R1/R2/F1 remain ALREADY_IDENTICAL after precision-fix deploy; no UPDATE mutations expected.',
  ];

  return {
    manifestVersion: OPERATOR_MUTATION_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    reviewProvenance: input.reviewProvenance,
    forensicClosureReference: input.forensicClosureReference,
    preMutationSnapshot: input.preMutationSnapshot,
    m1: {
      disposition: 'APPROVE_FOR_BACKFILL',
      rowId: null,
      dimoSegmentId: m1Payload.dimoSegmentId,
      mechanism: 'recharge',
      vehicleId: m1Payload.vehicleId,
      fingerprint: m1Fingerprint,
      forensicAlias: 'M1',
      redundancyReason: null,
      overlapRelationshipToM1: 'CANONICAL_PHYSICAL_SESSION',
    },
    explicitOperatorAuthorizedPrunes,
    excludedFromPrune,
    overlapPopulationAssessment: overlapAssessment,
    invariants: {
      expectedPreMutationRowCount: input.preMutationSnapshot.totalRows,
      expectedM1PresentBeforeMutation: false,
      expectedLegacyPruneRowIds: pruneIds,
      expectedLegacyPruneCount: pruneIds.length,
      expectedExcludedOverlapRowIds: excludedRows.map((row) => row.id),
      scopedDigestAlgorithm: 'sha256-over-id-dimo-updated',
      preMutationTableDigest: input.preMutationSnapshot.tableDigest,
      preMutationScopedDigest: scopedDigest,
      abortOnUnexpectedOverlapOutsideManifest: true,
      abortOnMissingLegacyRow: true,
      abortOnFingerprintMismatch: true,
      abortOnM1AlreadyPresent: true,
    },
    expectedPostMutation: {
      expectedRowCountDelta: 1 - pruneIds.length,
      expectedFinalRowCount,
      expectedM1Present: true,
      expectedLegacyPruneRowIdsAbsent: pruneIds,
      expectedManualReviewUnresolvedCount: excludedRows.length > 0 ? 1 : 0,
      expectedWouldCreate: 0,
      expectedWouldUpdate: 0,
      expectedAlreadyIdentical: 3,
      expectedGateBlockers:
        excludedRows.length > 0 ? ['MANUAL_REVIEW_UNRESOLVED:1'] : [],
      notes: postNotes,
    },
    idempotencyExpectations: {
      secondDryRunWouldCreateForM1: 0,
      secondDryRunWouldUpdateFromPrecisionDrift: 0,
      secondDryRunPruneActionsForRemovedLegacyIds: 0,
      secondDryRunManualReviewUnresolvedForM1: 0,
      secondDryRunGateBlockers:
        excludedRows.length > 0 ? ['MANUAL_REVIEW_UNRESOLVED:1'] : [],
    },
    rollback: {
      backupArtifactRequired: true,
      backupRowIds: pruneIds,
      restoreOrder: ['DELETE_M1_IF_CREATED', 'RESTORE_PRUNED_ROWS'],
    },
  };
}

export type ManifestInvariantViolation =
  | { kind: 'ROW_COUNT_MISMATCH'; expected: number; actual: number }
  | { kind: 'M1_ALREADY_PRESENT'; rowId: string }
  | { kind: 'M1_ABSENT_BUT_EXPECTED_PRESENT' }
  | { kind: 'MISSING_LEGACY_PRUNE_ROW'; rowId: string }
  | { kind: 'UNEXPECTED_LEGACY_PRUNE_ROW_PRESENT'; rowId: string }
  | { kind: 'FINGERPRINT_MISMATCH'; rowId: string; field: string }
  | { kind: 'TABLE_DIGEST_CHANGED'; expected: string; actual: string }
  | { kind: 'UNEXPECTED_OVERLAP_OUTSIDE_MANIFEST'; rowId: string; dimoSegmentId: string };

export function validatePreMutationInvariants(
  manifest: OperatorMutationManifest,
  rowsById: Map<string, PersistedEnergyEventRow>,
  snapshot: EnergyEventsTableSnapshot,
  m1Present: boolean,
): ManifestInvariantViolation[] {
  const violations: ManifestInvariantViolation[] = [];

  if (snapshot.totalRows !== manifest.invariants.expectedPreMutationRowCount) {
    violations.push({
      kind: 'ROW_COUNT_MISMATCH',
      expected: manifest.invariants.expectedPreMutationRowCount,
      actual: snapshot.totalRows,
    });
  }

  if (snapshot.tableDigest !== manifest.invariants.preMutationTableDigest) {
    violations.push({
      kind: 'TABLE_DIGEST_CHANGED',
      expected: manifest.invariants.preMutationTableDigest,
      actual: snapshot.tableDigest,
    });
  }

  if (m1Present) {
    const m1Row = [...rowsById.values()].find(
      (row) => row.dimoSegmentId === manifest.m1.dimoSegmentId,
    );
    violations.push({
      kind: 'M1_ALREADY_PRESENT',
      rowId: m1Row?.id ?? manifest.m1.dimoSegmentId,
    });
  }

  for (const pruneId of manifest.invariants.expectedLegacyPruneRowIds) {
    if (!rowsById.has(pruneId)) {
      violations.push({ kind: 'MISSING_LEGACY_PRUNE_ROW', rowId: pruneId });
      continue;
    }
    const actual = rowsById.get(pruneId)!;
    const expected = manifest.explicitOperatorAuthorizedPrunes.find(
      (row) => row.rowId === pruneId,
    )?.fingerprint;
    if (!expected) continue;
    const fields: Array<keyof EnergyEventRowFingerprint> = [
      'dimoSegmentId',
      'startTime',
      'endTime',
      'durationSeconds',
      'socDeltaPercent',
      'energyDeltaKwh',
    ];
    for (const field of fields) {
      const actualValue = actual[field as keyof PersistedEnergyEventRow];
      const expectedValue = expected[field];
      const actualNormalized =
        actualValue instanceof Date ? actualValue.toISOString() : actualValue;
      const expectedNormalized =
        expectedValue instanceof Date
          ? expectedValue.toISOString()
          : expectedValue;
      if (actualNormalized !== expectedNormalized) {
        violations.push({ kind: 'FINGERPRINT_MISMATCH', rowId: pruneId, field });
      }
    }
  }

  return violations;
}

export function validatePostMutationInvariants(
  manifest: OperatorMutationManifest,
  rowsById: Map<string, PersistedEnergyEventRow>,
  snapshot: EnergyEventsTableSnapshot,
): ManifestInvariantViolation[] {
  const violations: ManifestInvariantViolation[] = [];

  if (snapshot.totalRows !== manifest.expectedPostMutation.expectedFinalRowCount) {
    violations.push({
      kind: 'ROW_COUNT_MISMATCH',
      expected: manifest.expectedPostMutation.expectedFinalRowCount,
      actual: snapshot.totalRows,
    });
  }

  const m1Row = [...rowsById.values()].find(
    (row) => row.dimoSegmentId === manifest.m1.dimoSegmentId,
  );
  if (!m1Row) {
    violations.push({ kind: 'M1_ABSENT_BUT_EXPECTED_PRESENT' });
  }

  for (const pruneId of manifest.expectedPostMutation.expectedLegacyPruneRowIdsAbsent) {
    if (rowsById.has(pruneId)) {
      violations.push({
        kind: 'UNEXPECTED_LEGACY_PRUNE_ROW_PRESENT',
        rowId: pruneId,
      });
    }
  }

  return violations;
}

export function buildPreMutationBackupArtifact(
  manifest: OperatorMutationManifest,
  rowsById: Map<string, PersistedEnergyEventRow>,
): {
  manifestVersion: string;
  capturedAt: string;
  reviewProvenance: string;
  rows: Array<Record<string, unknown>>;
} {
  const backupIds = new Set([
    ...manifest.invariants.expectedLegacyPruneRowIds,
    ...(manifest.m1.rowId ? [manifest.m1.rowId] : []),
  ]);

  const rows = [...backupIds]
    .map((rowId) => rowsById.get(rowId))
    .filter((row): row is PersistedEnergyEventRow => row != null)
    .map((row) => ({
      ...row,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    }));

  return {
    manifestVersion: manifest.manifestVersion,
    capturedAt: new Date().toISOString(),
    reviewProvenance: manifest.reviewProvenance,
    rows,
  };
}
