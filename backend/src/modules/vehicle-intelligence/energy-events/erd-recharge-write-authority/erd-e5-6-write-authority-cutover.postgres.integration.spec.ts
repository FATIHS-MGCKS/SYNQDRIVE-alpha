import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ErdRechargeCanonicalProjectionRuntimeService } from './erd-recharge-canonical-projection-runtime.service';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import { evaluateLegacyRechargeWriteGate } from './erd-recharge-write-gate.policy';
import type { CoalescedEnergySegment } from '../energy-events.pipeline';
import { ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME } from './erd-recharge-write-authority.constants';

const LIVE = process.env.ERD_E5_6_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_6_POSTGRES_REQUIRED === '1';

const CUTOVER_AT = '2026-09-01T12:00:00.000Z';
const PRE_END = new Date('2026-08-31T12:00:00.000Z');
const POST_END = new Date('2026-09-02T12:00:00.000Z');

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function canonicalCutoverEnv(): NodeJS.ProcessEnv {
  process.env.BATTERY_V2_HV_RECHARGE_SESSION_ENABLED = 'true';
  process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED = 'true';
  process.env.BATTERY_V2_RECONCILIATION_ENABLED = 'true';
  return {
    ...process.env,
    ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
    ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER_AT,
    ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
  };
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E5.6 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E56${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E56-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'ERD',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

const describeFn = LIVE ? describe : describe.skip;

describeFn('ERD E5.6 write authority cutover PostgreSQL gate', () => {
  let prisma: PrismaClient;
  let dbReady = false;

  beforeAll(async () => {
    dbReady = await probeDatabase();
    if (REQUIRED && !dbReady) {
      throw new Error('ERD_E5_6_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
    }
    if (!dbReady) return;
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('A6: post-cutover native session → exactly one canonical VEE', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const env = canonicalCutoverEnv();
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-09-01T10:00:00.000Z'),
        endAt: POST_END,
        deltaSocPercent: 25,
        energyAddedKwh: 12,
        isOngoing: false,
        idempotencyKey: `sess-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });

    const runtime = new ErdRechargeCanonicalProjectionRuntimeService(
      prisma as unknown as PrismaService,
    );
    const outcome = await runtime.projectSingleSessionSafe({
      organizationId: org.id,
      vehicleId: vehicle.id,
      session,
      env,
    });
    expect(outcome).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CREATED);

    const vees = await prisma.vehicleEnergyEvent.findMany({ where: { vehicleId: vehicle.id } });
    expect(vees).toHaveLength(1);
    expect(vees[0]!.detectionMechanism).toBe(ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('A5/W4: pre-cutover session → projector skipped, no VEE', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const env = canonicalCutoverEnv();
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `pre-${suffix}`,
        dimoSegmentId: `dimo-pre-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-08-01T10:00:00.000Z'),
        endAt: PRE_END,
        deltaSocPercent: 20,
        energyAddedKwh: 10,
        isOngoing: false,
        idempotencyKey: `pre-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });

    const runtime = new ErdRechargeCanonicalProjectionRuntimeService(
      prisma as unknown as PrismaService,
    );
    const outcome = await runtime.projectSingleSessionSafe({
      organizationId: org.id,
      vehicleId: vehicle.id,
      session,
      env,
    });
    expect(outcome).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.SKIPPED_PRE_CUTOVER);
    expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('RB1: rollback protects canonical row from legacy reprocess', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const dimoId = `dimo-rb-${suffix}`;
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `rb-${suffix}`,
        dimoSegmentId: dimoId,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-09-01T10:00:00.000Z'),
        endAt: POST_END,
        deltaSocPercent: 30,
        energyAddedKwh: 15,
        isOngoing: false,
        idempotencyKey: `rb-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });
    const canonicalVee = await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        canonicalChargeSessionId: session.id,
        sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
        dimoSegmentId: dimoId,
        startTime: session.startAt,
        endTime: session.endAt!,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.HIGH,
        socDeltaPercent: 30,
      },
    });

    const segment = {
      mechanism: 'recharge',
      coalescedSegmentId: dimoId,
      startTime: session.startAt.toISOString(),
      endTime: session.endAt!.toISOString(),
      subsegmentIds: [dimoId],
      segments: [],
    } as unknown as CoalescedEnergySegment;

    const gate = evaluateLegacyRechargeWriteGate({
      segment,
      existing: canonicalVee,
      env: { ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'false' },
    });
    expect(gate.allowPersist).toBe(false);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('A9: unchanged session retries projection after prior failure', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const env = canonicalCutoverEnv();
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `retry-${suffix}`,
        dimoSegmentId: `dimo-retry-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-09-01T10:00:00.000Z'),
        endAt: POST_END,
        deltaSocPercent: 18,
        energyAddedKwh: 9,
        isOngoing: false,
        idempotencyKey: `retry-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });

    const runtime = new ErdRechargeCanonicalProjectionRuntimeService(
      prisma as unknown as PrismaService,
    );
    const fail = await runtime.projectSingleSessionSafe({
      organizationId: org.id,
      vehicleId: vehicle.id,
      session,
      env,
      injectFailureAfterCreate: true,
    });
    expect(fail).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.FAILED_ISOLATED);
    expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);

    const retry = await runtime.projectSingleSessionSafe({
      organizationId: org.id,
      vehicleId: vehicle.id,
      session,
      env,
    });
    expect(retry).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CREATED);
    expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P6: read dedupe OFF blocks CANONICAL authority (legacy gate allows persist)', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    process.env.BATTERY_V2_HV_RECHARGE_SESSION_ENABLED = 'true';
    process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED = 'true';
    process.env.BATTERY_V2_RECONCILIATION_ENABLED = 'true';
    const env = {
      ...process.env,
      ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED: 'true',
      ERD_RECHARGE_WRITE_CUTOVER_AT: CUTOVER_AT,
      ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '0',
    };
    const segment = {
      mechanism: 'recharge',
      coalescedSegmentId: `dimo-p6-${suffix}`,
      startTime: '2026-09-02T10:00:00.000Z',
      endTime: '2026-09-02T11:00:00.000Z',
      subsegmentIds: [`dimo-p6-${suffix}`],
      segments: [],
    } as unknown as CoalescedEnergySegment;
    const gate = evaluateLegacyRechargeWriteGate({ segment, existing: null, env });
    expect(gate.allowPersist).toBe(true);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('M1: concurrent canonical projection → one VEE', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const env = canonicalCutoverEnv();
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `m1-${suffix}`,
        dimoSegmentId: `dimo-m1-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-09-01T10:00:00.000Z'),
        endAt: POST_END,
        deltaSocPercent: 22,
        energyAddedKwh: 11,
        isOngoing: false,
        idempotencyKey: `m1-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    const runtimeA = new ErdRechargeCanonicalProjectionRuntimeService(
      clientA as unknown as PrismaService,
    );
    const runtimeB = new ErdRechargeCanonicalProjectionRuntimeService(
      clientB as unknown as PrismaService,
    );

    await Promise.all([
      runtimeA.projectSingleSessionSafe({
        organizationId: org.id,
        vehicleId: vehicle.id,
        session,
        env,
      }),
      runtimeB.projectSingleSessionSafe({
        organizationId: org.id,
        vehicleId: vehicle.id,
        session,
        env,
      }),
    ]);

    expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);
    await clientA.$disconnect().catch(() => undefined);
    await clientB.$disconnect().catch(() => undefined);
    await cleanup(prisma, vehicle.id, org.id);
  });
});
