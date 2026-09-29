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
import {
  ManualGroundTruthConfirmationConflictError,
  ReplacementGroundTruthScopeConflictError,
  GroundTruthEmissionFailedError,
} from './ground-truth-emission.errors';

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

(LIVE ? describe : describe.skip)('BatteryGroundTruth G2.2 cross-scope PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertGtPostgresReachable();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('G2H-K — concurrent LV + HV confirm → one active GT and one scope conflict', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const serviceEventId = await insertBatteryReplacementEvent(prisma, {
      organizationId,
      vehicleId,
      eventDate: new Date('2026-06-25T10:00:00.000Z'),
    });
    const { emission } = buildGroundTruthStack(prisma);
    const base = {
      organizationId,
      vehicleId,
      serviceEventId,
      actorUserId: actor.id,
    };

    const [lv, hv] = await Promise.allSettled([
      emission.confirmManualBatteryReplacement({
        ...base,
        batteryScope: BatteryEvidenceScope.LV,
      }),
      emission.confirmManualBatteryReplacement({
        ...base,
        batteryScope: BatteryEvidenceScope.HV,
      }),
    ]);

    const fulfilled = [lv, hv].filter((r) => r.status === 'fulfilled');
    const rejected = [lv, hv].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ManualGroundTruthConfirmationConflictError);

    expect(
      await prisma.batteryGroundTruthEvent.count({
        where: {
          organizationId,
          sourceServiceEventId: serviceEventId,
          groundTruthType: 'BATTERY_REPLACEMENT',
          verificationStatus: 'CONFIRMED',
        },
      }),
    ).toBe(1);
  });

  it('G2H-L — document LV then manual HV race → one active GT', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const eventDate = new Date('2026-06-26T10:00:00.000Z');
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
        contentSha256: 'sha-g2h-l',
        confirmedById: actor.id,
        plausibility: buildActionPlanPlausibility({
          confirmedAt: '2026-06-25T08:00:00.000Z',
          fingerprint: 'fp-g2h-l',
        }),
      },
    });
    const { emission } = buildGroundTruthStack(prisma);

    const [docResult, manualResult] = await Promise.allSettled([
      emission.convergeDocumentApplyGroundTruth({
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
      }),
      emission.confirmManualBatteryReplacement({
        organizationId,
        vehicleId,
        serviceEventId,
        batteryScope: BatteryEvidenceScope.HV,
        actorUserId: actor.id,
      }),
    ]);

    const successes = [docResult, manualResult].filter((r) => r.status === 'fulfilled');
    const failures = [docResult, manualResult].filter((r) => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const err = (failures[0] as PromiseRejectedResult).reason;
    expect(
      err instanceof ManualGroundTruthConfirmationConflictError ||
        err instanceof GroundTruthEmissionFailedError ||
        err instanceof ReplacementGroundTruthScopeConflictError,
    ).toBe(true);

    expect(
      await prisma.batteryGroundTruthEvent.count({
        where: {
          organizationId,
          sourceServiceEventId: serviceEventId,
          verificationStatus: 'CONFIRMED',
          groundTruthType: 'BATTERY_REPLACEMENT',
        },
      }),
    ).toBe(1);
  });

  it('PG-G2_2 — active replacement unique index is per source event (not scope)', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'battery_ground_truth_one_active_replacement_per_source_event'
    `;
    expect(indexes).toHaveLength(1);
    const legacy = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'battery_ground_truth_one_active_replacement_per_source_scope'
    `;
    expect(legacy).toHaveLength(0);
  });
});
