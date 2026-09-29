import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  PrismaClient,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { BatteryGroundTruthBackedSourceGuard } from './ground-truth-backed-source.guard';
import { ManualGroundTruthConfirmationConflictError } from './ground-truth-emission.errors';
import { BatteryGroundTruthEmissionService } from './ground-truth-emission.service';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';
import { BatteryGroundTruthSourceResolver } from './ground-truth-source.resolver';

const LIVE = process.env.BATTERY_V2_GROUND_TRUTH_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `GT G2 ${suffix}`,
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
      'EV',
      2024,
      'ELECTRIC'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`G2-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

async function insertBatteryReplacementEvent(
  prisma: PrismaClient,
  data: {
    organizationId: string;
    vehicleId: string;
    eventDate: Date;
    documentExtractionId?: string | null;
    origin?: ServiceEventOrigin;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO vehicle_service_events (
      id, vehicle_id, organization_id, event_type, event_date, origin,
      document_extraction_id, created_at, updated_at
    ) VALUES (
      ${id},
      ${data.vehicleId},
      ${data.organizationId},
      ${ServiceEventType.BATTERY_REPLACEMENT}::"ServiceEventType",
      ${data.eventDate},
      ${(data.origin ?? ServiceEventOrigin.MANUAL)}::"ServiceEventOrigin",
      ${data.documentExtractionId ?? null},
      NOW(),
      NOW()
    )
  `;
  return id;
}

(LIVE ? describe : describe.skip)('BatteryGroundTruth G2 PostgreSQL', () => {
  let prisma: PrismaClient;
  let emission: BatteryGroundTruthEmissionService;
  let guard: BatteryGroundTruthBackedSourceGuard;

  beforeAll(async () => {
    const ok = await probePostgresDatabase();
    if (!ok) throw new Error('DATABASE_URL not reachable');
    prisma = new PrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const gtRepo = new BatteryGroundTruthRepository(prismaService);
    const resolver = new BatteryGroundTruthSourceResolver(prismaService);
    const gtService = new BatteryGroundTruthService(prismaService, gtRepo, resolver);
    emission = new BatteryGroundTruthEmissionService(prismaService, gtService);
    guard = new BatteryGroundTruthBackedSourceGuard(prismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('PG-G2-A — document replacement emission', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-04-10T12:00:00.000Z');
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: 'sha-g2-a',
        appliedAt: observedAt,
      },
    });
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: observedAt,
      documentExtractionId: doc.id,
      origin: ServiceEventOrigin.AI_UPLOAD,
    });

    const ids = await emission.convergeDocumentApplyGroundTruth({
      organizationId,
      vehicleId,
      documentExtractionId: doc.id,
      scope: BatteryEvidenceScope.LV,
      isReplacement: true,
      observedAt,
      odometerKm: null,
      workshopName: null,
      notes: null,
      measurementType: 'REPLACEMENT',
      sohPercent: null,
      voltageV: null,
      restingVoltage: null,
      crankingVoltage: null,
      chargingVoltage: null,
      temperatureC: null,
      serviceEventId,
      evidenceIds: [],
    });

    expect(ids).toHaveLength(1);
    const row = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: ids[0] } });
    expect(row?.groundTruthType).toBe('BATTERY_REPLACEMENT');
    expect(row?.batteryScope).toBe('LV');
    expect(row?.sourceAuthority).toBe('CONFIRMED_DOCUMENT');
  });

  it('PG-G2-B — document retry convergence is idempotent', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-04-11T12:00:00.000Z');
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: 'sha-g2-b',
        appliedAt: observedAt,
      },
    });
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: observedAt,
      documentExtractionId: doc.id,
      origin: ServiceEventOrigin.AI_UPLOAD,
    });
    const input = {
      organizationId,
      vehicleId,
      documentExtractionId: doc.id,
      scope: BatteryEvidenceScope.HV,
      isReplacement: true,
      observedAt,
      odometerKm: null,
      workshopName: null,
      notes: null,
      measurementType: 'REPLACEMENT',
      sohPercent: null,
      voltageV: null,
      restingVoltage: null,
      crankingVoltage: null,
      chargingVoltage: null,
      temperatureC: null,
      serviceEventId,
      evidenceIds: [] as string[],
    };
    const first = await emission.convergeDocumentApplyGroundTruth(input);
    const second = await emission.convergeDocumentApplyGroundTruth(input);
    expect(second).toEqual(first);
    expect(await prisma.batteryGroundTruthEvent.count({ where: { vehicleId } })).toBe(1);
  });

  it('PG-G2-C — manual confirmed idempotency', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const eventDate = new Date('2026-04-12T09:00:00.000Z');
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate,
    });
    const params = {
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: randomUUID(),
    };
    const a = await emission.confirmManualBatteryReplacement(params);
    const b = await emission.confirmManualBatteryReplacement(params);
    expect(b.groundTruthEventId).toBe(a.groundTruthEventId);
  });

  it('PG-G2-D — conflicting manual confirmation scope', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-04-13T09:00:00.000Z'),
    });
    await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.HV,
      actorUserId: randomUUID(),
    });
    await expect(
      emission.confirmManualBatteryReplacement({
        organizationId,
        vehicleId,
        serviceEventId,
        batteryScope: BatteryEvidenceScope.LV,
        actorUserId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ManualGroundTruthConfirmationConflictError);
  });

  it('PG-G2-E — cross-tenant manual confirmation fails', async () => {
    const orgA = await createOrgVehicle(prisma);
    const orgB = await createOrgVehicle(prisma);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId: orgA.organizationId,
      vehicleId: orgA.vehicleId,
      eventDate: new Date('2026-04-14T09:00:00.000Z'),
    });
    await expect(
      emission.confirmManualBatteryReplacement({
        organizationId: orgB.organizationId,
        vehicleId: orgB.vehicleId,
        serviceEventId,
        batteryScope: BatteryEvidenceScope.LV,
        actorUserId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'GT_SERVICE_EVENT_NOT_FOUND' });
  });

  it('PG-G2-F — source delete does not cascade GT', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-04-15T09:00:00.000Z'),
    });
    const { groundTruthEventId } = await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: randomUUID(),
    });
    await expect(
      guard.assertServiceEventMutable(vehicleId, serviceEventId, 'delete'),
    ).rejects.toThrow(/supersede|revoke/i);
    expect(await prisma.batteryGroundTruthEvent.findUnique({ where: { id: groundTruthEventId } }))
      .toBeTruthy();
  });

  it('PG-G2-G — GT-backed source update requires correction workflow', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-04-16T09:00:00.000Z'),
    });
    await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: randomUUID(),
    });
    await expect(
      guard.assertServiceEventMutable(vehicleId, serviceEventId, 'update', {
        eventDate: '2026-04-17',
      }),
    ).rejects.toThrow(/material fields/i);
  });
});
