import { randomUUID } from 'crypto';
import {
  BatteryDriveProfile,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
  BatteryRestSessionAnchorType,
  BatteryRestSessionStatus,
  Prisma,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { getBatteryRest60mDelayMs, getBatteryRest6hDelayMs } from '@config/battery-health-v2.config';
import { BatteryMeasurementRepository } from '../battery-measurement.repository';
import { BatteryMeasurementService } from '../battery-measurement.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryRestTargetEvaluationService } from './battery-rest-target-evaluation.service';
import { LvRestCanonicalTargetAnchorResolverService } from './lv-rest-canonical-target-anchor.resolver.service';
import { buildRestMeasurementIdempotencyKey } from './battery-rest-target-evaluation';
import { isCanonicalRestAssessmentHandoffEligible } from './lv-rest-assessment-handoff.policy';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';

const LIVE =
  process.env.BATTERY_V2_G5C_N7_POSTGRES_INTEGRATION === '1' &&
  Boolean(process.env.DATABASE_URL);

function assertIsolatedDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  const lower = url.toLowerCase();
  if (!lower.includes('127.0.0.1') && !lower.includes('localhost')) {
    throw new Error('DATABASE_URL must target isolated CI-local PostgreSQL');
  }
  if (
    lower.includes('srv1374778') ||
    lower.includes('app.synqdrive') ||
    lower.includes('hstgr.cloud') ||
    lower.includes('mein-vps')
  ) {
    throw new Error('DATABASE_URL must not reference production hosts');
  }
}

async function createVehicle(
  prisma: PrismaClient,
  organizationId: string,
  suffix: string,
) {
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${organizationId}::uuid,
      ${vin},
      'Test',
      'G5C-N7',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`G7-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return vehicleId;
}

(LIVE ? describe : describe.skip)(
  'G5C-N7 canonical REST anchor postgres E2E',
  () => {
    let prisma: PrismaClient;
    let organizationId = '';
    let evaluation: BatteryRestTargetEvaluationService;
    let measurements: BatteryMeasurementService;
    let handoff: LvRestAssessmentHandoffService;
    let jobProducer: {
      enqueue: jest.Mock;
      hasLiveAssessJobForVehicle: jest.Mock;
      hasAssessDispatchConflict: jest.Mock;
    };

    beforeAll(async () => {
      assertIsolatedDatabaseUrl();
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL required for G5C-N7 postgres integration');
      }
      const ok = await probePostgresDatabase();
      if (!ok) {
        throw new Error('PostgreSQL probe failed');
      }
      prisma = new PrismaClient();
      const measurementRepo = new BatteryMeasurementRepository(prisma as never);
      const policyProfiles = {
        resolveForVehicle: jest.fn().mockResolvedValue({
          driveProfile: BatteryDriveProfile.ICE,
          chemistry: 'LEAD_ACID',
          lvAssessmentAllowed: true,
          supportedMeasurementTypes: [
            BatteryMeasurementType.LIVE_VOLTAGE,
            BatteryMeasurementType.REST_60M,
            BatteryMeasurementType.REST_6H,
          ],
          forbiddenMeasurementTypes: [],
          restingBands: { maxRestingV: 13.2 },
          minimumContext: { restRequiresEngineOff: true },
        }),
      } as unknown as BatteryPolicyProfileService;
      measurements = new BatteryMeasurementService(
        prisma as never,
        measurementRepo,
        policyProfiles,
      );
      const canonicalResolver = new LvRestCanonicalTargetAnchorResolverService(
        prisma as never,
      );
      evaluation = new BatteryRestTargetEvaluationService(
        prisma as never,
        measurements,
        policyProfiles,
        canonicalResolver,
      );
      jobProducer = {
        enqueue: jest.fn().mockResolvedValue('job-1'),
        hasLiveAssessJobForVehicle: jest.fn().mockResolvedValue(false),
        hasAssessDispatchConflict: jest.fn().mockResolvedValue(false),
      };
      handoff = new LvRestAssessmentHandoffService(
        prisma as never,
        jobProducer as never,
        {
          clearDeadLetter: jest.fn(),
          isDeadLetter: jest.fn().mockResolvedValue(false),
        } as never,
      );
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `G5C-N7 Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;
      jest.clearAllMocks();
    });

    async function seedTrip(input: {
      vehicleId: string;
      tripId: string;
      startTime: Date;
      endTime?: Date;
    }) {
      return prisma.vehicleTrip.create({
        data: {
          id: input.tripId,
          vehicleId: input.vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: input.startTime,
          endTime: input.endTime ?? new Date(input.startTime.getTime() + 3_600_000),
          startLatitude: 51.1,
          startLongitude: 9.1,
          endLatitude: 51.11,
          endLongitude: 9.11,
          rawDetectionMeta: {},
        },
      });
    }

    async function seedRestSession(input: {
      vehicleId: string;
      tripId: string;
      anchorAt: Date;
      sessionStatus?: BatteryRestSessionStatus;
    }) {
      await seedTrip({
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        startTime: new Date(input.anchorAt.getTime() - 1_800_000),
        endTime: input.anchorAt,
      });
      return prisma.batteryRestSession.create({
        data: {
          organizationId,
          vehicleId: input.vehicleId,
          anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
          anchorAt: input.anchorAt,
          sessionStatus: input.sessionStatus ?? BatteryRestSessionStatus.RESTING,
          openedAt: input.anchorAt,
          confirmedTripId: input.tripId,
          idempotencyKey: `rest-session:${input.vehicleId}:${input.anchorAt.getTime()}`,
        },
      });
    }

    async function seedLvSession(input: {
      vehicleId: string;
      tripId: string;
      startedAt: Date;
      sessionId?: string;
    }) {
      const existingTrip = await prisma.vehicleTrip.findUnique({
        where: { id: input.tripId },
      });
      if (!existingTrip) {
        await seedTrip({
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          startTime: new Date(input.startedAt.getTime() - 1_800_000),
          endTime: input.startedAt,
        });
      }
      return prisma.batteryMeasurementSession.create({
        data: {
          id: input.sessionId,
          organizationId,
          vehicleId: input.vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: BatteryMeasurementSessionType.LV_REST_WINDOW,
          status: BatteryMeasurementSessionStatus.ACTIVE,
          startedAt: input.startedAt,
          tripId: input.tripId,
          sourceEntityType: 'trip',
          sourceEntityId: input.tripId,
          idempotencyKey: `lv-rest:${input.vehicleId}:${input.startedAt.getTime()}`,
        },
      });
    }

    async function seedLiveVoltage(input: {
      vehicleId: string;
      sessionId: string;
      observedAt: Date;
      numericValue: number;
      suffix: string;
      context?: Record<string, unknown>;
    }) {
      return measurements.create({
        organizationId,
        vehicleId: input.vehicleId,
        sessionId: input.sessionId,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        quality: BatteryMeasurementQuality.VALID,
        observedAt: input.observedAt,
        numericValue: input.numericValue,
        providerTimestamp: input.observedAt,
        idempotencyKey: `live:${input.suffix}:${input.observedAt.getTime()}`,
        context: {
          speedKmh: 0,
          ignitionOn: false,
          engineRunning: false,
          hasActiveTrip: false,
          isLvCharging: false,
          isHvCharging: false,
          providerObservationOutcome: 'NEW_OBSERVATION',
          ...input.context,
        },
      });
    }

    it('60m VALID REST measurement binds canonical anchor and enqueues assessment', async () => {
      const suffix = randomUUID().slice(0, 8);
      const vehicleId = await createVehicle(prisma, organizationId, suffix);
      const tripId = randomUUID();
      const canonicalAnchor = new Date('2026-10-13T17:06:40.000Z');
      const sessionStart = new Date('2026-10-13T17:29:42.000Z');
      const restSession = await seedRestSession({ vehicleId, tripId, anchorAt: canonicalAnchor });
      const lvSession = await seedLvSession({ vehicleId, tripId, startedAt: sessionStart });
      const validAt = new Date(canonicalAnchor.getTime() + getBatteryRest60mDelayMs() + 60_000);
      await seedLiveVoltage({
        vehicleId,
        sessionId: lvSession.id,
        observedAt: validAt,
        numericValue: 12.48,
        suffix,
      });

      const result = await evaluation.evaluateAndPersist({
        organizationId,
        vehicleId,
        session: lvSession,
        restTargetType: 'REST_60M',
        now: new Date(validAt.getTime() + 120_000),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: result.measurementId },
      });
      expect(row.quality).toBe(BatteryMeasurementQuality.VALID);
      expect((row.provenance as Record<string, unknown>).canonicalRestSessionId).toBe(
        restSession.id,
      );
      expect(isCanonicalRestAssessmentHandoffEligible(row)).toBe(true);

      const handoffResult = await handoff.ensureAssessmentHandoff({
        organizationId,
        vehicleId,
        sessionId: lvSession.id,
        restTargetType: 'REST_60M',
        measurementId: row.id,
      });
      expect(handoffResult.enqueued).toBe(true);
      expect(jobProducer.enqueue).toHaveBeenCalledWith(
        'BATTERY_ASSESSMENT_RECOMPUTE',
        expect.objectContaining({ inputVersion: row.id }),
      );
    });

    it('ENDED canonical session still reconciles VALID REST_60M when target was reached', async () => {
      const suffix = randomUUID().slice(0, 8);
      const vehicleId = await createVehicle(prisma, organizationId, suffix);
      const tripId = randomUUID();
      const canonicalAnchor = new Date('2026-10-15T08:00:00.000Z');
      const sessionStart = new Date('2026-10-15T08:04:00.000Z');
      await seedRestSession({
        vehicleId,
        tripId,
        anchorAt: canonicalAnchor,
        sessionStatus: BatteryRestSessionStatus.ENDED,
      });
      const lvSession = await seedLvSession({ vehicleId, tripId, startedAt: sessionStart });
      const validAt = new Date(canonicalAnchor.getTime() + getBatteryRest60mDelayMs() + 15_000);
      await seedLiveVoltage({
        vehicleId,
        sessionId: lvSession.id,
        observedAt: validAt,
        numericValue: 12.46,
        suffix,
      });
      const result = await evaluation.evaluateAndPersist({
        organizationId,
        vehicleId,
        session: lvSession,
        restTargetType: 'REST_60M',
        now: new Date(validAt.getTime() + 60_000),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: result.measurementId },
      });
      expect(row.quality).toBe(BatteryMeasurementQuality.VALID);
    });

    it('forensic short-rest does not produce VALID REST_60M', async () => {
      const suffix = randomUUID().slice(0, 8);
      const vehicleId = await createVehicle(prisma, organizationId, suffix);
      const tripId = randomUUID();
      const canonicalAnchor = new Date('2026-10-13T17:06:40.000Z');
      const sessionStart = new Date('2026-10-13T17:29:42.000Z');
      await seedRestSession({ vehicleId, tripId, anchorAt: canonicalAnchor });
      const lvSession = await seedLvSession({ vehicleId, tripId, startedAt: sessionStart });
      await seedLiveVoltage({
        vehicleId,
        sessionId: lvSession.id,
        observedAt: new Date('2026-10-13T17:19:24.000Z'),
        numericValue: 12.512,
        suffix: `${suffix}-a`,
      });
      await seedLiveVoltage({
        vehicleId,
        sessionId: lvSession.id,
        observedAt: new Date('2026-10-13T17:20:29.000Z'),
        numericValue: 14.118,
        suffix: `${suffix}-b`,
        context: { ignitionOn: true, isLvCharging: true },
      });

      const target60 = new Date(canonicalAnchor.getTime() + getBatteryRest60mDelayMs());
      const result = await evaluation.evaluateAndPersist({
        organizationId,
        vehicleId,
        session: lvSession,
        restTargetType: 'REST_60M',
        now: new Date(target60.getTime() + 45 * 60_000),
      });
      expect(result.quality).not.toBe(BatteryMeasurementQuality.VALID);
    });

    it('database idempotency prevents duplicate authoritative REST rows', async () => {
      const suffix = randomUUID().slice(0, 8);
      const vehicleId = await createVehicle(prisma, organizationId, suffix);
      const tripId = randomUUID();
      const anchor = new Date('2026-08-26T10:00:00.000Z');
      const lvSession = await seedLvSession({ vehicleId, tripId, startedAt: anchor });
      const observedAt = new Date(anchor.getTime() + getBatteryRest60mDelayMs());
      const live = await seedLiveVoltage({
        vehicleId,
        sessionId: lvSession.id,
        observedAt,
        numericValue: 12.41,
        suffix,
      });
      const idempotencyKey = buildRestMeasurementIdempotencyKey({
        sessionId: lvSession.id,
        restTargetType: 'REST_60M',
        sourceObservationId: live.id,
      });
      const repo = new BatteryMeasurementRepository(prisma as never);
      const payload = {
        organizationId,
        vehicleId,
        sessionId: lvSession.id,
        scope: BatteryEvidenceScope.LV,
        type: BatteryMeasurementType.REST_60M,
        quality: BatteryMeasurementQuality.VALID,
        observedAt,
        numericValue: 12.41,
        idempotencyKey,
        provenance: { sourceObservationId: live.id } as Prisma.InputJsonValue,
      };
      const [a, b] = await Promise.all([
        repo.createIdempotent(payload),
        repo.createIdempotent(payload),
      ]);
      expect(a.id).toBe(b.id);
      const count = await prisma.batteryMeasurement.count({
        where: { organizationId, idempotencyKey },
      });
      expect(count).toBe(1);
    });
  },
);
