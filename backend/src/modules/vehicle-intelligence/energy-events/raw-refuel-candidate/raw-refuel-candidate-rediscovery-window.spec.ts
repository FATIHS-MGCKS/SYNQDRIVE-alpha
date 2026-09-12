import { RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS } from './raw-refuel-candidate.constants';
import { computeRawRefuelCandidateRediscoveryWindow } from './raw-refuel-candidate-rediscovery-window';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

describe('raw-refuel-candidate-rediscovery-window', () => {
  it('anchors on observation evidence with symmetric lookback', () => {
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
      scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    });
    const serviceNow = new Date('2026-09-06T10:00:00.000Z');
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expect(window.start.getTime()).toBe(
      new Date('2026-09-06T08:30:00.000Z').getTime() -
        RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS,
    );
    expect(window.end.getTime()).toBe(
      new Date('2026-09-06T12:00:00.000Z').getTime() +
        RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS,
    );
  });
});
