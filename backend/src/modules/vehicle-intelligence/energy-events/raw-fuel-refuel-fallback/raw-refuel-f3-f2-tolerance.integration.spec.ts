import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import {
  RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS,
  RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS,
} from '../raw-refuel-candidate/raw-refuel-candidate.constants';
import { classifyRawRefuelCandidateOverlap } from '../raw-refuel-candidate/raw-refuel-candidate.matcher';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { buildTestObservation } from '../raw-refuel-candidate/testing/raw-refuel-candidate-test.util';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildRuntimeDetectionContextFromTrust,
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

describe('RFRF F4-PR3 — F3/F2 tolerance integration gate', () => {
  it('documents actual tolerance values', () => {
    expect(RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.prePlateauToleranceLiters).toBe(0.5);
    expect(RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.postPlateauToleranceLiters).toBe(0.5);
    expect(RAW_REFUEL_CANDIDATE_PRE_PLATEAU_TOLERANCE_LITERS).toBe(0.5);
    expect(RAW_REFUEL_CANDIDATE_POST_PLATEAU_TOLERANCE_LITERS).toBe(1.0);
  });

  const baseSamples = [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ];

  it('F3 candidate rediscovers same F2 row under post-plateau drift within F2 envelope', () => {
    const detection = detectRawFuelRises({
      context: buildRuntimeDetectionContextFromTrust(
        {
          samples: baseSamples,
          scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
        },
        { organizationId: 'org-tol', vehicleId: 'veh-tol' },
      ),
      samples: baseSamples,
    });
    const first = detection.candidates[0]!;
    const drifted = buildTestObservation({
      organizationId: 'org-tol',
      vehicleId: 'veh-tol',
      detectionVersion: first.detectionVersion,
      detectorVersion: first.detectorVersion,
      riseOnsetAt: first.riseOnsetAt!,
      physicalEvidenceStart: first.physicalEvidenceStart!,
      physicalEvidenceEnd: first.physicalEvidenceEnd!,
      preFuelAbsoluteLiters: first.preFuelAbsoluteLiters!,
      postFuelAbsoluteLiters: (first.postFuelAbsoluteLiters ?? 30) + 0.6,
      deltaAbsoluteLiters: (first.deltaAbsoluteLiters ?? 20) + 0.6,
      lifecycleState: first.lifecycleState,
    });
    expect(classifyRawRefuelCandidateOverlap(drifted, first)).toBe('SAME_PHYSICAL_RISE');
  });

  it('post-plateau drift beyond F2 tolerance remains DISTINCT', () => {
    const first = buildTestObservation({
      organizationId: 'org-tol',
      vehicleId: 'veh-tol',
      postFuelAbsoluteLiters: 30,
    });
    const drifted = buildTestObservation({
      organizationId: 'org-tol',
      vehicleId: 'veh-tol',
      postFuelAbsoluteLiters: 31.5,
      preFuelAbsoluteLiters: first.preFuelAbsoluteLiters!,
      riseOnsetAt: first.riseOnsetAt!,
    });
    expect(classifyRawRefuelCandidateOverlap(drifted, first)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('two distinct refuels 45+ minutes apart remain distinct', () => {
    const first = buildTestObservation({
      organizationId: 'org-tol',
      vehicleId: 'veh-tol',
      riseOnsetAt: new Date('2026-09-06T09:40:00.000Z'),
    });
    const second = buildTestObservation({
      organizationId: 'org-tol',
      vehicleId: 'veh-tol',
      riseOnsetAt: new Date('2026-09-06T10:25:00.000Z'),
      preFuelAbsoluteLiters: 20,
      postFuelAbsoluteLiters: 45,
    });
    expect(classifyRawRefuelCandidateOverlap(second, first)).toBe('DISTINCT_PHYSICAL_RISE');
  });

  it('F3 stepping/coalescence maps to one identity key input', () => {
    const detection = detectRawFuelRises({
      context: buildRuntimeDetectionContextFromTrust(
        {
          samples: baseSamples,
          scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
        },
        { organizationId: 'org-tol', vehicleId: 'veh-tol' },
      ),
      samples: baseSamples,
    });
    expect(detection.candidates).toHaveLength(1);
    expect(typeof RawRefuelCandidateService).toBe('function');
  });
});
