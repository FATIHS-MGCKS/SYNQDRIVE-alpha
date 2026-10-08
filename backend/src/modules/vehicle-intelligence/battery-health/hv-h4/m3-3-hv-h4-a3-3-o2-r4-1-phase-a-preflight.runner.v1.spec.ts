import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { assertNoSecretsInReportPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a runner (unit)', () => {
  it('returns ERROR outcome on connection failure without throwing', async () => {
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://nobody@127.0.0.1:9/nonexistent_phase_a_db',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('ERROR');
      expect(outcome.reasonCode.length).toBeGreaterThan(0);
    }
  });

  it('report redaction guard rejects embedded credentials', () => {
    expect(() =>
      assertNoSecretsInReportPayloadV1({
        leak: 'postgresql://secret:password@127.0.0.1:5432/db',
      }),
    ).toThrow('PHASE_A_REPORT_CREDENTIAL_LEAK');
  });

  it('contract version is stable for deterministic JSON consumers', () => {
    expect(M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1).toBe('M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_V1');
  });
});
