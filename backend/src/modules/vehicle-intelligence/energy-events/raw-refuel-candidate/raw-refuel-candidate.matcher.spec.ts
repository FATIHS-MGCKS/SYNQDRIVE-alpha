import { classifyRawRefuelCandidateOverlap } from './raw-refuel-candidate.matcher';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

describe('raw-refuel-candidate.matcher', () => {
  it('matches bucket-shifted rise onset for same physical fill', () => {
    const pass1 = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    });
    const pass2 = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
    });
    expect(classifyRawRefuelCandidateOverlap(pass2, pass1)).toBe('SAME_PHYSICAL_RISE');
  });

  it('keeps two refuels 45+ minutes apart distinct', () => {
    const first = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T09:40:00.000Z'),
      postFuelAbsoluteLiters: 31,
      preFuelAbsoluteLiters: 7,
    });
    const second = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T10:25:00.000Z'),
      preFuelAbsoluteLiters: 20,
      postFuelAbsoluteLiters: 45,
      physicalEvidenceStart: new Date('2026-09-06T10:20:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-06T10:30:00.000Z'),
    });
    expect(classifyRawRefuelCandidateOverlap(second, first)).toBe('DISTINCT_PHYSICAL_RISE');
  });
});
