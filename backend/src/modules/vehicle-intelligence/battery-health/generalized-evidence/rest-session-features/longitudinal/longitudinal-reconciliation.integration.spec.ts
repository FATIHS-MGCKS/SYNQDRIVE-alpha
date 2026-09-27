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
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import { LongitudinalReconciliationCandidateRepository } from './longitudinal-reconciliation-candidate.repository';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `F4.1 ${label} ${suffix}`,
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
    computedAt?: Date;
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
      chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
      numberOfValidRestPoints: 2,
      computedAt: input.computedAt ?? new Date(),
    },
  });
}

(LIVE ? describe : describe.skip)(
  'longitudinal reconciliation PostgreSQL (F4.1)',
  () => {
    let prisma: PrismaClient;
    let reader: LongitudinalInputReaderService;
    let materialization: LongitudinalProfileMaterializationService;
    let candidates: LongitudinalReconciliationCandidateRepository;
    let dbOk = false;
    const sessionLimit = 10;

    beforeAll(async () => {
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      const prismaService = prisma as unknown as PrismaService;
      reader = new LongitudinalInputReaderService(prismaService);
      const materializationRepo = new LongitudinalProfileMaterializationRepository(prismaService);
      materialization = new LongitudinalProfileMaterializationService(
        reader,
        materializationRepo,
      );
      candidates = new LongitudinalReconciliationCandidateRepository(
        prismaService,
        materializationRepo,
      );
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it('lost-update race — concurrent C3 append cannot be lost', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'RACE');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-01T08:00:00.000Z'),
        sessionStatus: BatteryRestSessionStatus.ENDED,
        endReason: BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
      });
      const summaryA = buildMinimalLongitudinalInputSummary({
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
        inputSummary: summaryA,
        computedAt: new Date('2026-05-01T09:00:00.000Z'),
      });

      const before = await candidates.findCandidates({ batchSize: 5, sessionLimit });
      expect(before.some((c) => c.vehicleId === vehicleId)).toBe(true);

      const inventoryA = await reader.readInventory({
        organizationId,
        vehicleId,
        sessionLimit,
      });
      expect(inventoryA.status).toBe('OK');
      if (inventoryA.status !== 'OK') return;

      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summaryA,
        computedAt: new Date('2026-05-01T10:00:00.000Z'),
      });

      const frozenReader = {
        readInventory: jest.fn().mockResolvedValue(inventoryA),
      } as unknown as LongitudinalInputReaderService;
      const materializationRepo = new LongitudinalProfileMaterializationRepository(
        prisma as unknown as PrismaService,
      );
      const frozenMaterialization = new LongitudinalProfileMaterializationService(
        frozenReader,
        materializationRepo,
      );
      const outcome = await frozenMaterialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(outcome.outcome === 'CREATED' || outcome.outcome === 'EXISTING').toBe(true);

      const after = await candidates.findCandidates({ batchSize: 5, sessionLimit });
      expect(after.some((c) => c.vehicleId === vehicleId)).toBe(true);

      const fresh = await materialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(fresh.outcome === 'CREATED' || fresh.outcome === 'EXISTING').toBe(true);

      const settled = await candidates.findCandidates({ batchSize: 5, sessionLimit });
      expect(settled.some((c) => c.vehicleId === vehicleId)).toBe(false);
    });

    it('INVALIDATED C3 trust marks vehicle stale again', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'INV');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-02T08:00:00.000Z'),
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
        semanticRevision: 1,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
      });
      await materialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(false);

      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
        inputSummary: summary,
      });
      await prisma.batteryRestSession.update({
        where: { id: session.id },
        data: {
          sessionStatus: BatteryRestSessionStatus.INVALIDATED,
          endReason: BatteryRestSessionEndReason.INVALIDATED,
        },
      });

      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(true);
    });
  },
);
