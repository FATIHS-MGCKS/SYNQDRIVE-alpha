/**
 * Read-only forensic layer for energy-event recovery candidates.
 *
 * Answers three questions without mutating anything:
 *  1. WHY does a canonical comparison return WOULD_UPDATE (field-by-field)?
 *  2. Is a differing field SEMANTIC or only metadata representation drift?
 *  3. Does durable evidence exist that a historical row is a constituent
 *     sub-segment of a canonical coalesced parent (prune authority)?
 *
 * The module is deliberately independent of any specific outage, vehicle, or
 * time window: every decision is derived from stored provenance and canonical
 * detector output.
 */
import {
  buildUpsertPayload,
  canonicalMeasurementEquals,
  isMateriallyIdentical,
  normalizeRawDetectionMeta,
  roundToCanonicalMeasurementPrecision,
  type CoalescedEnergySegment,
  type EnergyEventUpsertPayload,
  type MaterializedEnergyEventRow,
} from './energy-events.pipeline';

export type CanonicalFieldClass = 'SEMANTIC' | 'NON_SEMANTIC_METADATA';

/** Business-material payload fields compared by `isMateriallyIdentical`. */
export const CANONICAL_MATERIAL_IDENTITY_FIELDS = [
  'kind',
  'detectionMechanism',
  'startTime',
  'endTime',
  'durationSeconds',
  'startLatitude',
  'startLongitude',
  'endLatitude',
  'endLongitude',
  'fuelDeltaLiters',
  'fuelDeltaPercent',
  'socDeltaPercent',
  'energyDeltaKwh',
  'odometerStartKm',
  'odometerEndKm',
  'confidence',
] as const;

/**
 * Fields `isMateriallyIdentical` compares at canonical measurement precision
 * rather than bitwise, because storage cannot hold the 17th significant digit.
 */
const CANONICAL_MEASUREMENT_FIELDS = new Set<string>([
  'startLatitude',
  'startLongitude',
  'endLatitude',
  'endLongitude',
  'fuelDeltaLiters',
  'fuelDeltaPercent',
  'socDeltaPercent',
  'energyDeltaKwh',
  'odometerStartKm',
  'odometerEndKm',
]);

/**
 * Fields where `isMateriallyIdentical` falls back to the payload value when the
 * stored column is null, so a null column is not a difference.
 */
const NULL_TOLERANT_IDENTITY_FIELDS = new Set<string>([
  'detectionMechanism',
  'durationSeconds',
]);

/** Keys the canonical pipeline currently writes into `rawDetectionMeta`. */
export const RAW_DETECTION_META_CANONICAL_KEYS = [
  'fuelStartLiters',
  'fuelEndLiters',
  'fuelStartPercent',
  'fuelEndPercent',
  'socStartPercent',
  'socEndPercent',
  'energyStartKwh',
  'energyEndKwh',
  'coalescedFromCount',
  'coalescedFromSegmentIds',
] as const;

/** Canonical coalesce provenance — defines which raw segments a row consumed. */
export const RAW_DETECTION_META_PROVENANCE_KEYS = [
  'coalescedFromCount',
  'coalescedFromSegmentIds',
] as const;

/**
 * Tolerance used when checking whether a constituent's SOC/energy gain fits
 * inside its canonical parent. Only absorbs storage-precision noise.
 */
export const CONTAINMENT_TOLERANCE = 1e-9;

export type RawDetectionMetaDiffClass =
  | 'STORAGE_PRECISION_DRIFT'
  | 'ARRAY_ORDER_DRIFT'
  | 'NON_CANONICAL_DIAGNOSTIC_DIFF'
  | 'CANONICAL_KEY_PRESENCE_DRIFT'
  | 'CANONICAL_PROVENANCE_DIFFERS'
  | 'MEASUREMENT_VALUE_DIFFERS';

const NON_SEMANTIC_META_DIFF_CLASSES: RawDetectionMetaDiffClass[] = [
  'STORAGE_PRECISION_DRIFT',
  'ARRAY_ORDER_DRIFT',
  'NON_CANONICAL_DIAGNOSTIC_DIFF',
];

export interface RawDetectionMetaDiff {
  key: string;
  diffClass: RawDetectionMetaDiffClass;
  fieldClass: CanonicalFieldClass;
  dbValue: unknown;
  detectorValue: unknown;
}

export type CanonicalFieldDiffClass =
  | 'STORAGE_PRECISION_DRIFT'
  | 'VALUE_DIFFERS';

export interface CanonicalFieldDiff {
  field: string;
  diffClass: CanonicalFieldDiffClass;
  fieldClass: CanonicalFieldClass;
  dbValue: unknown;
  detectorValue: unknown;
}

export interface CanonicalIdentityDiff {
  materiallyIdentical: boolean;
  fieldDiffs: CanonicalFieldDiff[];
  metaDiffs: RawDetectionMetaDiff[];
  semanticDiffCount: number;
  nonSemanticDiffCount: number;
  /**
   * True when the production verdict cannot be attributed to the reported
   * diffs: either the canonical comparison says "different" while no difference
   * was found at all, or it says "identical" despite a semantic difference.
   * Either way the forensic layer has drifted from the canonical comparison and
   * no disposition derived from it may be trusted.
   */
  unexplainedVerdict: boolean;
}

function normalizeComparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return null;
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return normalizeComparable(left) === normalizeComparable(right);
}

export function asMetaRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * True when two values render differently but describe the same measurement at
 * canonical precision — the signature of a value that lost its 17th significant
 * digit on write. Callers must rule out key-presence drift first, because an
 * absent key normalizes to null and would otherwise land here.
 */
function isStoragePrecisionDrift(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    return canonicalMeasurementEquals(left, right);
  }
  return (
    JSON.stringify(canonicalizeForComparison(normalizeComparable(left))) ===
    JSON.stringify(canonicalizeForComparison(normalizeComparable(right)))
  );
}

function isArrayOrderDrift(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].map((item) => JSON.stringify(item)).sort();
  const sortedRight = [...right].map((item) => JSON.stringify(item)).sort();
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}

/**
 * Byte-level equality of two metadata values. A difference here is exactly what
 * makes the canonical comparison classify the candidate as UPDATE, so it is
 * always reported — the diff class then says whether it is semantic.
 */
function metaValuesBitwiseEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

function canonicalizeForComparison(value: unknown): unknown {
  if (typeof value === 'number') {
    return roundToCanonicalMeasurementPrecision(value);
  }
  if (Array.isArray(value)) return value.map(canonicalizeForComparison);
  if (value && typeof value === 'object') {
    return normalizeRawDetectionMeta(value);
  }
  return value;
}

export function classifyRawDetectionMetaKeyDiff(
  key: string,
  dbValue: unknown,
  detectorValue: unknown,
): RawDetectionMetaDiffClass {
  const canonicalKey = (RAW_DETECTION_META_CANONICAL_KEYS as readonly string[]).includes(key);
  if (!canonicalKey) return 'NON_CANONICAL_DIAGNOSTIC_DIFF';
  if ((dbValue === undefined) !== (detectorValue === undefined)) {
    return 'CANONICAL_KEY_PRESENCE_DRIFT';
  }
  if (isStoragePrecisionDrift(dbValue, detectorValue)) {
    return 'STORAGE_PRECISION_DRIFT';
  }
  if (isArrayOrderDrift(dbValue, detectorValue)) return 'ARRAY_ORDER_DRIFT';
  if ((RAW_DETECTION_META_PROVENANCE_KEYS as readonly string[]).includes(key)) {
    return 'CANONICAL_PROVENANCE_DIFFERS';
  }
  return 'MEASUREMENT_VALUE_DIFFERS';
}

export function fieldClassForMetaDiff(
  diffClass: RawDetectionMetaDiffClass,
): CanonicalFieldClass {
  return NON_SEMANTIC_META_DIFF_CLASSES.includes(diffClass)
    ? 'NON_SEMANTIC_METADATA'
    : 'SEMANTIC';
}

export function diffRawDetectionMeta(
  dbMeta: unknown,
  detectorMeta: unknown,
): RawDetectionMetaDiff[] {
  const left = asMetaRecord(dbMeta);
  const right = asMetaRecord(detectorMeta);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const diffs: RawDetectionMetaDiff[] = [];

  for (const key of keys) {
    const dbValue = Object.prototype.hasOwnProperty.call(left, key)
      ? left[key]
      : undefined;
    const detectorValue = Object.prototype.hasOwnProperty.call(right, key)
      ? right[key]
      : undefined;
    if (metaValuesBitwiseEqual(dbValue, detectorValue)) continue;

    const diffClass = classifyRawDetectionMetaKeyDiff(key, dbValue, detectorValue);
    diffs.push({
      key,
      diffClass,
      fieldClass: fieldClassForMetaDiff(diffClass),
      dbValue,
      detectorValue,
    });
  }

  return diffs;
}

function classifyCanonicalFieldDiff(
  field: string,
  dbValue: unknown,
  detectorValue: unknown,
): CanonicalFieldDiffClass {
  if (
    CANONICAL_MEASUREMENT_FIELDS.has(field) &&
    canonicalMeasurementEquals(dbValue as number, detectorValue as number)
  ) {
    return 'STORAGE_PRECISION_DRIFT';
  }
  return 'VALUE_DIFFERS';
}

function reportableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/**
 * Self-check on the attribution above: an UPDATE verdict with nothing reported
 * means the forensic layer no longer sees what the canonical comparison sees,
 * and an identical verdict alongside a semantic difference is a contradiction.
 */
export function isUnexplainedVerdict(input: {
  materiallyIdentical: boolean;
  reportedDiffCount: number;
  semanticDiffCount: number;
}): boolean {
  if (!input.materiallyIdentical) return input.reportedDiffCount === 0;
  return input.semanticDiffCount > 0;
}

/**
 * Field-by-field explanation of a canonical WOULD_UPDATE. Uses the production
 * comparison (`isMateriallyIdentical`) as the authority for the verdict, then
 * attributes the verdict to concrete fields.
 *
 * Every representation difference is reported, including ones the canonical
 * comparison tolerates: hiding them is what made a WOULD_UPDATE look
 * unexplainable. `unexplainedVerdict` guards against the inverse — a verdict the
 * reported diffs cannot account for.
 */
export function diffCanonicalMaterialIdentity(
  existing: MaterializedEnergyEventRow,
  payload: EnergyEventUpsertPayload,
): CanonicalIdentityDiff {
  const fieldDiffs: CanonicalFieldDiff[] = [];
  const existingRecord = existing as unknown as Record<string, unknown>;
  const payloadRecord = payload as unknown as Record<string, unknown>;

  for (const field of CANONICAL_MATERIAL_IDENTITY_FIELDS) {
    const dbValue = existingRecord[field];
    const detectorValue = payloadRecord[field];
    if (valuesEqual(dbValue, detectorValue)) continue;
    if (NULL_TOLERANT_IDENTITY_FIELDS.has(field) && dbValue == null) continue;

    const diffClass = classifyCanonicalFieldDiff(field, dbValue, detectorValue);
    fieldDiffs.push({
      field,
      diffClass,
      fieldClass:
        diffClass === 'STORAGE_PRECISION_DRIFT'
          ? 'NON_SEMANTIC_METADATA'
          : 'SEMANTIC',
      dbValue: reportableValue(dbValue),
      detectorValue: reportableValue(detectorValue),
    });
  }

  const metaDiffs = diffRawDetectionMeta(
    existing.rawDetectionMeta,
    payload.rawDetectionMeta,
  );

  const isSemantic = (entry: { fieldClass: CanonicalFieldClass }): boolean =>
    entry.fieldClass === 'SEMANTIC';
  const semanticDiffCount =
    fieldDiffs.filter(isSemantic).length + metaDiffs.filter(isSemantic).length;
  const nonSemanticDiffCount =
    fieldDiffs.length + metaDiffs.length - semanticDiffCount;
  const materiallyIdentical = isMateriallyIdentical(existing, payload);

  return {
    materiallyIdentical,
    fieldDiffs,
    metaDiffs,
    semanticDiffCount,
    nonSemanticDiffCount,
    unexplainedVerdict: isUnexplainedVerdict({
      materiallyIdentical,
      reportedDiffCount: fieldDiffs.length + metaDiffs.length,
      semanticDiffCount,
    }),
  };
}

export interface StoredCoalesceProvenance {
  coalescedFromSegmentIds: string[];
  coalescedFromCount: number | null;
}

/** Durable provenance persisted on a canonical row at write time. */
export function readStoredCoalesceProvenance(
  rawDetectionMeta: unknown,
): StoredCoalesceProvenance {
  const meta = asMetaRecord(rawDetectionMeta);
  const ids = Array.isArray(meta.coalescedFromSegmentIds)
    ? meta.coalescedFromSegmentIds.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const count =
    typeof meta.coalescedFromCount === 'number' ? meta.coalescedFromCount : null;
  return { coalescedFromSegmentIds: ids, coalescedFromCount: count };
}

export type SubsegmentProvenanceProof =
  | 'PROVEN_BY_DETECTED_PARENT'
  | 'PROVEN_BY_STORED_PARENT_PROVENANCE'
  | 'INFERRED_TEMPORAL_ONLY'
  | 'ABSENT';

export interface SubsegmentProvenanceRow {
  id: string;
  dimoSegmentId: string;
  startTime: Date;
  endTime: Date;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
}

export interface CanonicalParentRow extends MaterializedEnergyEventRow {
  id: string;
  dimoSegmentId: string;
}

export interface AssessSubsegmentProvenanceInput {
  row: SubsegmentProvenanceRow;
  /** Persisted canonical parent rows of the same vehicle/mechanism. */
  candidateParentRows: CanonicalParentRow[];
  /**
   * Coalesced groups produced by the canonical detector from the CURRENT DIMO
   * fetch for the same physical window.
   */
  detectedGroups: CoalescedEnergySegment[];
  /** Vehicle scope for rebuilding a canonical parent payload. */
  vehicleId: string;
  /**
   * Segment ids the current detector emits as their own persistable canonical
   * event. A row still emitted as its own event can never be pruned — deleting
   * it would be re-created by the next detection run.
   */
  currentlyEmittedSegmentIds: Set<string>;
}

export interface SubsegmentProvenanceAssessment {
  rowId: string;
  dimoSegmentId: string;
  provenanceProof: SubsegmentProvenanceProof;
  parentDimoSegmentId: string | null;
  parentMateriallyIdentical: boolean | null;
  temporallyContainedInParent: boolean;
  socProgressionCompatible: 'YES' | 'NO' | 'UNAVAILABLE';
  stillEmittedByCurrentDetector: boolean;
  safePruneAuthority: boolean;
  blockers: string[];
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

function socCompatibility(
  row: SubsegmentProvenanceRow,
  parent: { socDeltaPercent: number | null; energyDeltaKwh: number | null },
): 'YES' | 'NO' | 'UNAVAILABLE' {
  const rowSoc = row.socDeltaPercent;
  const parentSoc = parent.socDeltaPercent;
  if (rowSoc == null || parentSoc == null) {
    const rowEnergy = row.energyDeltaKwh;
    const parentEnergy = parent.energyDeltaKwh;
    if (rowEnergy == null || parentEnergy == null) return 'UNAVAILABLE';
    return rowEnergy <= parentEnergy + CONTAINMENT_TOLERANCE ? 'YES' : 'NO';
  }
  // A constituent can never carry more SOC gain than the session that contains it.
  return rowSoc <= parentSoc + CONTAINMENT_TOLERANCE ? 'YES' : 'NO';
}

/**
 * Deterministic prune-authority assessment for a historical row that may be a
 * constituent sub-segment of a canonical coalesced parent.
 *
 * Authority requires PROVEN provenance — either the current detector still
 * groups the row's segment id under a multi-segment parent, or the persisted
 * canonical parent row itself records the segment id in its stored
 * `rawDetectionMeta.coalescedFromSegmentIds`. Temporal overlap alone is never
 * sufficient.
 */
export function assessSubsegmentProvenance(
  input: AssessSubsegmentProvenanceInput,
): SubsegmentProvenanceAssessment {
  const { row } = input;
  const blockers: string[] = [];
  const stillEmitted = input.currentlyEmittedSegmentIds.has(row.dimoSegmentId);

  const detectedParent =
    input.detectedGroups.find(
      (group) =>
        group.coalescedFromSegmentIds.length > 1 &&
        group.coalescedFromSegmentIds.includes(row.dimoSegmentId) &&
        group.coalescedSegmentId !== row.dimoSegmentId,
    ) ?? null;

  const storedParent =
    input.candidateParentRows.find((parent) => {
      if (parent.dimoSegmentId === row.dimoSegmentId) return false;
      const provenance = readStoredCoalesceProvenance(parent.rawDetectionMeta);
      return provenance.coalescedFromSegmentIds.includes(row.dimoSegmentId);
    }) ?? null;

  let provenanceProof: SubsegmentProvenanceProof = 'ABSENT';
  let parentDimoSegmentId: string | null = null;
  let parentMateriallyIdentical: boolean | null = null;
  let parentRowForGeometry:
    | {
        startTime: Date;
        endTime: Date;
        socDeltaPercent: number | null;
        energyDeltaKwh: number | null;
      }
    | null = null;

  if (detectedParent) {
    provenanceProof = 'PROVEN_BY_DETECTED_PARENT';
    parentDimoSegmentId = detectedParent.coalescedSegmentId;
    const parentRow = input.candidateParentRows.find(
      (parent) => parent.dimoSegmentId === detectedParent.coalescedSegmentId,
    );
    const parentPayload = buildUpsertPayload(input.vehicleId, detectedParent);
    parentMateriallyIdentical = parentRow
      ? isMateriallyIdentical(parentRow, parentPayload)
      : false;
    parentRowForGeometry = parentRow
      ? {
          startTime: parentRow.startTime,
          endTime: parentRow.endTime,
          socDeltaPercent: parentRow.socDeltaPercent,
          energyDeltaKwh: parentRow.energyDeltaKwh,
        }
      : {
          startTime: parentPayload.startTime,
          endTime: parentPayload.endTime,
          socDeltaPercent: parentPayload.socDeltaPercent,
          energyDeltaKwh: parentPayload.energyDeltaKwh,
        };
    if (!parentRow) blockers.push('canonical_parent_row_missing');
    else if (!parentMateriallyIdentical) {
      blockers.push('canonical_parent_row_not_materially_identical');
    }
  } else if (storedParent) {
    provenanceProof = 'PROVEN_BY_STORED_PARENT_PROVENANCE';
    parentDimoSegmentId = storedParent.dimoSegmentId;
    parentMateriallyIdentical = null;
    parentRowForGeometry = {
      startTime: storedParent.startTime,
      endTime: storedParent.endTime,
      socDeltaPercent: storedParent.socDeltaPercent,
      energyDeltaKwh: storedParent.energyDeltaKwh,
    };
  } else {
    const temporalParent = input.candidateParentRows.find(
      (parent) =>
        parent.dimoSegmentId !== row.dimoSegmentId &&
        containedIn(row, parent),
    );
    if (temporalParent) {
      provenanceProof = 'INFERRED_TEMPORAL_ONLY';
      parentDimoSegmentId = temporalParent.dimoSegmentId;
      parentRowForGeometry = {
        startTime: temporalParent.startTime,
        endTime: temporalParent.endTime,
        socDeltaPercent: temporalParent.socDeltaPercent,
        energyDeltaKwh: temporalParent.energyDeltaKwh,
      };
      blockers.push('provenance_inferred_from_temporal_containment_only');
    } else {
      blockers.push('no_canonical_parent_provenance_found');
    }
  }

  const temporallyContained = parentRowForGeometry
    ? containedIn(row, parentRowForGeometry)
    : false;
  const socCompatible = parentRowForGeometry
    ? socCompatibility(row, parentRowForGeometry)
    : 'UNAVAILABLE';

  if (stillEmitted) {
    blockers.push('still_emitted_as_own_canonical_event_by_current_detector');
  }
  if (parentRowForGeometry && !temporallyContained) {
    blockers.push('not_temporally_contained_in_canonical_parent');
  }
  if (socCompatible === 'NO') {
    blockers.push('soc_progression_incompatible_with_canonical_parent');
  }

  const provenProvenance =
    provenanceProof === 'PROVEN_BY_DETECTED_PARENT' ||
    provenanceProof === 'PROVEN_BY_STORED_PARENT_PROVENANCE';

  return {
    rowId: row.id,
    dimoSegmentId: row.dimoSegmentId,
    provenanceProof,
    parentDimoSegmentId,
    parentMateriallyIdentical,
    temporallyContainedInParent: temporallyContained,
    socProgressionCompatible: socCompatible,
    stillEmittedByCurrentDetector: stillEmitted,
    safePruneAuthority: provenProvenance && blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

export interface OverlapPopulationRow {
  id: string;
  dimoSegmentId: string;
  startTime: Date;
  endTime: Date;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
}

export type OverlapPopulationDisposition =
  /** The candidate does not overlap any persisted row of the same identity class. */
  | 'NO_OVERLAP'
  /** Every overlapping row is named in the candidate's coalesce provenance. */
  | 'PROVEN_CONSTITUENTS'
  /**
   * The overlapping rows contradict each other or over-count the candidate's
   * measured gain, so they cannot all be independent events — but nothing links
   * them to the candidate, so the correction is an operator decision.
   */
  | 'REDUNDANT_POPULATION_PROVENANCE_ABSENT'
  /** Overlapping but mutually consistent: may be genuinely separate sessions. */
  | 'INDEPENDENT_SESSIONS_PRESERVE';

export interface OverlapPopulationAssessment {
  candidateDimoSegmentId: string;
  overlappingRowIds: string[];
  containedRowCount: number;
  /** Overlapping pairs *within* the population — physically impossible. */
  pairwiseOverlapContradictions: number;
  provenanceLinkedRowCount: number;
  socDeltaSum: number | null;
  energyDeltaSum: number | null;
  candidateSocDelta: number | null;
  candidateEnergyDelta: number | null;
  /** Population gain exceeds the candidate's own gain — double counting. */
  aggregateExceedsCandidate: boolean | null;
  disposition: OverlapPopulationDisposition;
  pruneAuthority: boolean;
  blockers: string[];
}

function overlaps(
  left: { startTime: Date; endTime: Date },
  right: { startTime: Date; endTime: Date },
): boolean {
  return (
    left.startTime.getTime() < right.endTime.getTime() &&
    left.endTime.getTime() > right.startTime.getTime()
  );
}

function sumOrNull(values: Array<number | null>): number | null {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length === 0
    ? null
    : finite.reduce((total, value) => total + value, 0);
}

/**
 * Classifies the population of persisted rows a canonical candidate overlaps.
 *
 * The only source of prune authority is coalesce provenance: every overlapping
 * row must be named in the candidate's `coalescedFromSegmentIds`. Temporal
 * containment, pairwise contradiction and aggregate over-counting are reported
 * as evidence that the persisted population is internally inconsistent, but
 * they never authorize a delete — which row is redundant, and whether the
 * candidate should replace it, is not derivable from arithmetic alone.
 *
 * Caller scopes `population` to the candidate's vehicle and mechanism.
 */
export function assessOverlapPopulation(input: {
  candidate: {
    dimoSegmentId: string;
    startTime: Date;
    endTime: Date;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    coalescedFromSegmentIds: string[];
  };
  population: OverlapPopulationRow[];
}): OverlapPopulationAssessment {
  const { candidate } = input;
  const provenanceIds = new Set(
    candidate.coalescedFromSegmentIds.filter(
      (id) => id !== candidate.dimoSegmentId,
    ),
  );

  const overlapping = input.population.filter(
    (row) => row.dimoSegmentId !== candidate.dimoSegmentId && overlaps(row, candidate),
  );

  let pairwiseOverlapContradictions = 0;
  for (let i = 0; i < overlapping.length; i++) {
    for (let j = i + 1; j < overlapping.length; j++) {
      if (overlaps(overlapping[i], overlapping[j])) {
        pairwiseOverlapContradictions += 1;
      }
    }
  }

  const socDeltaSum = sumOrNull(overlapping.map((row) => row.socDeltaPercent));
  const energyDeltaSum = sumOrNull(overlapping.map((row) => row.energyDeltaKwh));
  const aggregateExceedsCandidate =
    socDeltaSum != null && candidate.socDeltaPercent != null
      ? socDeltaSum > candidate.socDeltaPercent + CONTAINMENT_TOLERANCE
      : energyDeltaSum != null && candidate.energyDeltaKwh != null
        ? energyDeltaSum > candidate.energyDeltaKwh + CONTAINMENT_TOLERANCE
        : null;

  const provenanceLinked = overlapping.filter((row) =>
    provenanceIds.has(row.dimoSegmentId),
  );

  const blockers: string[] = [];
  let disposition: OverlapPopulationDisposition;

  if (overlapping.length === 0) {
    disposition = 'NO_OVERLAP';
  } else if (provenanceLinked.length === overlapping.length) {
    disposition = 'PROVEN_CONSTITUENTS';
  } else if (pairwiseOverlapContradictions > 0 || aggregateExceedsCandidate) {
    disposition = 'REDUNDANT_POPULATION_PROVENANCE_ABSENT';
    blockers.push(
      'redundant_overlapping_population_without_canonical_provenance',
    );
  } else {
    disposition = 'INDEPENDENT_SESSIONS_PRESERVE';
    blockers.push('overlapping_rows_may_be_independent_sessions');
  }

  if (
    overlapping.length > 0 &&
    provenanceLinked.length > 0 &&
    provenanceLinked.length < overlapping.length
  ) {
    blockers.push('canonical_provenance_covers_population_only_partially');
  }

  return {
    candidateDimoSegmentId: candidate.dimoSegmentId,
    overlappingRowIds: overlapping.map((row) => row.id),
    containedRowCount: overlapping.filter((row) => containedIn(row, candidate))
      .length,
    pairwiseOverlapContradictions,
    provenanceLinkedRowCount: provenanceLinked.length,
    socDeltaSum,
    energyDeltaSum,
    candidateSocDelta: candidate.socDeltaPercent,
    candidateEnergyDelta: candidate.energyDeltaKwh,
    aggregateExceedsCandidate,
    disposition,
    pruneAuthority: disposition === 'PROVEN_CONSTITUENTS',
    blockers,
  };
}

/**
 * Replaces the numeric DIMO token id inside a canonical segment id with a stable
 * alias so forensic output can be shared without leaking fleet identifiers.
 */
export function redactSegmentIdentity(
  segmentId: string,
  aliasForTokenId: (tokenId: number) => string,
): string {
  return segmentId.replace(
    /^dimo-(refuel|recharge)-(coalesced-)?(\d+)-(.*)$/,
    (_match, mechanism, coalesced, tokenId, tail) =>
      `dimo-${mechanism}-${coalesced ?? ''}${aliasForTokenId(Number(tokenId))}-${tail}`,
  );
}
