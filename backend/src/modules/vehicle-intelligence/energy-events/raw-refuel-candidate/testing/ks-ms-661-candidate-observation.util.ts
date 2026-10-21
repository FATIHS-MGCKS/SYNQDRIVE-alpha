import {
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_VEHICLE_ID,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate.types';
import { buildTestObservation } from './raw-refuel-candidate-test.util';

/** Manual normalized observation for KS MS 661 — persistence only, not detector proof. */
export function buildKsMs661ObservedObservation(
  overrides: Partial<RawRefuelCandidateObservation> = {},
): RawRefuelCandidateObservation {
  return buildTestObservation({
    organizationId: KS_MS_661_FIXTURE_ORGANIZATION_ID,
    vehicleId: KS_MS_661_FIXTURE_VEHICLE_ID,
    preFuelAbsoluteLiters: 7,
    postFuelAbsoluteLiters: 31,
    deltaAbsoluteLiters: 24,
    riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
    physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
    physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
    scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
    scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
    lifecycleState: 'OBSERVED',
    ...overrides,
  });
}
