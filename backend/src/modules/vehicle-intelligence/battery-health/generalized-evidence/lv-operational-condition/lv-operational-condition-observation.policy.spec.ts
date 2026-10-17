import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  dedupeConditionObservationsBySourceMeasurementId,
  observationProviderEventTimeMs,
  selectEpisodeRepresentativesForOperationalRisk,
  selectLatestEligibleRestObservation,
} from './lv-operational-condition-observation.policy';
import { evaluateStartabilityV1 } from './lv-operational-condition-startability.policy';
import type { LvOperationalConditionObservationV1 } from './lv-operational-condition-v1.types';

function obs(
  partial: Partial<LvOperationalConditionObservationV1> & { observationId: string },
): LvOperationalConditionObservationV1 {
  return {
    sourceMeasurementId: partial.sourceMeasurementId ?? 'm-1',
    restSessionId: partial.restSessionId ?? null,
    voltageV: partial.voltageV ?? 12.5,
    voltageObservedAt: partial.voltageObservedAt ?? '2026-10-01T08:00:00.000Z',
    providerObservationAt: partial.providerObservationAt ?? null,
    operationalContext: partial.operationalContext ?? 'REST',
    evidenceClass: partial.evidenceClass ?? BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
    actualRestAgeHours: partial.actualRestAgeHours ?? 8,
    temperatureC: partial.temperatureC ?? 20,
    isLvCharging: partial.isLvCharging ?? false,
    engineRunning: partial.engineRunning ?? false,
    ...partial,
  };
}

describe('lv-operational-condition observation policy', () => {
  it('dedupes by sourceMeasurementId keeping newest voltageObservedAt', () => {
    const rows = dedupeConditionObservationsBySourceMeasurementId([
      obs({
        observationId: 'a',
        sourceMeasurementId: 'same',
        voltageObservedAt: '2026-10-01T08:00:00.000Z',
      }),
      obs({
        observationId: 'b',
        sourceMeasurementId: 'same',
        voltageObservedAt: '2026-10-02T08:00:00.000Z',
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].observationId).toBe('b');
  });

  it('selects latest eligible REST by providerObservationAt', () => {
    const latest = selectLatestEligibleRestObservation([
      obs({
        observationId: 'old',
        providerObservationAt: '2026-10-01T10:00:00.000Z',
        voltageObservedAt: '2026-10-01T09:00:00.000Z',
      }),
      obs({
        observationId: 'new',
        providerObservationAt: '2026-10-02T10:00:00.000Z',
        voltageObservedAt: '2026-10-01T08:00:00.000Z',
      }),
    ]);
    expect(latest?.observationId).toBe('new');
    expect(observationProviderEventTimeMs(latest!)).toBe(Date.parse('2026-10-02T10:00:00.000Z'));
  });

  it('collapses multiple points in one REST session to one episode representative', () => {
    const reps = selectEpisodeRepresentativesForOperationalRisk([
      obs({
        observationId: 's1a',
        restSessionId: 'sess-1',
        voltageV: 12.4,
        providerObservationAt: '2026-10-01T08:00:00.000Z',
      }),
      obs({
        observationId: 's1b',
        restSessionId: 'sess-1',
        voltageV: 12.6,
        providerObservationAt: '2026-10-01T12:00:00.000Z',
      }),
      obs({
        observationId: 's2',
        restSessionId: 'sess-2',
        voltageV: 12.55,
        providerObservationAt: '2026-10-02T08:00:00.000Z',
      }),
    ]);
    expect(reps).toHaveLength(2);
    expect(reps.find((r) => r.restSessionId === 'sess-1')?.observationId).toBe('s1b');
  });

  it('never treats REST_WAKE alone as validated startability', () => {
    const result = evaluateStartabilityV1({
      observations: [
        obs({
          observationId: 'wake',
          evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
          restSessionId: 'sess-1',
          actualRestAgeHours: 0.1,
        }),
      ],
      crankEvidence: null,
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('STARTABILITY_GE_SEQUENCE_NOT_CRANK_PROOF');
  });

  it('does not accept GE REST+WAKE+ENGINE_OFF sequence without crank evidence (P1.1)', () => {
    const result = evaluateStartabilityV1({
      observations: [
        obs({
          observationId: 'pre',
          restSessionId: 'sess-1',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          providerObservationAt: '2026-10-01T08:00:00.000Z',
          actualRestAgeHours: 4,
        }),
        obs({
          observationId: 'wake',
          restSessionId: 'sess-1',
          evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
          providerObservationAt: '2026-10-01T08:05:00.000Z',
          actualRestAgeHours: 4,
        }),
        obs({
          observationId: 'load',
          restSessionId: 'sess-1',
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          providerObservationAt: '2026-10-01T08:06:00.000Z',
          operationalContext: 'DRIVING',
          engineRunning: true,
        }),
      ],
      crankEvidence: null,
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('STARTABILITY_GE_SEQUENCE_NOT_CRANK_PROOF');
    expect(result.reasonCodes).not.toContain('STARTABILITY_CRANK_EVIDENCE_VALIDATED');
  });
});
