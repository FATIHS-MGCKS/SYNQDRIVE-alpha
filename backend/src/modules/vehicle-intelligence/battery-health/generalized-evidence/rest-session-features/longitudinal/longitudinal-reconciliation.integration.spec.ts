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
import { LONGITUDINAL_INPUT_SNAPSHOT_ISOLATION } from './longitudinal-input.constants';
import { LongitudinalInputRepository } from './longitudinal-input.repository';
import { LongitudinalInputReaderService } from './longitudinal-input.reader';
import { computeLongitudinalSourceEvidenceFingerprint } from './longitudinal-source-evidence-fingerprint';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import { LongitudinalReconciliationCandidateRepository } from './longitudinal-reconciliation-candidate.repository';
import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTEGRATION === '1';

async function createOrg(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.organization.create({
    data: {
      companyName: `F4.1 ${label} ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
}

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const org = await createOrg(prisma, label);
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID()}`.slice(0, 17).padEnd(17, '0');
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
      ${`${label}-${randomUUID()}`.slice(0, 32)},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

async function createDeterministicFleetVehicle(
  prisma: PrismaClient,
  organizationId: string,
  index: number,
) {
  const vehicleId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const vin = `VIN${String(index).padStart(13, '0')}`.slice(0, 17);
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${organizationId}::uuid,
      ${vin},
      'Test',
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`F-${index}`.slice(0, 32)},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `;
  return vehicleId;
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

function wireLongitudinalStack(prisma: PrismaClient) {
  const prismaService = prisma as unknown as PrismaService;
  const reader = new LongitudinalInputReaderService(prismaService);
  const materializationRepo = new LongitudinalProfileMaterializationRepository(prismaService);
  const ackRepo = new LongitudinalSourceEvidenceAckRepository(prismaService);
  const materialization = new LongitudinalProfileMaterializationService(
    reader,
    materializationRepo,
    ackRepo,
  );
  const candidates = new LongitudinalReconciliationCandidateRepository(
    prismaService,
    ackRepo,
  );
  return { reader, materialization, candidates, ackRepo };
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
      const wired = wireLongitudinalStack(prisma);
      reader = wired.reader;
      materialization = wired.materialization;
      candidates = wired.candidates;
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

      const prismaService = prisma as unknown as PrismaService;
      const ackRepo = new LongitudinalSourceEvidenceAckRepository(prismaService);
      const frozenReader = {
        readInventory: jest.fn().mockResolvedValue(inventoryA),
      } as unknown as LongitudinalInputReaderService;
      const materializationRepo = new LongitudinalProfileMaterializationRepository(prismaService);
      const frozenMaterialization = new LongitudinalProfileMaterializationService(
        frozenReader,
        materializationRepo,
        ackRepo,
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

    it('same science / new source evidence — EXISTING settles without metadata drift', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'SAME-SCI');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-03T08:00:00.000Z'),
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
        computedAt: new Date('2026-05-03T09:00:00.000Z'),
      });

      const first = await materialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(first.outcome).toBe('CREATED');

      await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        inputSummary: summary,
        computedAt: new Date('2026-05-03T10:00:00.000Z'),
      });

      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(true);

      const second = await materialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(second.outcome).toBe('EXISTING');

      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(false);
    });

    it('fleet beyond oversample prefix — stale vehicle eventually selected', async () => {
      if (!dbOk) return;
      const org = await createOrg(prisma, 'STARVE');
      const settledCount = 50;
      const staleIndex = settledCount + 1;
      for (let i = 1; i <= staleIndex; i += 1) {
        const vehicleId = await createDeterministicFleetVehicle(prisma, org.id, i);
        const session = await createRestSession(prisma, {
          organizationId: org.id,
          vehicleId,
          anchorAt: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
          sessionStatus: BatteryRestSessionStatus.ENDED,
          endReason: BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
        });
        const summary = buildMinimalLongitudinalInputSummary({
          organizationId: org.id,
          vehicleId,
          restSessionId: session.id,
        });
        await createFeatureRow(prisma, {
          organizationId: org.id,
          vehicleId,
          restSessionId: session.id,
          semanticRevision: 1,
          computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          inputSummary: summary,
        });
        if (i <= settledCount) {
          await materialization.materialize({
            organizationId: org.id,
            vehicleId,
            sessionLimit,
            profileGeneratedAt: new Date().toISOString(),
          });
        }
      }

      const staleVehicleId = await createDeterministicFleetVehicle(prisma, org.id, staleIndex);
      const firstPass = await candidates.findCandidates({ batchSize: 1, sessionLimit });
      expect(firstPass.some((c) => c.vehicleId === staleVehicleId)).toBe(false);

      let found = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const batch = await candidates.findCandidates({ batchSize: 1, sessionLimit });
        if (batch.some((c) => c.vehicleId === staleVehicleId)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    }, 180_000);

    it('snapshot isolation — RR fingerprint cannot mix pre/post concurrent append', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'SNAP');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-04T08:00:00.000Z'),
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
        computedAt: new Date('2026-05-04T09:00:00.000Z'),
      });

      const prismaService = prisma as unknown as PrismaService;
      const concurrent = new PrismaClient();
      try {
        const txOutcome = await prisma.$transaction(
          async (tx) => {
            const repo = new LongitudinalInputRepository(tx as unknown as PrismaService);
            const snapshotBefore = await repo.loadLongitudinalInputReadSnapshot({
              organizationId,
              vehicleId,
              sessionLimit,
            });
            const fpBefore = computeLongitudinalSourceEvidenceFingerprint({
              organizationId,
              vehicleId,
              appliedSessionLimit: sessionLimit,
              sessions: snapshotBefore.sessions,
              canonicalCandidates: snapshotBefore.canonicalCandidates,
            });

            await createFeatureRow(concurrent, {
              organizationId,
              vehicleId,
              restSessionId: session.id,
              semanticRevision: 2,
              computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
              sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
              inputSummary: summary,
              computedAt: new Date('2026-05-04T10:00:00.000Z'),
            });

            const snapshotAfter = await repo.loadLongitudinalInputReadSnapshot({
              organizationId,
              vehicleId,
              sessionLimit,
            });
            const fpAfter = computeLongitudinalSourceEvidenceFingerprint({
              organizationId,
              vehicleId,
              appliedSessionLimit: sessionLimit,
              sessions: snapshotAfter.sessions,
              canonicalCandidates: snapshotAfter.canonicalCandidates,
            });

            return { fpBefore: fpBefore.fingerprint, fpAfter: fpAfter.fingerprint };
          },
          { isolationLevel: LONGITUDINAL_INPUT_SNAPSHOT_ISOLATION, timeout: 20_000 },
        );

        expect(txOutcome.fpBefore).toBe(txOutcome.fpAfter);

        const live = await candidates.computeCurrentSourceEvidenceFingerprint({
          organizationId,
          vehicleId,
          sessionLimit,
        });
        expect(live.fingerprint).not.toBe(txOutcome.fpBefore);
      } finally {
        await concurrent.$disconnect();
      }
    });

    it('out-of-order completion — newer ack is not regressed by older materialization', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'OOO');
      const session = await createRestSession(prisma, {
        organizationId,
        vehicleId,
        anchorAt: new Date('2026-05-05T08:00:00.000Z'),
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
        computedAt: new Date('2026-05-05T09:00:00.000Z'),
      });

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
        inputSummary: summary,
        computedAt: new Date('2026-05-05T10:00:00.000Z'),
      });

      const newer = await materialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(newer.outcome === 'CREATED' || newer.outcome === 'EXISTING').toBe(true);
      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(false);

      const prismaService = prisma as unknown as PrismaService;
      const ackRepo = new LongitudinalSourceEvidenceAckRepository(prismaService);
      const frozenReader = {
        readInventory: jest.fn().mockResolvedValue(inventoryA),
      } as unknown as LongitudinalInputReaderService;
      const materializationRepo = new LongitudinalProfileMaterializationRepository(prismaService);
      const olderMaterialization = new LongitudinalProfileMaterializationService(
        frozenReader,
        materializationRepo,
        ackRepo,
      );
      const older = await olderMaterialization.materialize({
        organizationId,
        vehicleId,
        sessionLimit,
        profileGeneratedAt: new Date().toISOString(),
      });
      expect(older.outcome === 'CREATED' || older.outcome === 'EXISTING').toBe(true);

      expect(
        (await candidates.findCandidates({ batchSize: 5, sessionLimit })).some(
          (c) => c.vehicleId === vehicleId,
        ),
      ).toBe(false);
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
