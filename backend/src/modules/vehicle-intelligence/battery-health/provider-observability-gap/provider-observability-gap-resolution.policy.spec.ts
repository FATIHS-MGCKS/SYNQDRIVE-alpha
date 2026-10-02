import { BatteryGeneralizedEvidenceClass, BatteryProviderObservabilityGapStatus } from '@prisma/client';
import { resolveProviderGapFromEvidenceClass } from './provider-observability-gap-resolution.policy';

describe('provider observability gap resolution policy', () => {
  it('E: GAP -> OFF at trustworthy ENGINE_OFF only', () => {
    const d = resolveProviderGapFromEvidenceClass(
      BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    );
    expect(d).toEqual({
      action: 'resolve',
      status: BatteryProviderObservabilityGapStatus.RESOLVED_OFF,
    });
  });

  it('F: GAP -> RUNNING without ENGINE_OFF', () => {
    const d = resolveProviderGapFromEvidenceClass(
      BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
    );
    expect(d).toEqual({
      action: 'resolve',
      status: BatteryProviderObservabilityGapStatus.RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF,
    });
  });

  it('G: ambiguous resolves without fabricated OFF', () => {
    const d = resolveProviderGapFromEvidenceClass(
      BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
    );
    expect(d.action).toBe('resolve');
    if (d.action === 'resolve') {
      expect(d.status).toBe(BatteryProviderObservabilityGapStatus.RESOLVED_AMBIGUOUS);
    }
  });

  it('H: stale replay on fresh path remains OPEN', () => {
    expect(
      resolveProviderGapFromEvidenceClass(BatteryGeneralizedEvidenceClass.STALE_REPLAY),
    ).toEqual({ action: 'remain_open' });
  });
});
