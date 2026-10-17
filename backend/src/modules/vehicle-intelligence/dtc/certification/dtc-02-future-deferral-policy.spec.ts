import {
  DTC02_P5_MAX_EXTRA_DEFERRAL_MS,
  evaluateDtc02FutureDeferralEligibility,
  isDtc02AdaptiveDeferralEnabled,
} from './dtc-02-future-deferral-policy';

const T0 = Date.parse('2026-10-15T12:00:00Z');

describe('dtc-02-future-deferral-policy (P4 — not enabled)', () => {
  it('deferral env flag is OFF by default', () => {
    delete process.env.DTC_02_ADAPTIVE_DEFERRAL_ENABLED;
    expect(isDtc02AdaptiveDeferralEnabled()).toBe(false);
  });

  it('blocks when deferral flag would be enabled (P4 kill switch)', () => {
    const r = evaluateDtc02FutureDeferralEligibility({
      shadowPlannerEnabled: true,
      deferralFlagEnabled: true,
      webhookCapabilityProvenInProduction: true,
      webhookDeliveryReliabilityProven: true,
      hasRecentConfirmedCompleteSource: true,
      providerErrorState: 'none',
      sourceTrust: { divergences: ['ALIGNED'], blocksFutureDeferral: false, reasons: [] },
      lastSuccessfulDtcCheckAtMs: T0 - 3600_000,
      evaluatedAtMs: T0,
    });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('P4_DEFERRAL_FLAG_MUST_REMAIN_OFF');
  });

  it('blocks without production webhook reliability evidence', () => {
    const r = evaluateDtc02FutureDeferralEligibility({
      shadowPlannerEnabled: true,
      deferralFlagEnabled: false,
      webhookCapabilityProvenInProduction: false,
      webhookDeliveryReliabilityProven: false,
      hasRecentConfirmedCompleteSource: true,
      providerErrorState: 'none',
      sourceTrust: { divergences: ['ALIGNED'], blocksFutureDeferral: false, reasons: [] },
      lastSuccessfulDtcCheckAtMs: T0 - 3600_000,
      evaluatedAtMs: T0,
    });
    expect(r.eligible).toBe(false);
  });

  it('documents max extra deferral bound for P5 design review', () => {
    expect(DTC02_P5_MAX_EXTRA_DEFERRAL_MS).toBe(60 * 60_000);
  });
});
