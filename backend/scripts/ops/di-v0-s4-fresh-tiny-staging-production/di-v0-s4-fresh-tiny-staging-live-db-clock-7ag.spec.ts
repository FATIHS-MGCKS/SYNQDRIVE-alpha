import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  deriveInternallyComputedFreshFingerprint,
  readFreshAuthorityFromProcessEnv,
  validateFreshAuthority,
} from './di-v0-s4-fresh-tiny-staging-production.lib';
import { assertFreshAuthorityAgeWithinWindow } from './di-v0-s4-fresh-tiny-staging-authority';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  evaluateDiV0S4RuntimeConfigAttestation,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { formatDiV0S4RuntimeConfigAttestationMetricLine } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.metrics';

const WRAPPER = path.join(__dirname, '../di-v0-s4-stage-tiny-fresh-production.sh');
const LIVE_LIB = path.join(__dirname, '../lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh');
const PROD_LIB = path.join(__dirname, '../lib/di-v0-s4-fresh-tiny-staging-production.lib.sh');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const CANONICAL_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const CANONICAL_VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const TOOL_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const NB = '2026-10-08T14:49:49.835Z';
const FP = deriveInternallyComputedFreshFingerprint(NB, CANONICAL_ORG, CANONICAL_VEH);

function metricsFileForEnv(env: Record<string, string | undefined>): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation(env);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ag-m-')), 'metrics.txt');
  fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
  return file;
}

function baseHarnessEnv(extra: Record<string, string> = {}): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ag-'));
  const envFile = path.join(dir, 'backend.env');
  const envContent = 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
  fs.writeFileSync(envFile, envContent, 'utf8');
  const envSha = createHash('sha256').update(envContent).digest('hex');
  const requiredSha = execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const releaseId = path.basename(WORKSPACE_ROOT);
  const dbClock = extra.DI_S4F7V_DB_CLOCK_CANONICAL_UTC ?? '2026-10-08T14:50:06.788Z';
  const prestate = metricsFileForEnv({});
  const stagedEnv: Record<string, string | undefined> = {
    DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: NB,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
  };
  const freshA = metricsFileForEnv(stagedEnv);
  const freshB = metricsFileForEnv(stagedEnv);
  return {
    DRY_RUN: '0',
    DI_S4F7Y_ENGINEERING_TEST_HARNESS: 'YES',
    DI_S4F7V_FIXTURE_MODE: '1',
    DI_S4F7V_TEST_MODE: '1',
    SYNQDRIVE_DEPLOY_STATE_DIR: path.join(dir, 'deploy-state'),
    SYNQDRIVE_BACKEND_ENV: envFile,
    SYNQDRIVE_CURRENT_LINK: WORKSPACE_ROOT,
    DI_S4_TINY_STAGING_ACK: 'YES',
    DI_S4F7Y_LIVE_STAGING_AUTHORIZED: 'YES',
    DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
    DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
    DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
    DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
    DI_S4_TINY_FRESH_NOT_BEFORE: NB,
    DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: FP,
    DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
    DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: CANONICAL_VEH,
    DI_S4F7V_DB_CLOCK_CANONICAL_UTC: dbClock,
    EXPECTED_FRESH_TINY_STAGING_TOOL_SHA: TOOL_SHA,
    DI_S4F7V_TOOL_CHECKOUT_SHA: TOOL_SHA,
    AUTHORIZED_TOOL_SHA: TOOL_SHA,
    AUTHORIZED_PRODUCTION_SHA: requiredSha,
    AUTHORIZED_PRODUCTION_RELEASE_ID: releaseId,
    AUTHORIZED_PRE_ENV_SHA256: envSha,
    AUTHORIZED_FRESH_NOT_BEFORE: NB,
    AUTHORIZED_FRESH_EXPECTED_FINGERPRINT: FP,
    AUTHORIZED_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
    AUTHORIZED_VEHICLE_ALLOWLIST: CANONICAL_VEH,
    DI_S4F7V_FIXTURE_DEPLOYED_SHA: requiredSha,
    DI_S4F7V_FIXTURE_RELEASE_DIR: WORKSPACE_ROOT,
    DI_S4F7V_FIXTURE_METRICS_BODY_A: prestate,
    DI_S4F7V_FIXTURE_METRICS_BODY_B: prestate,
    DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_A: freshA,
    DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_B: freshB,
    ...extra,
  };
}

function runHarness(extra: Record<string, string> = {}): string {
  const env = baseHarnessEnv(extra);
  return execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runHarnessFail(extra: Record<string, string> = {}): string {
  try {
    runHarness(extra);
    return '';
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '');
  }
}

describe('S4F-7AG live DB clock authority', () => {
  it('A1 — empty DB clock fails fresh authority (AF1C historical class)', () => {
    const r = validateFreshAuthority(
      readFreshAuthorityFromProcessEnv({
        DI_S4_TINY_FRESH_NOT_BEFORE: NB,
        DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: FP,
        DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
        DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: CANONICAL_VEH,
        DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '',
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('FRESH_NOT_BEFORE_INVALID');
  });

  it('A2 — harness missing DB clock fails before mutation', () => {
    const out = runHarnessFail({ DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '' });
    expect(out).toContain('DB_CLOCK_EMPTY=INITIAL');
    expect(out).not.toContain('BACKUP_CREATED_BEFORE_MUTATION=YES');
    expect(out).not.toContain('LIVE_STAGING_TRANSACTION_COMMITTED=YES');
  });

  it('B1 — live lib exports initial DB clock before first validate-fresh-authority', () => {
    const sh = fs.readFileSync(LIVE_LIB, 'utf8');
    const execute = sh.slice(sh.indexOf('s4f7y_execute_live_transaction()'));
    const firstValidate = execute.indexOf('s4f7v_run_validate_fresh_authority_fail_closed INITIAL');
    const firstExport = execute.indexOf('s4f7v_export_db_clock_canonical_utc_fail_closed INITIAL');
    expect(firstExport).toBeGreaterThan(-1);
    expect(firstValidate).toBeGreaterThan(-1);
    expect(firstExport).toBeLessThan(firstValidate);
  });

  it('B2 — final pre-mutation revalidation re-queries DB clock and validates fail-closed', () => {
    const sh = fs.readFileSync(LIVE_LIB, 'utf8');
    expect(sh).toContain('s4f7v_export_db_clock_canonical_utc_fail_closed FINAL');
    expect(sh).toContain('s4f7v_run_validate_fresh_authority_fail_closed FINAL');
    expect(sh).not.toMatch(
      /FINAL_JIT_AUTHORITY_AGE_SECONDS=\$\(s4f7v_run_cli validate-fresh-authority \| awk/,
    );
  });

  it('B3 — corrected harness path reaches committed transaction (engineering)', () => {
    const out = runHarness();
    expect(out).toContain('INITIAL_DB_CLOCK_EXPORTED=YES');
    expect(out).toContain('FINAL_DB_CLOCK_CANONICAL_UTC=');
    expect(out).toContain('FINAL_JIT_AUTHORITY_AGE_SECONDS=');
    expect(out).toContain('LIVE_STAGING_TRANSACTION_COMMITTED=YES');
  });

  it('C1 — invalid DB clock format rejected at export', () => {
    let out = '';
    try {
      execFileSync(
        'bash',
        [
          '-c',
          `S4F7V_SCRIPT_DIR="${path.dirname(PROD_LIB)}" source "${PROD_LIB}"; export DI_S4F7V_FIXTURE_MODE=1 DI_S4F7V_TEST_MODE=1 DI_S4F7V_DB_CLOCK_CANONICAL_UTC='not-a-timestamp'; s4f7v_export_db_clock_canonical_utc_fail_closed INITIAL`,
        ],
        { encoding: 'utf8' },
      );
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? '');
    }
    expect(out).toContain('DB_CLOCK_INVALID_FORMAT=INITIAL');
  });

  it('C2 — JIT older than 900 seconds fails', () => {
    const oldNb = '2026-10-07T10:00:00.000Z';
    const oldFp = deriveInternallyComputedFreshFingerprint(oldNb, CANONICAL_ORG, CANONICAL_VEH);
    const age = assertFreshAuthorityAgeWithinWindow('2026-10-08T14:50:00.000Z', oldNb);
    expect(age.ok).toBe(false);
    const out = runHarnessFail({
      DI_S4_TINY_FRESH_NOT_BEFORE: oldNb,
      DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: oldFp,
      AUTHORIZED_FRESH_NOT_BEFORE: oldNb,
      AUTHORIZED_FRESH_EXPECTED_FINGERPRINT: oldFp,
    });
    expect(out).toMatch(/FRESH_AUTHORITY_FAILURES=.*FRESH_AUTHORITY_TOO_OLD|VALIDATE_FRESH_AUTHORITY_FAILED/);
  });

  it('C3 — JIT in future relative to DB clock fails', () => {
    const futureNb = '2026-10-08T16:00:00.000Z';
    const futureFp = deriveInternallyComputedFreshFingerprint(futureNb, CANONICAL_ORG, CANONICAL_VEH);
    const out = runHarnessFail({
      DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '2026-10-08T14:50:00.000Z',
      DI_S4_TINY_FRESH_NOT_BEFORE: futureNb,
      DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: futureFp,
      AUTHORIZED_FRESH_NOT_BEFORE: futureNb,
      AUTHORIZED_FRESH_EXPECTED_FINGERPRINT: futureFp,
    });
    expect(out).toMatch(/FRESH_AUTHORITY_FUTURE|FRESH_NOT_BEFORE_INVALID|VALIDATE_FRESH_AUTHORITY_FAILED/);
  });

  it('C4 — fingerprint mismatch fails before backup', () => {
    const out = runHarnessFail({ DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: 'f'.repeat(64) });
    expect(out).toMatch(/FRESH_FINGERPRINT_MISMATCH|VALIDATE_FRESH_AUTHORITY_FAILED/);
    expect(out).not.toContain('BACKUP_CREATED_BEFORE_MUTATION=YES');
  });

  it('C5 — production SHA pin mismatch fails', () => {
    const out = runHarnessFail({ DI_S4_TINY_STAGING_REQUIRED_SHA: 'd'.repeat(40) });
    expect(out).toContain('PRODUCTION_SHA_PIN=FAIL');
    expect(out).not.toContain('BACKUP_CREATED_BEFORE_MUTATION=YES');
  });

  it('C6 — NO_BACKFILL final gate failure fails closed', () => {
    const out = runHarnessFail({
      DI_S4F7Y_FIXTURE_FUTURE_TRIP_COUNT: '1',
    });
    expect(out).toContain('NO_BACKFILL_FINAL_GATE=FAIL');
    expect(out).not.toContain('BACKUP_CREATED_BEFORE_MUTATION=YES');
  });

  it('C7 — initial validate CLI failure propagates (inject via bad allowlist)', () => {
    const out = runHarnessFail({ DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: 'not-a-uuid' });
    expect(out).toMatch(/VALIDATE_FRESH_AUTHORITY_FAILED=INITIAL|FRESH_VEHICLE_INVALID/);
  });

  it('D1 — no authorization synthesis in live lib', () => {
    const sh = fs.readFileSync(LIVE_LIB, 'utf8');
    expect(sh).not.toMatch(/export DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES/);
  });
});
