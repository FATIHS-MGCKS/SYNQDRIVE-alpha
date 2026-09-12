import type { RawRefuelCandidateLifecycleState } from '@prisma/client';
import { RFRF_DETECTION_VERSION, RFRF_DETECTOR_VERSION } from '../raw-refuel-candidate.constants';
import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate.types';

export function buildTestObservation(
  overrides: Partial<RawRefuelCandidateObservation> & {
    organizationId: string;
    vehicleId: string;
  },
): RawRefuelCandidateObservation {
  return {
    detectionVersion: RFRF_DETECTION_VERSION,
    detectorVersion: RFRF_DETECTOR_VERSION,
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'OBSERVED',
    preFuelAbsoluteLiters: 7,
    postFuelAbsoluteLiters: 29,
    deltaAbsoluteLiters: 22,
    riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    riseEndAt: new Date('2026-09-06T09:43:00.000Z'),
    physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
    physicalEvidenceEnd: new Date('2026-09-06T09:43:00.000Z'),
    prePlateauSampleCount: 13,
    postPlateauSampleCount: 2,
    totalSampleCount: 15,
    maxSampleGapSeconds: 270,
    absoluteSignalTrust: 'TRUSTED',
    relativeSignalAvailable: false,
    scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
    scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    signalProvider: 'DIMO',
    observedAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  };
}

export function withLifecycle(
  observation: RawRefuelCandidateObservation,
  lifecycleState: RawRefuelCandidateLifecycleState,
): RawRefuelCandidateObservation {
  return { ...observation, lifecycleState };
}
