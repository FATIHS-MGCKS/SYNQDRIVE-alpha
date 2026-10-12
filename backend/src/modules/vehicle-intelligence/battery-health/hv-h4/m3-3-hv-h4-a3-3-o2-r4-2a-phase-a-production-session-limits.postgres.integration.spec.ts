import { PrismaClient } from '@prisma/client';
import {
  assertPhaseAPreflightIntegrationDatabaseReachableV1,
  isPhaseAPreflightPostgresIntegrationJobV1,
  resolvePhaseAPreflightIntegrationDatabaseUrlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.integration.harness.v1';
import { applyPhaseAProductionReadOnlySessionLimitsV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-session-limits.v1';

const integrationJobActive = isPhaseAPreflightPostgresIntegrationJobV1();

(integrationJobActive ? describe : describe.skip)(
  'Phase-A production session limits (PostgreSQL integration)',
  () => {
    let integrationDatabaseUrl: string;

    beforeAll(async () => {
      integrationDatabaseUrl = resolvePhaseAPreflightIntegrationDatabaseUrlV1();
      await assertPhaseAPreflightIntegrationDatabaseReachableV1(integrationDatabaseUrl);
    });

    it('terminates long-running statements via SET LOCAL statement_timeout', async () => {
      const client = new PrismaClient({
        datasources: { db: { url: integrationDatabaseUrl } },
      });
      try {
        await client.$connect();
        await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          const limits = await applyPhaseAProductionReadOnlySessionLimitsV1(tx);
          expect(limits.ok).toBe(true);
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '200ms'`);
          await expect(tx.$queryRawUnsafe(`SELECT pg_sleep(2)`)).rejects.toBeDefined();
        });
      } finally {
        await client.$disconnect().catch(() => undefined);
      }
    });
  },
);
