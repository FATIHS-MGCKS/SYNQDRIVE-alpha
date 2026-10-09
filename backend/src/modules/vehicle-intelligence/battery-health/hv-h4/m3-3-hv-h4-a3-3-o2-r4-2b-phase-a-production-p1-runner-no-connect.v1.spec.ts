import { join } from 'node:path';
import { rmSync } from 'node:fs';
import * as phaseAPreflightRunner from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import * as phaseAProductionConsumptionStore from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { parseM3_3HvH4A3PhaseAProductionPreflightConfigFromEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-config.v1';
import { PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';

describe('Phase-A P1 NO_GO blocks production connect (R4.2B-P1A-H2)', () => {
  const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
  const consumeSpy = jest.spyOn(phaseAProductionConsumptionStore, 'markPhaseAProductionApprovalConsumedAtomicV1');

  afterEach(() => {
    prismaSpy.mockClear();
    consumeSpy.mockClear();
  });

  it('blocks runner and config parser before Prisma when contracts are otherwise valid', async () => {
    const consumptionDir = join(process.cwd(), `.phase-a-p1-no-connect-${Date.now()}`);
    const env = buildPhaseAProductionP1IntegrationEnvV1({
      productionDatabaseUrl: DB_URL,
      consumptionDir,
    });
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) prev[k] = process.env[k];
    Object.assign(process.env, env);
    delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];

    try {
      const parsed = parseM3_3HvH4A3PhaseAProductionPreflightConfigFromEnvV1(process.env);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.reasonCode).toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
      }

      const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
        databaseUrl: DB_URL,
        roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
        admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.status).toBe('BLOCKED');
        expect(outcome.reasonCode).toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
      }

      expect(prismaSpy).not.toHaveBeenCalled();
      expect(consumeSpy).not.toHaveBeenCalled();
    } finally {
      for (const k of Object.keys(env)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      rmSync(consumptionDir, { recursive: true, force: true });
    }
  });

  it('preserves isolated R4.1 path without P1 production gate', async () => {
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://u:p@127.0.0.1:5432/db',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
      admissionPolicy: 'ISOLATED_R4_1_DEFAULT',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reasonCode).not.toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
    }
    expect(prismaSpy).not.toHaveBeenCalled();
  });
});
