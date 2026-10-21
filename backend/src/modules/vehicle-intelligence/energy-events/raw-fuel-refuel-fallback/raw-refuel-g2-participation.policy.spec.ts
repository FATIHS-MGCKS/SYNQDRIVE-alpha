import {
  evaluateFallbackG2Participation,
  canFallbackEventParticipateInG2Reconciliation,
  filterAuthorizedRefuelCandidates,
} from './raw-refuel-g2-participation.policy';
import {
  RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';

describe('raw-refuel-g2-participation.policy', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  function authorizeAll(): void {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
    process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV] = 'true';
  }

  it('allows native/null detection sources regardless of handoff authority', () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    expect(canFallbackEventParticipateInG2Reconciliation({ detectionSource: null })).toBe(true);
    expect(canFallbackEventParticipateInG2Reconciliation({ detectionSource: 'DIMO_NATIVE' })).toBe(
      true,
    );
  });

  it('blocks fallback source when handoff authority is off', () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    const decision = evaluateFallbackG2Participation({
      detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
    });
    expect(decision.participate).toBe(false);
    if (!decision.participate) {
      expect(decision.reason).toBe('fallback_handoff_not_authorized');
    }
  });

  it('allows fallback source when full authority conjunction is true', () => {
    authorizeAll();
    expect(
      canFallbackEventParticipateInG2Reconciliation({
        detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
      }),
    ).toBe(true);
  });

  it('filters unauthorized fallback candidates from native-triggered scans', () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    const filtered = filterAuthorizedRefuelCandidates([
      { detectionSource: 'DIMO_NATIVE' },
      { detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.detectionSource).toBe('DIMO_NATIVE');
  });
});
