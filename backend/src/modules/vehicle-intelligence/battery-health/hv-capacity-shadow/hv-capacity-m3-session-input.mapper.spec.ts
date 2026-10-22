import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { mapSessionToM3Input, mapSessionToQualityAssessment } from '../hv-measurement-quality/hv-measurement-quality.policy';
import { evaluateHvM3SessionGate } from './hv-capacity-m3.policy';
import { mapHvChargeSessionRowToM3Input } from './hv-capacity-m3-session-input.mapper';
import { HV_M3_GATE_REASONS } from './hv-capacity-m3.types';

describe('hv-capacity-m3-session-input.mapper (P1-3)', () => {
  const sessionRow = {
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: false,
    startAt: new Date('2026-10-17T19:00:00.000Z'),
    endAt: new Date('2026-10-17T21:00:00.000Z'),
    startSocPercent: 30,
    endSocPercent: 80,
    startEnergyKwh: 21,
    endEnergyKwh: 57,
    energyAddedKwh: 36,
    deltaSocPercent: 50,
  };

  const metadata = {
    providerSegmentFingerprint: 'fp',
    durationSeconds: 7200,
    lastReconciledAt: '2026-10-17T21:00:00.000Z',
    reconcileVersion: 1,
    capacityValidationEligible: true,
    qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
    segmentAddedEnergyMinKwh: 5,
    segmentAddedEnergyMaxKwh: 36,
  };

  it('rejects ADDED_ENERGY_RESET consistently on service and read mappers (FABLE D2)', () => {
    const serviceInput = mapHvChargeSessionRowToM3Input(sessionRow, metadata);
    const mqRow = {
      ...sessionRow,
      sessionId: 'session-d2',
      measurementQuality: 'SHADOW' as const,
      metadata,
    };
    const quality = mapSessionToQualityAssessment(mqRow);
    const policyInput = mapSessionToM3Input(mqRow, quality);

    const serviceGate = evaluateHvM3SessionGate(serviceInput);
    const policyGate = evaluateHvM3SessionGate(policyInput);

    expect(serviceGate.eligible).toBe(false);
    expect(policyGate.eligible).toBe(false);
    expect(serviceGate.reasonCodes).toContain(HV_M3_GATE_REASONS.ADDED_ENERGY_RESET);
    expect(policyGate.reasonCodes).toContain(HV_M3_GATE_REASONS.ADDED_ENERGY_RESET);
  });
});
