import { aggregateRechargeShadowParityReport } from './erd-recharge-shadow-parity.aggregator';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
  type ErdRechargeShadowObservationDraft,
} from './erd-recharge-shadow-parity.types';

describe('erd-recharge-shadow-parity.aggregator', () => {
  it('S27: pending settlement excluded from settled parity denominator', () => {
    const observations: ErdRechargeShadowObservationDraft[] = [
      {
        organizationId: 'o',
        vehicleId: 'v',
        canonicalChargeSessionId: 'c1',
        legacyVehicleEnergyEventId: null,
        pairingEvidence: 'NONE',
        parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.PENDING_SETTLEMENT,
        finality: ERD_RECHARGE_SHADOW_FINALITY.PENDING_SETTLEMENT,
        canonicalProjectionSnapshot: null,
        legacyProjectionSnapshot: null,
        fieldDiff: null,
        comparisonFingerprint: 'a',
      },
      {
        organizationId: 'o',
        vehicleId: 'v',
        canonicalChargeSessionId: 'c2',
        legacyVehicleEnergyEventId: 'l1',
        pairingEvidence: 'EXACT_NATIVE_DIMO_ID',
        parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
        finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
        canonicalProjectionSnapshot: null,
        legacyProjectionSnapshot: null,
        fieldDiff: null,
        comparisonFingerprint: 'b',
      },
    ];
    const report = aggregateRechargeShadowParityReport({
      observations,
      canonicalEpisodeCount: 2,
      legacyEpisodeCount: 1,
    });
    expect(report.pendingSettlementCount).toBe(1);
    expect(report.settledParityDenominator).toBe(1);
    expect(report.settledParityNumerator).toBe(1);
    expect(report.settledParityRate).toBe(1);
  });
});
