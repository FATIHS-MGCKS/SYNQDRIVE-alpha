import { randomUUID } from 'crypto';
import {
  BatteryRestSessionAnchorType,
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionEndReason,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { LongitudinalInputReaderService } from './longitudinal-input.reader';
import {
  countCandidatePhaseTrustPairs,
  LongitudinalInputRepository,
} from './longitudinal-input.repository';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_INPUT_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `D1 ${label} ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`${label}-${suffix}`.slice(0, 32)},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

async function createRestSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    anchorAt: Date;
    sessionStatus: BatteryRestSessionStatus;
    endReason?: BatteryRestSessionEndReason | null;
  },
) {
  return prisma.batteryRestSession.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
      anchorAt: input.anchorAt,
      sessionStatus: input.sessionStatus,
      endReason: input.endReason ?? null,
      openedAt: input.anchorAt,
      idempotencyKey: `rs:${randomUUID()}`,
    },
  });
}

async function createFeatureRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    restSessionId: string;
    semanticRevision: number;
    computationPhase: BatteryRestSessionFeatureComputationPhase;
    sessionTrust: BatteryRestSessionFeatureSessionTrust;
    inputSummary: Record<string, unknown>;
    chargeOpportunityClass?: BatteryRestSessionChargeOpportunityClass;
  },
) {
  const digest = `digest-${randomUUID()}-${input.semanticRevision}`;
  return prisma.batteryRestSessionFeature.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
      semanticRevision: input.semanticRevision,
      inputDigest: digest,
      inputSummary: input.inputSummary as Prisma.InputJsonValue,
      computationPhase: input.computationPhase,
      sessionTrust: input.sessionTrust,
      chargeOpportunityClass:
        input.chargeOpportunityClass ?? BatteryRestSessionChargeOpportunityClass.UNKNOWN,
      numberOfValidRestPoints: 2,
      computedAt: new Date(),
    },
  });
}

(LIVE ? describe : describe.skip)(
  'LongitudinalInputReaderService integration (BATTERY_V2_LONGITUDINAL_INPUT_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let reader: LongitudinalInputReaderService;
    let dbOk = false;

    beforeAll(async () => {
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      reader = new LongitudinalInputReaderService(prisma as unknown as PrismaService);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it('batch candidate loader returns at most 4 phase/trust pairs per session', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'BATCH');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-03-01T00:00:00.000Z'),
        sessionStatus: BatteryRestSessionStatus.ENDED,
        endReason: BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
      });
      const summary = buildMinimalLongitudinalInputSummary({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 3,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 7,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 4,
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
        inputSummary: summary,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 5,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
        inputSummary: summary,
      });
      // Noise rows with lower revisions for partitions already represented above.
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 1,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      const repo = new LongitudinalInputRepository(prisma as unknown as PrismaService);
      const candidates = await repo.listBatchCanonicalCandidateRows({
        organizationId,
        vehicleId,
        restSessionIds: [session.id],
      });
      expect(candidates).toHaveLength(4);
      expect(countCandidatePhaseTrustPairs(candidates, session.id)).toBe(4);
      expect(candidates.every((row) => row.semanticRevision === 5)).toBe(false);
      const finalValid = candidates.find(
        (row) =>
          row.computationPhase === BatteryRestSessionFeatureComputationPhase.FINAL &&
          row.sessionTrust === BatteryRestSessionFeatureSessionTrust.VALID,
      );
      expect(finalValid?.semanticRevision).toBe(7);
    });

    it('tenant isolation prevents cross-org feature leakage', async () => {
      if (!dbOk) return;
      const a = await createOrgVehicle(prisma, 'TENANT-A');
      const b = await createOrgVehicle(prisma, 'TENANT-B');
      const session = await createRestSession(prisma, {
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
        anchorAt: new Date('2026-04-01T00:00:00.000Z'),
        sessionStatus: BatteryRestSessionStatus.ENDED,
      });
      const summary = buildMinimalLongitudinalInputSummary({
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
        restSessionId: session.id,
      });
      await createFeatureRow(prisma, {
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
        restSessionId: session.id,
        semanticRevision: 1,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      const outcome = await reader.readInventory({
        organizationId: b.organizationId,
        vehicleId: b.vehicleId,
        sessionLimit: 10,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.result.sessions).toHaveLength(0);
      }
    });

    it('PG_D1_RR: repeatable-read snapshot ignores concurrent append', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'RR');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-01T00:00:00.000Z'),
        sessionStatus: BatteryRestSessionStatus.ENDED,
      });
      const summary = buildMinimalLongitudinalInputSummary({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 1,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });

      let releaseBarrier!: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });
      let paused = false;
      reader.setSnapshotHooksForTests({
        pauseAfterSessionReadInSnapshot: async () => {
          paused = true;
          await barrier;
        },
      });

      try {
        const readPromise = reader.readInventory({
          organizationId,
          vehicleId,
          sessionLimit: 5,
        });
        while (!paused) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        await createFeatureRow(prisma, {
          organizationId,
          vehicleId,
          restSessionId: session.id,
          semanticRevision: 99,
          computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          inputSummary: summary,
        });
        releaseBarrier();
        const outcome = await readPromise;
        expect(outcome.status).toBe('OK');
        if (outcome.status === 'OK') {
          const item = outcome.result.sessions.find((s) => s.restSessionId === session.id);
          expect(item?.canonical?.semanticRevision).toBe(1);
        }
      } finally {
        reader.setSnapshotHooksForTests(null);
      }
    });
  },
);
