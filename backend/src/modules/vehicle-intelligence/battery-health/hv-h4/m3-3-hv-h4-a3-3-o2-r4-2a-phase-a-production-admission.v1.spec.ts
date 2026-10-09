import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV,
  productionEnabledWithoutExecuteAckWouldAuthorizeV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';

const DB_URL =
  'postgresql://audit_ro@127.0.0.1:5432/synqdrive_test?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const key = canonicalPostgresTargetKeyV1(DB_URL)!;
  const record = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
    approvalId: 'apr-test-001',
    changeTicket: 'CHG-TEST-001',
    approvingAuthority: 'security-officer@example.com',
    approvedTargetKey: key,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    executeNonce: 'nonce-test-abc',
    authenticationKind: 'DOCUMENTED_HUMAN_APPROVAL' as const,
  };
  const spec = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
    hostname: '127.0.0.1',
    port: 5432,
    database: 'synqdrive_test',
    expectedAuditLogin: 'audit_ro',
    forbidSuperuserSession: true,
  };
  const dir = join(process.cwd(), `.phase-a-admission-store-${Date.now()}`);
  provisionPhaseAProductionConsumptionStoreFixtureV1(dir);
  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV]: record.approvalId,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV]: record.executeNonce,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]: JSON.stringify(record),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify(spec),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]: dir,
    ...overrides,
    __consumptionDir: dir,
  } as NodeJS.ProcessEnv;
}

describe('evaluatePhaseAPreflightProductionAdmissionV1', () => {
  it('default denies without enabled + execute ack', () => {
    expect(productionEnabledWithoutExecuteAckWouldAuthorizeV1({})).toBe(false);
    expect(
      evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV]: '1',
      }).ok,
    ).toBe(false);
  });

  it('rejects missing verify-full TLS URL', () => {
    const env = baseEnv();
    const result = evaluatePhaseAPreflightProductionAdmissionV1(
      'postgresql://audit_ro@127.0.0.1:5432/synqdrive_test',
      env,
      { consumeApproval: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects integration harness for production', () => {
    const env = baseEnv({ [M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV]: '1' });
    const result = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_INTEGRATION_HARNESS_FORBIDDEN');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects reversed validity window', () => {
    const env = baseEnv();
    const record = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] as string);
    record.validFrom = new Date(Date.now() + 3600_000).toISOString();
    record.validUntil = new Date(Date.now() - 1000).toISOString();
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] = JSON.stringify(record);
    const result = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_APPROVAL_VALIDITY_REVERSED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects approval lifetime exceeding maximum', () => {
    const env = baseEnv();
    const record = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] as string);
    record.validFrom = new Date(Date.now() - 1000).toISOString();
    record.validUntil = new Date(Date.now() + 100 * 3600_000).toISOString();
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] = JSON.stringify(record);
    const result = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_APPROVAL_LIFETIME_EXCEEDED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects expired approval', () => {
    const env = baseEnv();
    const record = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] as string);
    record.validUntil = new Date(Date.now() - 1000).toISOString();
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV] = JSON.stringify(record);
    const result = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, {
      consumeApproval: false,
      now: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_APPROVAL_EXPIRED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects credential reuse', () => {
    const env = baseEnv();
    const result = evaluatePhaseAPreflightProductionAdmissionV1(
      DB_URL,
      { ...env, DATABASE_URL: DB_URL },
      { consumeApproval: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_CANNOT_REUSE_DATABASE_URL');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('consumes one-time approval and blocks replay', () => {
    const env = baseEnv();
    const first = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: true });
    expect(first.ok).toBe(true);
    const second = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: false });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reasonCode).toBe('PHASE_A_PRODUCTION_APPROVAL_ALREADY_CONSUMED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects when declared production host does not match connection URL', () => {
    const env = baseEnv();
    const spec = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV] as string);
    spec.hostname = 'db.production.example';
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV] = JSON.stringify(spec);
    const result = evaluatePhaseAPreflightProductionAdmissionV1(DB_URL, env, { consumeApproval: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_TARGET_HOST_MISMATCH');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });
});
