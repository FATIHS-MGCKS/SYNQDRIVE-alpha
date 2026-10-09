import type { RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
  RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  classifyRawRefuelCandidateOverlap,
  classifySameVersionRawRefuelCandidateOverlap,
} from './raw-refuel-candidate.matcher';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

const V2_DETECTOR = 'rfrf-rise-detector-v2-contract';

function asStoredRow(
  observation: ReturnType<typeof buildTestObservation>,
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  return {
    id: overrides.id ?? 'cand-stored',
    organizationId: observation.organizationId,
    vehicleId: observation.vehicleId,
    candidateIdentityKey: overrides.candidateIdentityKey ?? 'legacy-key',
    detectionVersion: overrides.detectionVersion ?? RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
    detectorVersion: overrides.detectorVersion ?? 'rfrf-rise-detector-v1',
    signalChannel: observation.signalChannel,
    lifecycleState: overrides.lifecycleState ?? 'OBSERVED',
    rejectionReason: overrides.rejectionReason ?? null,
    evidenceRevisionFingerprint: overrides.evidenceRevisionFingerprint ?? 'fp-v1',
    physicalEvidenceStart: observation.physicalEvidenceStart ?? null,
    physicalEvidenceEnd: observation.physicalEvidenceEnd ?? null,
    riseOnsetAt: observation.riseOnsetAt ?? null,
    riseEndAt: observation.riseEndAt ?? null,
    preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters ?? null,
    postFuelAbsoluteLiters: overrides.postFuelAbsoluteLiters ?? observation.postFuelAbsoluteLiters ?? null,
    deltaAbsoluteLiters: observation.deltaAbsoluteLiters ?? null,
    preFuelRelativePercent: null,
    postFuelRelativePercent: null,
    deltaRelativePercent: null,
    prePlateauSampleCount: null,
    postPlateauSampleCount: null,
    totalSampleCount: null,
    maxSampleGapSeconds: null,
    absoluteSignalTrust: null,
    relativeSignalAvailable: null,
    routeEvidenceAvailable: null,
    stationaryEvidenceAvailable: null,
    scanWindowStart: null,
    scanWindowEnd: null,
    signalProvider: null,
    evidenceMeta: overrides.evidenceMeta ?? null,
    qualityMeta: null,
    firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
    lastObservedAt: new Date('2026-09-30T05:00:00.000Z'),
    createdAt: new Date('2026-09-30T04:00:00.000Z'),
    updatedAt: new Date('2026-09-30T05:00:00.000Z'),
    recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
    recoveryLastAttemptAt: null,
    recoveryAttemptCount: 0,
    recoveryLastOutcome: null,
    recoveryLeaseExpiresAt: null,
  } as RawRefuelCandidate;
}

function v2Observation(
  base: ReturnType<typeof buildTestObservation>,
  overrides: Record<string, unknown> = {},
) {
  return buildTestObservation({
    ...base,
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    detectorVersion: V2_DETECTOR,
    lifecycleState: 'READY_FOR_PERSIST',
    evidenceMeta: { postFuelAuthority: 'SETTLED_MEDIAN' },
    ...overrides,
  });
}

describe('R2 cross-version matcher', () => {
  const org = 'org-661';
  const veh = 'veh-661';
  const v1Base = buildTestObservation({
    organizationId: org,
    vehicleId: veh,
    detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
    preFuelAbsoluteLiters: 6,
    postFuelAbsoluteLiters: 20,
    riseOnsetAt: new Date('2026-09-30T04:58:04.772Z'),
    riseEndAt: new Date('2026-09-30T05:01:34.774Z'),
    physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
    physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
  });

  it('M1 same-version legacy behavior unchanged', () => {
    const a = buildTestObservation({ organizationId: org, vehicleId: veh });
    const b = buildTestObservation({
      organizationId: org,
      vehicleId: veh,
      riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
    });
    expect(classifySameVersionRawRefuelCandidateOverlap(b, a)).toBe('SAME_PHYSICAL_RISE');
    expect(classifyRawRefuelCandidateOverlap(b, a)).toBe('SAME_PHYSICAL_RISE');
  });

  it('M2 authorized v2→v1 PEAK→SETTLED => SAME', () => {
    const stored = asStoredRow(v1Base, { postFuelAbsoluteLiters: 20 });
    const obs = v2Observation(v1Base, { postFuelAbsoluteLiters: 19 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('SAME_PHYSICAL_RISE');
  });

  it('M3 pre null => INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, { preFuelAbsoluteLiters: null });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M4 pre false => DISTINCT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, { preFuelAbsoluteLiters: 12 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M5 missing incoming authority => INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, { evidenceMeta: {} });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M6 malformed incoming authority => INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, { evidenceMeta: { postFuelAuthority: 'PEAK' } });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M7 reverse authority shift => not SAME', () => {
    const stored = asStoredRow(v1Base, {
      evidenceMeta: { postFuelAuthority: 'SETTLED_MEDIAN' },
    });
    const obs = v2Observation(v1Base, { evidenceMeta: { postFuelAuthority: 'PEAK_INSTANTANEOUS' } });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).not.toBe('SAME_PHYSICAL_RISE');
  });

  it('M8 unauthorized version pair => DISTINCT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, { detectionVersion: 'rfrf-rise-v99' });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M9 terminal authorized same physical rise => VERSIONED_TERMINAL_CONFLICT', () => {
    const stored = asStoredRow(v1Base, {
      lifecycleState: 'REJECTED',
      rejectionReason: 'INSUFFICIENT_POST_PLATEAU',
    });
    const obs = v2Observation(v1Base, { postFuelAbsoluteLiters: 19 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('VERSIONED_TERMINAL_CONFLICT');
  });

  it('M10 same-version terminal does NOT use VERSIONED_TERMINAL_CONFLICT', () => {
    const stored = asStoredRow(v1Base, {
      lifecycleState: 'REJECTED',
      rejectionReason: 'INSUFFICIENT_POST_PLATEAU',
    });
    const obs = buildTestObservation({
      ...v1Base,
      detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
    });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).not.toBe('VERSIONED_TERMINAL_CONFLICT');
  });

  it('M11 same-version contradictory post remains current behavior', () => {
    const stored = asStoredRow(v1Base, { postFuelAbsoluteLiters: 20 });
    const obs = buildTestObservation({
      ...v1Base,
      detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
      postFuelAbsoluteLiters: 31,
      preFuelAbsoluteLiters: 6,
    });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M12 >45m/no physical overlap remains DISTINCT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, {
      riseOnsetAt: new Date('2026-09-30T06:30:00.000Z'),
      physicalEvidenceStart: new Date('2026-09-30T06:20:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T06:40:00.000Z'),
    });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M13 distant physical + null pre => DISTINCT not INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base, {
      preFuelAbsoluteLiters: null,
      riseOnsetAt: new Date('2026-09-30T01:00:00.000Z'),
      physicalEvidenceStart: new Date('2026-09-30T00:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T01:10:00.000Z'),
    });
    const obs = v2Observation(v1Base, {
      riseOnsetAt: new Date('2026-09-30T08:00:00.000Z'),
      physicalEvidenceStart: new Date('2026-09-30T07:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-30T08:10:00.000Z'),
    });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('M14 v1 PEAK + v2 PEAK same physical => INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base);
    const obs = v2Observation(v1Base, {
      evidenceMeta: { postFuelAuthority: 'PEAK_INSTANTANEOUS' },
    });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M15 stored malformed authority => INSUFFICIENT', () => {
    const stored = asStoredRow(v1Base, { evidenceMeta: { postFuelAuthority: 'BOGUS' } });
    const obs = v2Observation(v1Base, { postFuelAbsoluteLiters: 19 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M16 absent legacy authority still allows SAME via PEAK inference', () => {
    const stored = asStoredRow(v1Base, { evidenceMeta: null });
    const obs = v2Observation(v1Base, { postFuelAbsoluteLiters: 19 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('SAME_PHYSICAL_RISE');
  });

  it('M17 stored v1 post=null + valid v2 SETTLED post => INSUFFICIENT_EVIDENCE', () => {
    const stored = asStoredRow(v1Base);
    stored.postFuelAbsoluteLiters = null;
    const obs = v2Observation(v1Base, { postFuelAbsoluteLiters: 19 });
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('M18 incoming v2 post=null + valid v1 peak => INSUFFICIENT_EVIDENCE', () => {
    const stored = asStoredRow(v1Base, { postFuelAbsoluteLiters: 20 });
    const obs = v2Observation(v1Base);
    obs.postFuelAbsoluteLiters = null;
    expect(classifyRawRefuelCandidateOverlap(obs, stored)).toBe('INSUFFICIENT_EVIDENCE');
  });
});
