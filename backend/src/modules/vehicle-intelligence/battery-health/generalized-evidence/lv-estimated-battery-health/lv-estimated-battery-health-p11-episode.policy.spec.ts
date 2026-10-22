import { selectP11EpisodeRepresentatives } from './lv-estimated-battery-health-p11-episode.policy';
import type { LvOperationalConditionObservationV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';

function rest(
  partial: Partial<LvOperationalConditionObservationV1> & { voltageV: number },
): LvOperationalConditionObservationV1 {
  return {
    observationId: partial.observationId ?? 'o1',
    sourceMeasurementId: partial.sourceMeasurementId ?? 'm1',
    restSessionId: partial.restSessionId ?? 's1',
    voltageV: partial.voltageV,
    voltageObservedAt: partial.voltageObservedAt ?? '2026-10-01T10:00:00.000Z',
    providerObservationAt: partial.providerObservationAt ?? '2026-10-01T10:00:00.000Z',
    operationalContext: 'REST',
    evidenceClass: 'PARKED_REST_CANDIDATE',
    actualRestAgeHours: partial.actualRestAgeHours ?? 8,
    temperatureC: null,
    isLvCharging: false,
    engineRunning: false,
  };
}

describe('selectP11EpisodeRepresentatives', () => {
  it('prefers stable long-rest median over latest pre-start low in same session', () => {
    const stable = rest({
      observationId: 'stable',
      voltageV: 12.75,
      actualRestAgeHours: 8,
      voltageObservedAt: '2026-10-01T08:00:00.000Z',
    });
    const preStartLow = rest({
      observationId: 'low',
      voltageV: 11.7,
      actualRestAgeHours: 2,
      voltageObservedAt: '2026-10-01T10:00:00.000Z',
    });
    const wake = {
      ...preStartLow,
      observationId: 'wake',
      voltageObservedAt: '2026-10-01T10:00:10.000Z',
      isLvCharging: true,
      operationalContext: 'CHARGING' as const,
      evidenceClass: 'CHARGING_CONTAMINATED',
    };
    const result = selectP11EpisodeRepresentatives({
      eligibleRestObservations: [stable, preStartLow],
      assessmentTimelineObservations: [stable, preStartLow, wake],
    });
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].representativeVoltageV).toBeGreaterThan(12.5);
    expect(result.lowVoltageEvents.length).toBeGreaterThan(0);
  });
});
