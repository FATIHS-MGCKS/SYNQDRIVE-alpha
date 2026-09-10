/**
 * EXP-021 — settlement-shadow abort terminalization PostgreSQL integration.
 * Proves terminalizeAbortedSessionInTransaction uses interactive transaction client.
 */
import { randomUUID } from 'crypto';
import { PrismaClient, ReferenceCaptureSessionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import {
  REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS,
} from './reference-capture-settlement-shadow.constants';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from './testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

async function probeSettlementShadowPostgresTables(client: PrismaClient): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'reference_capture_settlement_shadow_experiments'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

(LIVE ? describe : describe.skip)(
  'Reference Capture settlement-shadow abort PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let repository: ReferenceCaptureSettlementShadowRepository;
    let integrationReady = false;

    beforeAll(async () => {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL ?? buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error(
          'REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres with reference_capture tables',
        );
      }
      prisma = new PrismaClient();
      integrationReady = await probeSettlementShadowPostgresTables(prisma);
      repository = new ReferenceCaptureSettlementShadowRepository(prisma as PrismaService);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('ABORT_DB_TERMINALIZATION_ATOMIC: interactive transaction commits all state changes', async function () {
      if (!integrationReady) {
        this.skip();
      }
      const suffix = randomUUID().slice(0, 8);
      const organizationId = randomUUID();
      const vehicleId = randomUUID();
      const sessionId = randomUUID();
      const experimentDbId = randomUUID();
      const scheduleId = randomUUID();

      const vin = `RC${suffix.replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);
      await prisma.$executeRaw`
        INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
        VALUES (${organizationId}, ${`RC Abort IT Org ${suffix}`}, 'FLEET', NOW(), NOW())
      `;
      await prisma.$executeRaw`
        INSERT INTO vehicles (
          id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
        )
        VALUES (
          ${vehicleId}, ${organizationId}, ${vin}, 'Test', 'RC', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW()
        )
      `;
      await prisma.referenceCaptureSession.create({
        data: {
          id: sessionId,
          organizationId,
          vehicleId,
          status: ReferenceCaptureSessionStatus.ABORTED,
          failureReason: 'postgres_abort_integration',
          manifestVersion: '1.1.0',
          connectionProfile: 'DIMO_LTE_R1',
          manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
          recorderSoftwareVersion: '3A.1.0',
          broadObservationFieldCount: 1,
        },
      });
      await prisma.referenceCaptureSettlementShadowExperiment.create({
        data: {
          id: experimentDbId,
          experimentId: `exp-021-${suffix}`,
          sessionId,
          organizationId,
          vehicleId,
          tokenId: 187361,
          status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        },
      });
      await prisma.referenceCaptureSettlementShadowSchedule.create({
        data: {
          id: scheduleId,
          experimentId: experimentDbId,
          sessionId,
          organizationId,
          vehicleId,
          tokenId: 187361,
          probeId: 'SP-60-A',
          probeType: 'FIXED_INTERVAL',
          phase: '60s',
          sourceIntervalStart: new Date('2026-09-09T10:00:00.000Z'),
          sourceIntervalEnd: new Date('2026-09-09T10:01:00.000Z'),
          queryFrom: new Date('2026-09-09T10:00:00.000Z'),
          queryTo: new Date('2026-09-09T10:01:00.000Z'),
          scheduledAgeMs: 30_000,
          scheduledAt: new Date('2026-09-09T10:01:30.000Z'),
          idempotencyKey: `key-${suffix}`,
        },
      });

      try {
        const result = await prisma.$transaction(async (tx) =>
          repository.terminalizeAbortedSessionInTransaction(tx, {
            sessionId,
            experimentDbId,
            abortReason: 'postgres_abort_integration',
            abortedAt: new Date().toISOString(),
            organizationId,
            existingMetadata: { channel: 'SETTLEMENT_SHADOW' },
            skipReason: 'rc_session_aborted:postgres_abort_integration',
          }),
        );

        expect(result.terminalized).toBe(true);
        expect(result.schedulesSkipped).toBe(1);

        const experiment = await prisma.referenceCaptureSettlementShadowExperiment.findUnique({
          where: { id: experimentDbId },
        });
        const schedule = await prisma.referenceCaptureSettlementShadowSchedule.findUnique({
          where: { id: scheduleId },
        });
        expect(experiment?.status).toBe(REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED);
        expect(schedule?.status).toBe('SKIPPED');
      } finally {
        await prisma.referenceCaptureSettlementShadowSchedule.deleteMany({ where: { sessionId } });
        await prisma.referenceCaptureSettlementShadowExperiment.deleteMany({ where: { sessionId } });
        await prisma.referenceCaptureSession.deleteMany({ where: { id: sessionId } });
        await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
        await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
      }
    });
  },
);
