import type { RawRefuelCandidate } from '@prisma/client';
import type { RefuelRowForMatcher } from '../../physical-refuel-identity.matcher';

/** WOB L 7503 — 2026-09-19 sparse-bridge fallback candidate (production-shaped). */
export const WOB_2026_09_19_STRETCHED_END_CANDIDATE_ID =
  'e4c7f4bc-e9a4-40e4-8aad-7d409a4ca145';

export const WOB_2026_09_19_AUTHORITATIVE_NATIVE_EVENT_ID =
  'cafd8fdf-0000-4000-8000-000000000003';

export const WOB_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';

export function buildWob20260919StretchedEndCandidate(
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  return {
    id: WOB_2026_09_19_STRETCHED_END_CANDIDATE_ID,
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: WOB_VEHICLE_ID,
    candidateIdentityKey: '27d6a9bec80eacb37759ad763e22316c7074ba634cd47b02a8a763813c2c9073',
    detectionVersion: 'rfrf-rise-v1',
    detectorVersion: 'rfrf-rise-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-wob-0919',
    physicalEvidenceStart: new Date('2026-09-19T15:40:26.000Z'),
    physicalEvidenceEnd: new Date('2026-09-19T16:58:31.000Z'),
    riseOnsetAt: new Date('2026-09-19T16:11:28.937Z'),
    riseEndAt: new Date('2026-09-19T16:15:27.000Z'),
    preFuelAbsoluteLiters: 5,
    postFuelAbsoluteLiters: 18,
    deltaAbsoluteLiters: 12,
    preFuelRelativePercent: 9.804,
    postFuelRelativePercent: 32.549,
    deltaRelativePercent: 22.745,
    prePlateauSampleCount: 13,
    postPlateauSampleCount: 5,
    totalSampleCount: 24,
    maxSampleGapSeconds: 990,
    absoluteSignalTrust: 'UNKNOWN',
    relativeSignalAvailable: true,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
    signalProvider: 'DIMO',
    evidenceMeta: {},
    qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
    firstObservedAt: new Date('2026-09-19T17:00:00.000Z'),
    lastObservedAt: new Date('2026-09-19T17:00:00.000Z'),
    createdAt: new Date('2026-09-19T17:00:00.000Z'),
    updatedAt: new Date('2026-09-19T17:00:00.000Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

/** Authoritative native canonical row with delayed segment end (telemetry gap). */
export function buildWob20260919AuthoritativeNativeRow(
  overrides: Partial<RefuelRowForMatcher> = {},
): RefuelRowForMatcher {
  return {
    id: WOB_2026_09_19_AUTHORITATIVE_NATIVE_EVENT_ID,
    vehicleId: WOB_VEHICLE_ID,
    kind: 'REFUEL',
    startTime: '2026-09-19T16:09:00.000Z',
    endTime: '2026-09-19T16:54:00.000Z',
    fuelStartLiters: 5,
    fuelEndLiters: 18,
    fuelStartPercent: 9.8,
    fuelEndPercent: 32.5,
    fuelDeltaLiters: 14,
    fuelDeltaPercent: 22.7,
    durationSeconds: 2700,
    odometerEndKm: null,
    dimoSegmentId: 'dimo-wob-0919-canonical',
    ...overrides,
  };
}

/** Event B — 2026-09-27 no native sibling shape. */
export function buildWob20260927EventBCandidate(
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  return {
    id: '96cf018d-50fa-4bc5-9fba-e676c08c4eef',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: WOB_VEHICLE_ID,
    candidateIdentityKey: '27d6a9bec80eacb37759ad763e22316c7074ba634cd47b02a8a763813c2c9073',
    detectionVersion: 'rfrf-rise-v1',
    detectorVersion: 'rfrf-rise-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-wob-0927',
    physicalEvidenceStart: new Date('2026-09-27T21:30:46.923Z'),
    physicalEvidenceEnd: new Date('2026-09-27T21:38:46.923Z'),
    riseOnsetAt: new Date('2026-09-27T21:34:16.923Z'),
    riseEndAt: new Date('2026-09-27T21:36:46.923Z'),
    preFuelAbsoluteLiters: 4,
    postFuelAbsoluteLiters: 13,
    deltaAbsoluteLiters: 9,
    preFuelRelativePercent: 7.843,
    postFuelRelativePercent: 24.118,
    deltaRelativePercent: 16.275,
    prePlateauSampleCount: 3,
    postPlateauSampleCount: 5,
    totalSampleCount: 13,
    maxSampleGapSeconds: 150,
    absoluteSignalTrust: 'UNKNOWN',
    relativeSignalAvailable: true,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    scanWindowStart: new Date('2026-09-27T21:17:16.923Z'),
    scanWindowEnd: new Date('2026-09-27T22:02:16.923Z'),
    signalProvider: 'DIMO',
    evidenceMeta: {},
    qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
    firstObservedAt: new Date('2026-09-27T21:47:18.579Z'),
    lastObservedAt: new Date('2026-09-27T22:02:17.817Z'),
    createdAt: new Date('2026-09-27T21:47:18.579Z'),
    updatedAt: new Date('2026-09-27T23:04:09.127Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

/** KS MX 2024 stale-baseline READY fragment (separate defect — must not converge here). */
export function buildKsMx20240916StaleBaselineCandidate(
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  return {
    id: 'c72eb9df-a02e-412b-9d9c-a08b72a9f719',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    candidateIdentityKey: 'ksmx-stale-baseline-key',
    detectionVersion: 'rfrf-rise-v1',
    detectorVersion: 'rfrf-rise-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-ksmx-stale',
    physicalEvidenceStart: new Date('2026-09-16T11:42:00.008Z'),
    physicalEvidenceEnd: new Date('2026-09-16T20:55:00.008Z'),
    riseOnsetAt: new Date('2026-09-16T20:52:30.008Z'),
    riseEndAt: new Date('2026-09-16T20:53:00.008Z'),
    preFuelAbsoluteLiters: 10,
    postFuelAbsoluteLiters: 27,
    deltaAbsoluteLiters: 17,
    preFuelRelativePercent: 15.7,
    postFuelRelativePercent: 42.2,
    deltaRelativePercent: 26.5,
    prePlateauSampleCount: 4,
    postPlateauSampleCount: 5,
    totalSampleCount: 12,
    maxSampleGapSeconds: 600,
    absoluteSignalTrust: 'UNKNOWN',
    relativeSignalAvailable: true,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    scanWindowStart: new Date('2026-09-16T18:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-16T22:00:00.000Z'),
    signalProvider: 'DIMO',
    evidenceMeta: {},
    qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
    firstObservedAt: new Date('2026-09-16T21:00:00.000Z'),
    lastObservedAt: new Date('2026-09-16T21:00:00.000Z'),
    createdAt: new Date('2026-09-16T21:00:00.000Z'),
    updatedAt: new Date('2026-09-16T21:00:00.000Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

export function buildKsMx20240916NativeRow(): RefuelRowForMatcher {
  return {
    id: '0f2b8f8a-2c6f-40b5-b573-a78e4e4ef636',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    kind: 'REFUEL',
    startTime: '2026-09-16T20:46:49.000Z',
    endTime: '2026-09-16T21:00:23.000Z',
    fuelStartLiters: 5,
    fuelEndLiters: 27,
    fuelStartPercent: 8.2,
    fuelEndPercent: 42.0,
    fuelDeltaLiters: 22,
    fuelDeltaPercent: 33.8,
    durationSeconds: 814,
    odometerEndKm: null,
    dimoSegmentId: 'dimo-ksmx-0916',
  };
}
