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
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import {
  BATTERY_V2_PUBLICATION_ENABLED_ENV,
  BATTERY_V2_REST_SHADOW_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { getBatteryRest60mDelayMs } from '@config/battery-health-v2.config';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { BatteryAssessmentService } from '../battery-assessment.service';
import { BatteryMeasurementRepository } from '../battery-measurement.repository';
import { BatteryMeasurementService } from '../battery-measurement.service';
import type { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import { BatteryAssessmentRecomputeHandler } from '../jobs/handlers/battery-assessment-recompute.handler';
import { BatteryRestTargetEvaluationService } from './battery-rest-target-evaluation.service';
import { LvRestCanonicalTargetAnchorResolverService } from './lv-rest-canonical-target-anchor.resolver.service';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import { LvPublicationHandoffService } from '../lv-assessment/lv-publication-handoff.service';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import type { BatteryAssessmentRecomputePayload } from '../jobs/battery-v2-job.types';

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
      'G5C-N7-ASSESS',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`GA-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return vehicleId;
}

(LIVE ? describe : describe.skip)(
  'G5C-N7 assessment consumer postgres integration',
  () => {
    let prisma: PrismaClient;
    let evaluation: BatteryRestTargetEvaluationService;
    let measurements: BatteryMeasurementService;
    let handoff: LvRestAssessmentHandoffService;
    let assessHandler: BatteryAssessmentRecomputeHandler;
    let jobProducer: {
      enqueue: jest.Mock;
      hasLiveAssessJobForVehicle: jest.Mock;
      hasAssessDispatchConflict: jest.Mock;
      hasLiveJob: jest.Mock;
    };
    let publicationEnqueuePayloads: unknown[] = [];
    const originalShadow = process.env[BATTERY_V2_REST_SHADOW_ENABLED_ENV];
    const originalPublication = process.env[BATTERY_V2_PUBLICATION_ENABLED_ENV];

    beforeAll(async () => {
      assertIsolatedDatabaseUrl();
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL required for G5C-N7 assessment consumer integration');
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

      const assessmentService = new BatteryAssessmentService(
        policyProfiles,
        measurementRepo,
        new BatteryAssessmentRepository(prisma as never),
      );
      const deadLetters = {
        isDeadLetter: jest.fn().mockResolvedValue(false),
        clearDeadLetter: jest.fn(),
      } as unknown as BatteryV2JobDeadLetterService;

      publicationEnqueuePayloads = [];
      jobProducer = {
        hasLiveAssessJobForVehicle: jest.fn().mockResolvedValue(false),
        hasAssessDispatchConflict: jest.fn().mockResolvedValue(false),
        hasLiveJob: jest.fn().mockResolvedValue(false),
        enqueue: jest.fn(),
      };

      const publicationHandoff = new LvPublicationHandoffService(
        prisma as never,
        jobProducer as never,
        deadLetters,
      );
      assessHandler = new BatteryAssessmentRecomputeHandler(
        assessmentService,
        { acknowledgeExecuted: jest.fn() } as never,
        publicationHandoff,
      );

      jobProducer.enqueue.mockImplementation(
        async (jobType: string, payload: BatteryAssessmentRecomputePayload) => {
          if (jobType === 'BATTERY_ASSESSMENT_RECOMPUTE') {
            await assessHandler.handle(payload);
            return `assess-${payload.inputVersion}`;
          }
          if (jobType === 'BATTERY_PUBLICATION_UPDATE') {
            publicationEnqueuePayloads.push(payload);
            return 'pub-job-skipped';
          }
          return null;
        },
      );

      handoff = new LvRestAssessmentHandoffService(
        prisma as never,
        jobProducer as never,
        deadLetters,
      );
    }, 120_000);

    afterAll(async () => {
      if (originalShadow === undefined) {
        delete process.env[BATTERY_V2_REST_SHADOW_ENABLED_ENV];
      } else {
        process.env[BATTERY_V2_REST_SHADOW_ENABLED_ENV] = originalShadow;
      }
      if (originalPublication === undefined) {
        delete process.env[BATTERY_V2_PUBLICATION_ENABLED_ENV];
      } else {
        process.env[BATTERY_V2_PUBLICATION_ENABLED_ENV] = originalPublication;
      }
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      process.env[BATTERY_V2_REST_SHADOW_ENABLED_ENV] = 'true';
      process.env[BATTERY_V2_PUBLICATION_ENABLED_ENV] = 'false';
      publicationEnqueuePayloads = [];
      jest.clearAllMocks();
    });

    async function seedOrg(): Promise<string> {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `G5C-N7 Assess Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      return org.id;
    }

    it('handoff enqueues assess job and consumer persists assessment with restMeasurementCount >= 1', async () => {
      const organizationId = await seedOrg();
      const suffix = randomUUID().slice(0, 8);
      const vehicleId = await createVehicle(prisma, organizationId, suffix);
      const tripId = randomUUID();
      const canonicalAnchor = new Date('2026-10-14T10:00:00.000Z');
      const sessionStart = new Date('2026-10-14T10:05:00.000Z');
      await prisma.vehicleTrip.create({
        data: {
          id: tripId,
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(canonicalAnchor.getTime() - 1_800_000),
          endTime: canonicalAnchor,
          startLatitude: 51.1,
          startLongitude: 9.1,
          endLatitude: 51.11,
          endLongitude: 9.11,
          rawDetectionMeta: {},
        },
      });
      await prisma.batteryRestSession.create({
        data: {
          organizationId,
          vehicleId,
          anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
          anchorAt: canonicalAnchor,
          sessionStatus: BatteryRestSessionStatus.ENDED,
          openedAt: canonicalAnchor,
          confirmedTripId: tripId,
          idempotencyKey: `rest-session:${vehicleId}:${canonicalAnchor.getTime()}`,
        },
      });
      const lvSession = await prisma.batteryMeasurementSession.create({
        data: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: BatteryMeasurementSessionType.LV_REST_WINDOW,
          status: BatteryMeasurementSessionStatus.ACTIVE,
          startedAt: sessionStart,
          tripId,
          sourceEntityType: 'trip',
          sourceEntityId: tripId,
          idempotencyKey: `lv-rest:${vehicleId}:${sessionStart.getTime()}`,
        },
      });
      const validAt = new Date(canonicalAnchor.getTime() + getBatteryRest60mDelayMs() + 30_000);
      const now = new Date(validAt.getTime() + 120_000);
      await measurements.create({
        organizationId,
        vehicleId,
        sessionId: lvSession.id,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        quality: BatteryMeasurementQuality.VALID,
        observedAt: validAt,
        numericValue: 12.55,
        providerTimestamp: validAt,
        receivedAt: now,
        idempotencyKey: `live:${suffix}:${validAt.getTime()}`,
        context: {
          speedKmh: 0,
          ignitionOn: false,
          engineRunning: false,
          hasActiveTrip: false,
          isLvCharging: false,
          isHvCharging: false,
          providerObservationOutcome: 'NEW_OBSERVATION',
        },
      });

      const evalResult = await evaluation.evaluateAndPersist({
        organizationId,
        vehicleId,
        session: lvSession,
        restTargetType: 'REST_60M',
        now,
      });
      expect(evalResult.ok).toBe(true);
      if (!evalResult.ok) return;

      const handoffResult = await handoff.ensureAssessmentHandoff({
        organizationId,
        vehicleId,
        sessionId: lvSession.id,
        restTargetType: 'REST_60M',
        measurementId: evalResult.measurementId,
      });
      expect(handoffResult.enqueued).toBe(true);
      expect(jobProducer.enqueue).toHaveBeenCalledWith(
        'BATTERY_ASSESSMENT_RECOMPUTE',
        expect.objectContaining({ inputVersion: evalResult.measurementId }),
      );

      const assessments = await prisma.batteryAssessment.findMany({
        where: { organizationId, vehicleId },
      });
      expect(assessments.length).toBeGreaterThanOrEqual(1);
      const telemetry = assessments.find(
        (row) =>
          (row.inputSummary as Record<string, unknown>)?.assessmentTrack ===
          'TELEMETRY',
      );
      expect(telemetry).toBeDefined();
      const coverage = (telemetry!.inputSummary as Record<string, unknown>)
        .measurementCoverage as { restMeasurementCount?: number };
      expect(coverage.restMeasurementCount).toBeGreaterThanOrEqual(1);

      const publications = await prisma.batteryPublication.findMany({
        where: { organizationId, vehicleId },
      });
      expect(publications).toHaveLength(0);
    });
  },
);
