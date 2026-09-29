import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  PrismaClient,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import {
  assertGtPostgresReachable,
  buildActionPlanPlausibility,
  buildGroundTruthStack,
  createGtOrgVehicle,
  createGtTestUser,
} from './ground-truth-postgres.fixture';
import { ManualGroundTruthConfirmationConflictError } from './ground-truth-emission.errors';

const LIVE = process.env.BATTERY_V2_GROUND_TRUTH_INTEGRATION === '1';

async function insertBatteryReplacementEvent(
  prisma: PrismaClient,
  data: {
    organizationId: string;
    vehicleId: string;
    eventDate: Date;
    origin?: ServiceEventOrigin;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO vehicle_service_events (
      id, vehicle_id, organization_id, event_type, event_date, origin, created_at, updated_at
    ) VALUES (
      ${id},
      ${data.vehicleId},
      ${data.organizationId},
      ${ServiceEventType.BATTERY_REPLACEMENT}::"ServiceEventType",
      ${data.eventDate},
      ${(data.origin ?? ServiceEventOrigin.MANUAL)}::"ServiceEventOrigin",
      NOW(),
      NOW()
    )
  `;
  return id;
}

(LIVE ? describe : describe.skip)('BatteryGroundTruth G2.1 concurrency PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertGtPostgresReachable();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('G2H-F — concurrent manual same-scope confirm → one GT', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-06-20T10:00:00.000Z'),
    });
    const { emission } = buildGroundTruthStack(prisma);
    const params = {
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: actor.id,
    };
    const [a, b] = await Promise.all([
      emission.confirmManualBatteryReplacement(params),
      emission.confirmManualBatteryReplacement(params),
    ]);
    expect(a.groundTruthEventId).toBe(b.groundTruthEventId);
    expect(await prisma.batteryGroundTruthEvent.count({ where: { vehicleId } })).toBe(1);
  });

  it('G2H-G — document GT then manual confirm same scope converges', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const eventDate = new Date('2026-06-21T10:00:00.000Z');
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate,
      origin: ServiceEventOrigin.AI_UPLOAD,
    });
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: 'sha-cross',
        confirmedById: actor.id,
        plausibility: buildActionPlanPlausibility({
          confirmedAt: '2026-06-20T08:00:00.000Z',
          fingerprint: 'fp-cross',
        }),
      },
    });
    const { emission } = buildGroundTruthStack(prisma);
    const docGt = await emission.convergeDocumentApplyGroundTruth({
      organizationId,
      vehicleId,
      documentExtractionId: doc.id,
      scope: BatteryEvidenceScope.LV,
      isReplacement: true,
      observedAt: eventDate,
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
    expect(docGt).toHaveLength(1);
    const manual = await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: actor.id,
    });
    expect(manual.groundTruthEventId).toBe(docGt[0]);
    expect(await prisma.batteryGroundTruthEvent.count({ where: { vehicleId } })).toBe(1);
  });

  it('G2H-H — conflicting scope fails closed', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-06-22T10:00:00.000Z'),
    });
    const { emission } = buildGroundTruthStack(prisma);
    await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.HV,
      actorUserId: actor.id,
    });
    await expect(
      emission.confirmManualBatteryReplacement({
        organizationId,
        vehicleId,
        serviceEventId,
        batteryScope: BatteryEvidenceScope.LV,
        actorUserId: actor.id,
      }),
    ).rejects.toBeInstanceOf(ManualGroundTruthConfirmationConflictError);
  });

  it('G2H-I — manual confirm uses valid user FK', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-06-23T10:00:00.000Z'),
    });
    const { emission } = buildGroundTruthStack(prisma);
    const { groundTruthEventId } = await emission.confirmManualBatteryReplacement({
      organizationId,
      vehicleId,
      serviceEventId,
      batteryScope: BatteryEvidenceScope.LV,
      actorUserId: actor.id,
    });
    const row = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: groundTruthEventId } });
    expect(row?.confirmedByUserId).toBe(actor.id);
    expect(row?.sourceAuthority).toBe(BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED);
  });

  it('PG-G2_1 — replacement source-scope unique index exists', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'battery_ground_truth_one_active_replacement_per_source_event'
    `;
    expect(indexes).toHaveLength(1);
  });
});
