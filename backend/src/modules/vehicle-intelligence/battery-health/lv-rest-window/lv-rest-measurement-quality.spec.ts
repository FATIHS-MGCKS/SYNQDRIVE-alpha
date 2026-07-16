import { BatteryMeasurementQuality } from '@prisma/client';
import { REST_60M_QUALITY_WINDOW_MS } from './battery-rest-target-evaluation';
import {
  classifyLvRestObservationQuality,
  classifyLvRestSessionOutcome,
  evaluateClassifiedRestTargetOutcome,
  isLvRestMeasurementEvidenceEligible,
  isLvRestMeasurementPublicationEligible,
} from './lv-rest-measurement-quality';
import type { RestTargetObservationCandidate } from './battery-rest-target-evaluation';

const TARGET = new Date('2026-07-16T11:00:00.000Z');
const RETRY_GRACE_MS = 30 * 60_000;

function policy() {
  return {
    targetAt: TARGET,
    windowBeforeMs: REST_60M_QUALITY_WINDOW_MS,
    windowAfterMs: REST_60M_QUALITY_WINDOW_MS,
    wakeVoltageThreshold: 13.8,
    maxRestingVoltage: 13.2,
    chargingVoltageThreshold: 13.25,
    restRequiresEngineOff: true,
  };
}

function candidate(
  id: string,
  observedAt: Date,
  numericValue: number,
  overrides: Record<string, unknown> = {},
): RestTargetObservationCandidate {
  return {
    measurementId: id,
    observedAt,
    numericValue,
    providerTimestamp: observedAt,
    context: {
      speedKmh: 0,
      ignitionOn: false,
      engineRunning: false,
      hasActiveTrip: false,
      isLvCharging: false,
      isHvCharging: false,
      providerObservationOutcome: 'NEW_OBSERVATION',
      ...overrides,
    },
  };
}

describe('lv-rest-measurement-quality', () => {
  it('classifies VALID rest observation', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('valid', TARGET, 12.41),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.VALID);
    expect(result.reasonCode).toBe('valid_rest_observation');
    expect(result.evidenceEligible).toBe(true);
    expect(result.publicationEligible).toBe(false);
  });

  it('classifies VALID_PROXY outside strict window', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate(
        'proxy',
        new Date(TARGET.getTime() + 20 * 60_000),
        12.4,
      ),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.VALID_PROXY);
    expect(result.reasonCode).toBe('valid_proxy_outside_strict_window');
    expect(result.evidenceEligible).toBe(true);
  });

  it('classifies VALID_PROXY for elevated voltage without contam context', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('suspicion', TARGET, 13.25),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.VALID_PROXY);
    expect(result.reasonCode).toBe('valid_proxy_voltage_suspicion');
  });

  it('classifies CONTAMINATED_BY_CHARGING with charging context', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('charging', TARGET, 13.3, { isHvCharging: true }),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING);
    expect(result.evidenceEligible).toBe(false);
  });

  it('does not classify charging contamination from voltage alone', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('high-v', TARGET, 13.4),
      policy: policy(),
    });
    expect(result.quality).not.toBe(BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING);
  });

  it('classifies CONTAMINATED_BY_WAKE with wake flank context', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('wake', TARGET, 14.1, { ignitionOn: true }),
      policy: policy(),
      wakeFlankIds: new Set(['wake']),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.CONTAMINATED_BY_WAKE);
    expect(result.evidenceEligible).toBe(false);
  });

  it('classifies CONTAMINATED_BY_ACTIVE_TRIP', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('trip', TARGET, 12.4, { hasActiveTrip: true }),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP);
  });

  it('classifies STALE provider replay', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('stale', TARGET, 12.4, {
        providerObservationOutcome: 'STALE_REPLAY',
      }),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.STALE);
    expect(result.reasonCode).toBe('stale_provider_replay');
  });

  it('classifies TIMESTAMP_INCONSISTENT', () => {
    const result = classifyLvRestObservationQuality({
      candidate: {
        ...candidate('ts', TARGET, 12.4),
        providerTimestamp: new Date(TARGET.getTime() - 10 * 60_000),
      },
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT);
  });

  it('classifies MISSING_CONTEXT when speed is unknown', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('ctx', TARGET, 12.4, { speedKmh: null }),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.MISSING_CONTEXT);
    expect(result.reasonLabel).toContain('Ruhekontext');
  });

  it('classifies session MISSED outcome', () => {
    const result = classifyLvRestSessionOutcome({ missed: true });
    expect(result.quality).toBe(BatteryMeasurementQuality.MISSED);
    expect(result.reasonCode).toBe('missed_no_valid_observation');
  });

  it('classifies session PROVIDER_DELAY outcome', () => {
    const result = classifyLvRestSessionOutcome({ retryable: true });
    expect(result.quality).toBe(BatteryMeasurementQuality.PROVIDER_DELAY);
    expect(result.reasonCode).toBe('provider_delay_pending');
  });

  it('classifies PROVIDER_ERROR', () => {
    const result = classifyLvRestObservationQuality({
      candidate: candidate('err', TARGET, 12.4, { providerError: true }),
      policy: policy(),
    });
    expect(result.quality).toBe(BatteryMeasurementQuality.PROVIDER_ERROR);
  });

  it('classifies session UNSUPPORTED_PROFILE outcome', () => {
    const result = classifyLvRestSessionOutcome({ unsupportedProfile: true });
    expect(result.quality).toBe(BatteryMeasurementQuality.UNSUPPORTED_PROFILE);
  });

  it('never allows publication for rest qualities', () => {
    expect(isLvRestMeasurementPublicationEligible()).toBe(false);
  });

  it('allows evidence only for VALID and VALID_PROXY', () => {
    expect(isLvRestMeasurementEvidenceEligible(BatteryMeasurementQuality.VALID)).toBe(
      true,
    );
    expect(
      isLvRestMeasurementEvidenceEligible(BatteryMeasurementQuality.VALID_PROXY),
    ).toBe(true);
    expect(
      isLvRestMeasurementEvidenceEligible(
        BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
      ),
    ).toBe(false);
  });

  it('evaluateClassifiedRestTargetOutcome retries before MISSED', () => {
    const outcome = evaluateClassifiedRestTargetOutcome({
      candidates: [],
      policy: policy(),
      now: new Date(TARGET.getTime() + REST_60M_QUALITY_WINDOW_MS + 5 * 60_000),
      retryGraceMs: RETRY_GRACE_MS,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.retryable).toBe(true);
      expect(outcome.sessionQuality).toBe(BatteryMeasurementQuality.PROVIDER_DELAY);
    }
  });

  it('evaluateClassifiedRestTargetOutcome persists contaminated after retry', () => {
    const outcome = evaluateClassifiedRestTargetOutcome({
      candidates: [
        candidate('charging', TARGET, 13.35, { isHvCharging: true }),
      ],
      policy: policy(),
      now: new Date(
        TARGET.getTime() + REST_60M_QUALITY_WINDOW_MS + RETRY_GRACE_MS + 1_000,
      ),
      retryGraceMs: RETRY_GRACE_MS,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.quality).toBe(BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING);
      expect(outcome.evidenceEligible).toBe(false);
    }
  });
});
