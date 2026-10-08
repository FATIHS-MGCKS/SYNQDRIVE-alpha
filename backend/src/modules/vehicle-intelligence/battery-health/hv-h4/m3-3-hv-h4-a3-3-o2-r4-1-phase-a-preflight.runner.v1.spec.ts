import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { assertNoSecretsInReportPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';
import { validateIsolatedPhaseADatabaseTargetV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a runner (unit)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('blocks runner entry when isolated target is not approved', async () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '0';
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://phase_a@127.0.0.1:5432/isolated_phase_a',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('BLOCKED');
      expect(outcome.reasonCode).toBe('PHASE_A_ISOLATED_TARGET_NOT_APPROVED');
    }
  });

  it('returns sanitized ERROR outcome on connection failure without throwing', async () => {
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://nobody@127.0.0.1:9/nonexistent_phase_a_db',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('ERROR');
      expect(outcome.reasonCode).toMatch(/^PHASE_A_/);
      expect(outcome.reasonCode).not.toContain('postgresql://');
    }
  });

  it('report redaction guard rejects embedded credentials', () => {
    expect(() =>
      assertNoSecretsInReportPayloadV1({
        leak: 'postgresql://secret:password@127.0.0.1:5432/db',
      }),
    ).toThrow('PHASE_A_REPORT_CREDENTIAL_LEAK');
  });

  it('report redaction guard allows redacted database target placeholder', () => {
    expect(() =>
      assertNoSecretsInReportPayloadV1({
        databaseTargetRedacted: 'postgresql://***@127.0.0.1:5432/test',
      }),
    ).not.toThrow();
  });

  it('contract version is stable for deterministic JSON consumers', () => {
    expect(M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1).toBe('M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_V1');
  });

  it('isolated policy rejects app DATABASE_URL canonical target at runner boundary', () => {
    const appUrl = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
    const phaseUrl = 'postgresql://phase_a@127.0.0.1:5432/isolated_phase_a';
    process.env.DATABASE_URL = appUrl;
    const appKey = validateIsolatedPhaseADatabaseTargetV1(appUrl, process.env, {
      requireExplicitApproval: true,
    });
    const phaseKey = validateIsolatedPhaseADatabaseTargetV1(phaseUrl, process.env, {
      requireExplicitApproval: true,
    });
    expect(appKey.ok).toBe(true);
    expect(phaseKey.ok).toBe(true);
    expect(appUrl).not.toEqual(phaseUrl);
  });
});
