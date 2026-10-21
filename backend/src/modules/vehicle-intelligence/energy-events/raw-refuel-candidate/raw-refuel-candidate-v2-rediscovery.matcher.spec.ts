import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import { RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION } from './raw-refuel-candidate-cross-version-compatibility.authority';
import { classifyRawRefuelCandidateOverlap } from './raw-refuel-candidate.matcher';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

const V2_DETECTOR = 'rfrf-rise-detector-v2-contract';

function freshV2Meta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    postFuelAuthority: 'SETTLED_MEDIAN',
    baselineRecencyClassification: 'FRESH',
    ...overrides,
  };
}

function storedV2Row(
  base: ReturnType<typeof buildTestObservation>,
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  return {
    ...(base as unknown as RawRefuelCandidate),
    id: 'stored-v2',
    candidateIdentityKey: 'physical-key',
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    detectorVersion: V2_DETECTOR,
    lifecycleState: 'READY_FOR_PERSIST',
    evidenceRevisionFingerprint: 'fp',
    firstObservedAt: new Date(),
    lastObservedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    recoveryNextAttemptAt: new Date(),
    recoveryAttemptCount: 0,
    ...overrides,
  } as RawRefuelCandidate;
}

describe('R3B v2→v2 settled-post rediscovery matcher', () => {
  const riseOnset = new Date('2026-09-30T04:58:04.772Z');
  const riseEnd = new Date('2026-09-30T05:01:34.774Z');

  it('M1 reconciles revised SETTLED_MEDIAN beyond post plateau tolerance', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base, {
      postFuelAbsoluteLiters: 20,
      evidenceMeta: freshV2Meta() as Prisma.JsonValue,
    });
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 17,
      evidenceMeta: freshV2Meta(),
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('SAME_PHYSICAL_RISE');
  });

  it('M2 keeps within-tolerance post change on same rise', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 19,
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base, { postFuelAbsoluteLiters: 19 });
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 18,
      evidenceMeta: freshV2Meta(),
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('SAME_PHYSICAL_RISE');
  });

  it('M3 separates different physical rise on same vehicle', () => {
    const first = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 19,
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(first);
    const second = buildTestObservation({
      ...first,
      riseOnsetAt: new Date('2026-09-30T08:00:00.000Z'),
      riseEndAt: new Date('2026-09-30T08:05:00.000Z'),
      preFuelAbsoluteLiters: 10,
      postFuelAbsoluteLiters: 25,
      physicalEvidenceStart: new Date('2026-09-30T07:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T08:10:00.000Z'),
      evidenceMeta: freshV2Meta(),
    });
    expect(classifyRawRefuelCandidateOverlap(second, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M4 fails closed without SETTLED_MEDIAN authority', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 19,
      riseOnsetAt: riseOnset,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base, { evidenceMeta: freshV2Meta() as Prisma.JsonValue });
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 17,
      evidenceMeta: { baselineRecencyClassification: 'FRESH' },
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M5 fails closed on STALE baseline on stored row', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      riseOnsetAt: riseOnset,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base, {
      evidenceMeta: freshV2Meta({ baselineRecencyClassification: 'STALE' }) as Prisma.JsonValue,
    });
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 17,
      evidenceMeta: freshV2Meta(),
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M7 PEAK_INSTANTANEOUS v2 pair delegates to legacy same-version semantics', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      evidenceMeta: { postFuelAuthority: 'PEAK_INSTANTANEOUS' },
    });
    const stored = storedV2Row(base, {
      evidenceMeta: { postFuelAuthority: 'PEAK_INSTANTANEOUS' } as Prisma.JsonValue,
    });
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 17,
      evidenceMeta: { postFuelAuthority: 'PEAK_INSTANTANEOUS' },
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M8 missing rise episode anchors fails closed for settled v2', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      riseOnsetAt: riseOnset,
      riseEndAt: null,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base, { riseEndAt: riseEnd });
    const incoming = buildTestObservation({ ...base, evidenceMeta: freshV2Meta() });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M9 two refuels inside neighborhood stay distinct', () => {
    const first = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 19,
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(first);
    const second = buildTestObservation({
      ...first,
      riseOnsetAt: new Date('2026-09-30T05:30:00.000Z'),
      riseEndAt: new Date('2026-09-30T05:35:00.000Z'),
      preFuelAbsoluteLiters: 10,
      postFuelAbsoluteLiters: 25,
      evidenceMeta: freshV2Meta(),
    });
    expect(classifyRawRefuelCandidateOverlap(second, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M10 shifted bucket + stale baseline is ambiguity not distinct merge', () => {
    const stored = storedV2Row(
      buildTestObservation({
        organizationId: 'org-r3b',
        vehicleId: 'veh-r3b',
        detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
        detectorVersion: V2_DETECTOR,
        preFuelAbsoluteLiters: 6,
        postFuelAbsoluteLiters: 20,
        riseOnsetAt: riseOnset,
        riseEndAt: riseEnd,
        evidenceMeta: freshV2Meta(),
      }),
      { evidenceMeta: freshV2Meta() as Prisma.JsonValue },
    );
    const incoming = buildTestObservation({
      organizationId: 'org-r3b',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 17,
      riseOnsetAt: new Date('2026-09-30T05:04:04.772Z'),
      riseEndAt: new Date('2026-09-30T05:07:34.774Z'),
      physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T05:10:00.000Z'),
      evidenceMeta: {
        postFuelAuthority: 'SETTLED_MEDIAN',
        baselineRecencyClassification: 'STALE',
      },
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M6 tenant isolation — different organization', () => {
    const base = buildTestObservation({
      organizationId: 'org-a',
      vehicleId: 'veh-r3b',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      detectorVersion: V2_DETECTOR,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      riseOnsetAt: riseOnset,
      evidenceMeta: freshV2Meta(),
    });
    const stored = storedV2Row(base);
    const incoming = buildTestObservation({
      ...base,
      organizationId: 'org-b',
      postFuelAbsoluteLiters: 17,
    });
    expect(classifyRawRefuelCandidateOverlap(incoming, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });
});
