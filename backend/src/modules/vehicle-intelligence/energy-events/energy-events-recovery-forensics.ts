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
  isMateriallyIdentical,
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
 * Relative tolerance for float re-serialization of the same physical value
 * (e.g. `34.599999999999994` vs `34.6`). Deliberately far below any
 * operationally meaningful SOC/energy/fuel resolution.
 */
export const FLOAT_REPRESENTATION_EPSILON = 1e-9;

export type RawDetectionMetaDiffClass =
  | 'FLOAT_REPRESENTATION_DRIFT'
  | 'ARRAY_ORDER_DRIFT'
  | 'NON_CANONICAL_DIAGNOSTIC_DIFF'
  | 'CANONICAL_KEY_PRESENCE_DRIFT'
  | 'CANONICAL_PROVENANCE_DIFFERS'
  | 'MEASUREMENT_VALUE_DIFFERS';

const NON_SEMANTIC_META_DIFF_CLASSES: RawDetectionMetaDiffClass[] = [
  'FLOAT_REPRESENTATION_DRIFT',
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

export interface CanonicalFieldDiff {
  field: string;
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

function isFloatRepresentationDrift(left: unknown, right: unknown): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (left === right) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= FLOAT_REPRESENTATION_EPSILON * scale;
}

function isArrayOrderDrift(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].map((item) => JSON.stringify(item)).sort();
  const sortedRight = [...right].map((item) => JSON.stringify(item)).sort();
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}

function metaValuesEqual(left: unknown, right: unknown): boolean {
  if (isFloatRepresentationDrift(left, right)) return true;
  return JSON.stringify(normalizeComparable(left)) === JSON.stringify(normalizeComparable(right));
}

export function classifyRawDetectionMetaKeyDiff(
  key: string,
  dbValue: unknown,
  detectorValue: unknown,
): RawDetectionMetaDiffClass {
  const canonicalKey = (RAW_DETECTION_META_CANONICAL_KEYS as readonly string[]).includes(key);
  if (!canonicalKey) return 'NON_CANONICAL_DIAGNOSTIC_DIFF';
  if (isFloatRepresentationDrift(dbValue, detectorValue)) {
    return 'FLOAT_REPRESENTATION_DRIFT';
  }
  if (isArrayOrderDrift(dbValue, detectorValue)) return 'ARRAY_ORDER_DRIFT';
  const dbAbsent = dbValue === undefined;
  const detectorAbsent = detectorValue === undefined;
  if (dbAbsent !== detectorAbsent) return 'CANONICAL_KEY_PRESENCE_DRIFT';
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
    if (metaValuesEqual(dbValue, detectorValue)) continue;

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

/**
 * Field-by-field explanation of a canonical WOULD_UPDATE. Uses the production
 * comparison (`isMateriallyIdentical`) as the authority for the verdict, then
 * attributes the verdict to concrete fields.
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
    fieldDiffs.push({
      field,
      fieldClass: 'SEMANTIC',
      dbValue: dbValue instanceof Date ? dbValue.toISOString() : (dbValue ?? null),
      detectorValue:
        detectorValue instanceof Date
          ? detectorValue.toISOString()
          : (detectorValue ?? null),
    });
  }

  const metaDiffs = diffRawDetectionMeta(
    existing.rawDetectionMeta,
    payload.rawDetectionMeta,
  );

  const semanticDiffCount =
    fieldDiffs.length +
    metaDiffs.filter((diff) => diff.fieldClass === 'SEMANTIC').length;

  return {
    materiallyIdentical: isMateriallyIdentical(existing, payload),
    fieldDiffs,
    metaDiffs,
    semanticDiffCount,
    nonSemanticDiffCount: metaDiffs.filter(
      (diff) => diff.fieldClass === 'NON_SEMANTIC_METADATA',
    ).length,
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
    return rowEnergy <= parentEnergy + FLOAT_REPRESENTATION_EPSILON ? 'YES' : 'NO';
  }
  // A constituent can never carry more SOC gain than the session that contains it.
  return rowSoc <= parentSoc + FLOAT_REPRESENTATION_EPSILON ? 'YES' : 'NO';
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
