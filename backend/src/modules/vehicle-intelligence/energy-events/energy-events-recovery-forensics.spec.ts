import { EnergyEventConfidence } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  buildUpsertPayload,
  coalesceSegments,
  type CoalescedEnergySegment,
} from './energy-events.pipeline';
import {
  assessSubsegmentProvenance,
  classifyRawDetectionMetaKeyDiff,
  diffCanonicalMaterialIdentity,
  diffRawDetectionMeta,
  readStoredCoalesceProvenance,
  redactSegmentIdentity,
  type CanonicalParentRow,
} from './energy-events-recovery-forensics';

const VEHICLE_ID = 'clveh1234567890123456789012';
const TOKEN_ID = 4242;

function buildRecharge(
  overrides: Partial<DimoEnergyEventSegment> = {},
): DimoEnergyEventSegment {
  return {
    segmentId: `dimo-recharge-${TOKEN_ID}-1752710400000`,
    mechanism: 'recharge',
    startTime: '2026-07-17T00:00:00.000Z',
    endTime: '2026-07-17T02:00:00.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 7200,
    startLatitude: 51.31,
    startLongitude: 9.49,
    endLatitude: 51.31,
    endLongitude: 9.49,
    odometerStartKm: 12000,
    odometerEndKm: 12000,
    fuelStartLiters: null,
    fuelEndLiters: null,
    fuelDeltaLiters: null,
    fuelStartPercent: null,
    fuelEndPercent: null,
    fuelDeltaPercent: null,
    socStartPercent: 40,
    socEndPercent: 55,
    socDeltaPercent: 15,
    energyStartKwh: 20,
    energyEndKwh: 28,
    energyDeltaKwh: 8,
    ...overrides,
  };
}

function rowFromSegment(
  group: CoalescedEnergySegment,
  overrides: Partial<CanonicalParentRow> = {},
): CanonicalParentRow {
  const payload = buildUpsertPayload(VEHICLE_ID, group);
  return {
    id: `row-${group.coalescedSegmentId}`,
    dimoSegmentId: payload.dimoSegmentId,
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
    rawDetectionMeta: payload.rawDetectionMeta,
    ...overrides,
  };
}

describe('energy-events recovery forensics — canonical identity diff', () => {
  it('reports no diff for a repeated canonical detection of the same segment', () => {
    const group = coalesceSegments([buildRecharge()])[0];
    const payload = buildUpsertPayload(VEHICLE_ID, group);
    const row = rowFromSegment(group);

    const diff = diffCanonicalMaterialIdentity(row, payload);

    expect(diff.materiallyIdentical).toBe(true);
    expect(diff.fieldDiffs).toEqual([]);
    expect(diff.metaDiffs).toEqual([]);
    expect(diff.semanticDiffCount).toBe(0);
  });

  it('classifies a business-field drift as SEMANTIC', () => {
    const group = coalesceSegments([buildRecharge()])[0];
    const payload = buildUpsertPayload(VEHICLE_ID, group);
    const row = rowFromSegment(group, { socDeltaPercent: 11 });

    const diff = diffCanonicalMaterialIdentity(row, payload);

    expect(diff.materiallyIdentical).toBe(false);
    expect(diff.fieldDiffs).toEqual([
      {
        field: 'socDeltaPercent',
        fieldClass: 'SEMANTIC',
        dbValue: 11,
        detectorValue: 15,
      },
    ]);
    expect(diff.semanticDiffCount).toBe(1);
  });

  it('classifies coalesce provenance drift as SEMANTIC', () => {
    const group = coalesceSegments([buildRecharge()])[0];
    const payload = buildUpsertPayload(VEHICLE_ID, group);
    const row = rowFromSegment(group, {
      rawDetectionMeta: {
        ...(payload.rawDetectionMeta as Record<string, unknown>),
        coalescedFromCount: 3,
        coalescedFromSegmentIds: ['a', 'b', 'c'],
      },
    });

    const diff = diffCanonicalMaterialIdentity(row, payload);

    expect(diff.materiallyIdentical).toBe(false);
    expect(
      diff.metaDiffs.map((entry) => [entry.key, entry.diffClass, entry.fieldClass]),
    ).toEqual([
      ['coalescedFromCount', 'CANONICAL_PROVENANCE_DIFFERS', 'SEMANTIC'],
      ['coalescedFromSegmentIds', 'CANONICAL_PROVENANCE_DIFFERS', 'SEMANTIC'],
    ]);
  });

  it('classifies legacy diagnostic-only metadata keys as NON_SEMANTIC_METADATA', () => {
    const group = coalesceSegments([buildRecharge()])[0];
    const payload = buildUpsertPayload(VEHICLE_ID, group);
    const row = rowFromSegment(group, {
      rawDetectionMeta: {
        ...(payload.rawDetectionMeta as Record<string, unknown>),
        detectorConfigVersion: 'e1-2026-06',
        legacySource: 'pre-coalescing-detector',
      },
    });

    const diff = diffCanonicalMaterialIdentity(row, payload);

    expect(diff.semanticDiffCount).toBe(0);
    expect(diff.nonSemanticDiffCount).toBe(2);
    expect(
      diff.metaDiffs.every(
        (entry) => entry.diffClass === 'NON_CANONICAL_DIAGNOSTIC_DIFF',
      ),
    ).toBe(true);
  });

  it('classifies float re-serialization of the same value as NON_SEMANTIC_METADATA', () => {
    const diffs = diffRawDetectionMeta(
      { socEndPercent: 55.00000000000001 },
      { socEndPercent: 55 },
    );

    expect(diffs).toEqual([]);
  });

  it('classifies array order drift of canonical provenance as NON_SEMANTIC_METADATA', () => {
    const diffs = diffRawDetectionMeta(
      { coalescedFromSegmentIds: ['b', 'a'] },
      { coalescedFromSegmentIds: ['a', 'b'] },
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].diffClass).toBe('ARRAY_ORDER_DRIFT');
    expect(diffs[0].fieldClass).toBe('NON_SEMANTIC_METADATA');
  });

  it('classifies canonical key presence drift explicitly', () => {
    expect(
      classifyRawDetectionMetaKeyDiff('coalescedFromCount', undefined, 1),
    ).toBe('CANONICAL_KEY_PRESENCE_DRIFT');
    expect(classifyRawDetectionMetaKeyDiff('socEndPercent', 40, 55)).toBe(
      'MEASUREMENT_VALUE_DIFFERS',
    );
  });
});

describe('energy-events recovery forensics — prune authority', () => {
  const partA = buildRecharge({
    segmentId: `dimo-recharge-${TOKEN_ID}-1752710400000`,
    startTime: '2026-07-17T00:00:00.000Z',
    endTime: '2026-07-17T01:00:00.000Z',
    durationSeconds: 3600,
    socStartPercent: 40,
    socEndPercent: 48,
    socDeltaPercent: 8,
    energyStartKwh: 20,
    energyEndKwh: 24,
    energyDeltaKwh: 4,
  });
  const partB = buildRecharge({
    segmentId: `dimo-recharge-${TOKEN_ID}-1752714600000`,
    startTime: '2026-07-17T01:10:00.000Z',
    endTime: '2026-07-17T02:00:00.000Z',
    durationSeconds: 3000,
    socStartPercent: 48,
    socEndPercent: 55,
    socDeltaPercent: 7,
    energyStartKwh: 24,
    energyEndKwh: 28,
    energyDeltaKwh: 4,
  });

  function subsegmentRow(segment: DimoEnergyEventSegment) {
    const singleton = coalesceSegments([segment])[0];
    const row = rowFromSegment(singleton);
    return {
      id: row.id,
      dimoSegmentId: row.dimoSegmentId,
      startTime: row.startTime,
      endTime: row.endTime,
      socDeltaPercent: row.socDeltaPercent,
      energyDeltaKwh: row.energyDeltaKwh,
    };
  }

  it('grants prune authority when the current detector groups the row under a materially identical parent', () => {
    const groups = coalesceSegments([partA, partB]);
    const parent = groups[0];
    const parentRow = rowFromSegment(parent);
    const staleRow = subsegmentRow(partA);

    const assessment = assessSubsegmentProvenance({
      row: staleRow,
      candidateParentRows: [parentRow],
      detectedGroups: groups,
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([parent.coalescedSegmentId]),
    });

    expect(assessment.provenanceProof).toBe('PROVEN_BY_DETECTED_PARENT');
    expect(assessment.parentMateriallyIdentical).toBe(true);
    expect(assessment.temporallyContainedInParent).toBe(true);
    expect(assessment.socProgressionCompatible).toBe('YES');
    expect(assessment.safePruneAuthority).toBe(true);
    expect(assessment.blockers).toEqual([]);
  });

  it('grants prune authority from the persisted parent provenance when DIMO no longer emits the constituents', () => {
    const parent = coalesceSegments([partA, partB])[0];
    const parentRow = rowFromSegment(parent);
    const staleRow = subsegmentRow(partA);

    const assessment = assessSubsegmentProvenance({
      row: staleRow,
      candidateParentRows: [parentRow],
      // Current fetch returns the consolidated session only — no constituents.
      detectedGroups: coalesceSegments([
        {
          ...partA,
          segmentId: parent.coalescedSegmentId,
          endTime: partB.endTime,
          durationSeconds: 7200,
          socEndPercent: 55,
          socDeltaPercent: 15,
          energyEndKwh: 28,
          energyDeltaKwh: 8,
        },
      ]),
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([parent.coalescedSegmentId]),
    });

    expect(assessment.provenanceProof).toBe('PROVEN_BY_STORED_PARENT_PROVENANCE');
    expect(assessment.temporallyContainedInParent).toBe(true);
    expect(assessment.socProgressionCompatible).toBe('YES');
    expect(assessment.safePruneAuthority).toBe(true);
  });

  it('refuses prune authority for a row the current detector still emits as its own canonical event', () => {
    const parent = coalesceSegments([partA, partB])[0];
    const parentRow = rowFromSegment(parent);
    const staleRow = subsegmentRow(partA);

    const assessment = assessSubsegmentProvenance({
      row: staleRow,
      candidateParentRows: [parentRow],
      detectedGroups: coalesceSegments([partA]),
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([
        parent.coalescedSegmentId,
        staleRow.dimoSegmentId,
      ]),
    });

    expect(assessment.stillEmittedByCurrentDetector).toBe(true);
    expect(assessment.safePruneAuthority).toBe(false);
    expect(assessment.blockers).toContain(
      'still_emitted_as_own_canonical_event_by_current_detector',
    );
  });

  it('refuses prune authority when only temporal containment is available', () => {
    const wideParent = coalesceSegments([
      buildRecharge({
        segmentId: `dimo-recharge-${TOKEN_ID}-1752710000000`,
        startTime: '2026-07-16T23:50:00.000Z',
        endTime: '2026-07-17T03:00:00.000Z',
        durationSeconds: 11400,
        socStartPercent: 35,
        socEndPercent: 60,
        socDeltaPercent: 25,
        energyStartKwh: 18,
        energyEndKwh: 32,
        energyDeltaKwh: 14,
      }),
    ])[0];
    const wideParentRow = rowFromSegment(wideParent);
    const staleRow = subsegmentRow(partA);

    const assessment = assessSubsegmentProvenance({
      row: staleRow,
      candidateParentRows: [wideParentRow],
      detectedGroups: [wideParent],
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([wideParent.coalescedSegmentId]),
    });

    expect(assessment.provenanceProof).toBe('INFERRED_TEMPORAL_ONLY');
    expect(assessment.safePruneAuthority).toBe(false);
    expect(assessment.blockers).toContain(
      'provenance_inferred_from_temporal_containment_only',
    );
  });

  it('preserves an independent nearby recharge session with no provenance link', () => {
    const independent = buildRecharge({
      segmentId: `dimo-recharge-${TOKEN_ID}-1752800000000`,
      startTime: '2026-07-18T00:00:00.000Z',
      endTime: '2026-07-18T01:00:00.000Z',
      durationSeconds: 3600,
    });
    const parent = coalesceSegments([partA, partB])[0];

    const assessment = assessSubsegmentProvenance({
      row: subsegmentRow(independent),
      candidateParentRows: [rowFromSegment(parent)],
      detectedGroups: coalesceSegments([partA, partB, independent]),
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([
        parent.coalescedSegmentId,
        coalesceSegments([independent])[0].coalescedSegmentId,
      ]),
    });

    expect(assessment.provenanceProof).toBe('ABSENT');
    expect(assessment.safePruneAuthority).toBe(false);
    expect(assessment.blockers).toContain('no_canonical_parent_provenance_found');
  });

  it('refuses prune authority when the stored parent SOC cannot contain the row SOC', () => {
    const parent = coalesceSegments([partA, partB])[0];
    const parentRow = rowFromSegment(parent, { socDeltaPercent: 2 });
    const staleRow = subsegmentRow(partA);

    const assessment = assessSubsegmentProvenance({
      row: staleRow,
      candidateParentRows: [parentRow],
      detectedGroups: [],
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set<string>(),
    });

    expect(assessment.provenanceProof).toBe('PROVEN_BY_STORED_PARENT_PROVENANCE');
    expect(assessment.socProgressionCompatible).toBe('NO');
    expect(assessment.safePruneAuthority).toBe(false);
    expect(assessment.blockers).toContain(
      'soc_progression_incompatible_with_canonical_parent',
    );
  });

  it('refuses prune authority when the detected parent row is not materially identical', () => {
    const groups = coalesceSegments([partA, partB]);
    const parent = groups[0];
    const parentRow = rowFromSegment(parent, {
      confidence: EnergyEventConfidence.LOW,
    });

    const assessment = assessSubsegmentProvenance({
      row: subsegmentRow(partA),
      candidateParentRows: [parentRow],
      detectedGroups: groups,
      vehicleId: VEHICLE_ID,
      currentlyEmittedSegmentIds: new Set([parent.coalescedSegmentId]),
    });

    expect(assessment.parentMateriallyIdentical).toBe(false);
    expect(assessment.safePruneAuthority).toBe(false);
    expect(assessment.blockers).toContain(
      'canonical_parent_row_not_materially_identical',
    );
  });
});

describe('energy-events recovery forensics — helpers', () => {
  it('reads stored coalesce provenance defensively', () => {
    expect(readStoredCoalesceProvenance(null)).toEqual({
      coalescedFromSegmentIds: [],
      coalescedFromCount: null,
    });
    expect(
      readStoredCoalesceProvenance({
        coalescedFromCount: 2,
        coalescedFromSegmentIds: ['a', 5, 'b'],
      }),
    ).toEqual({ coalescedFromSegmentIds: ['a', 'b'], coalescedFromCount: 2 });
  });

  it('redacts the DIMO token id from canonical segment ids', () => {
    expect(
      redactSegmentIdentity('dimo-recharge-4242-1752710400000', () => 'T1'),
    ).toBe('dimo-recharge-T1-1752710400000');
    expect(
      redactSegmentIdentity('dimo-recharge-coalesced-4242-1752710400000', () => 'T1'),
    ).toBe('dimo-recharge-coalesced-T1-1752710400000');
    expect(redactSegmentIdentity('legacy-manual-id', () => 'T1')).toBe(
      'legacy-manual-id',
    );
  });
});
