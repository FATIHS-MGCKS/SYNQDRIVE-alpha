import { randomUUID } from 'crypto';
import {
  BatteryAssessmentType,
  BatteryMeasurementQuality,
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
  PrismaClient,
  ReferenceCapacityVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { HvCapacityObservationRepository } from './hv-capacity-observation.repository';
import { HvCapacityM3ValidationService } from './hv-capacity-m3-validation.service';
import { HvCapacityShadowService } from './hv-capacity-shadow.service';
import { HvCapacityM2SampleProviderService } from './hv-capacity-m2-sample-provider.service';
import { HvCapacitySessionSummaryService } from './hv-capacity-session-summary.service';
import { HvCapacityCrossSessionAssessmentService } from './hv-capacity-cross-session-assessment.service';
import { HvSohGateAssessmentService } from './hv-soh-gate-assessment.service';
import {
  HV_M2_CAPACITY_METHOD,
  HV_M2_MODEL_VERSION,
} from './hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD, HV_M3_MODEL_VERSION } from './hv-capacity-m3.types';
import {
  buildHvCapacityObservationIdempotencyKey,
  buildHvM3CapacityObservationIdempotencyKey,
} from './hv-capacity-observation.repository';
import { buildHvCapacityShadowEvidenceFingerprint } from './hv-capacity-shadow-evidence.policy';
import {
  TESLA_AUDIT_M2_SESSION_3_SAMPLES,
  TESLA_AUDIT_M2_SESSION_4_SAMPLES,
  TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
} from './hv-capacity-m2.fixtures';
import type { HvCapacityM2Sample } from './hv-capacity-m2.types';
import { withHvCapacityShadowMetadata } from './hv-capacity-shadow.policy';
import {
  assertHvP1PostgresIntegrationTarget,
  assertHvP1PostgresServerIdentity,
} from './hv-p1-shadow-refresh.postgres.guard';

const LIVE = process.env.HV_P1_POSTGRES_INTEGRATION === '1';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
  isBatteryV2HvSohPublicationEnabled: jest.fn().mockReturnValue(false),
}));

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)(
  'HV P1 shadow refresh PostgreSQL (HV_P1_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let shadow: HvCapacityShadowService;
    let m3: HvCapacityM3ValidationService;
    let observations: HvCapacityObservationRepository;

    beforeAll(async () => {
      assertHvP1PostgresIntegrationTarget();
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('HV_P1_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      await assertHvP1PostgresServerIdentity(prisma);
      const prismaService = prisma as unknown as PrismaService;
      observations = new HvCapacityObservationRepository(prismaService);
      m3 = new HvCapacityM3ValidationService(prismaService, observations);
      shadow = new HvCapacityShadowService(
        prismaService,
        new HvCapacityM2SampleProviderService(prismaService),
        observations,
        new HvCapacitySessionSummaryService(prismaService),
        m3,
        new HvCapacityCrossSessionAssessmentService(
          prismaService,
          new BatteryAssessmentRepository(prismaService),
        ),
        new HvSohGateAssessmentService(
          prismaService,
          new BatteryAssessmentRepository(prismaService),
        ),
      );
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    async function seedSession() {
      const suffix = randomUUID().slice(0, 8);
      const org = await prisma.organization.create({
        data: {
          companyName: `HV P1 ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          vin: `P1${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `P1-${suffix}`.slice(0, 12),
          make: 'Tesla',
          model: 'M3',
          year: 2024,
          fuelType: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      const startAt = new Date('2026-10-17T19:00:00.000Z');
      const endAt = new Date('2026-10-17T21:00:00.000Z');
      const session = await prisma.hvChargeSession.create({
        data: {
          organizationId: org.id,
          vehicleId: vehicle.id,
          segmentFingerprint: `p1-${suffix}`,
          dimoSegmentId: `seg-${suffix}`,
          source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          startAt,
          endAt,
          startSocPercent: 30,
          endSocPercent: 80,
          startEnergyKwh: 21,
          endEnergyKwh: 57,
          energyAddedKwh: 36,
          deltaSocPercent: 50,
          isOngoing: false,
          quality: BatteryMeasurementQuality.SHADOW,
          idempotencyKey: `hv-session:${vehicle.id}:p1-${suffix}`,
          providerObservedAt: endAt,
          metadata: {
            providerSegmentFingerprint: `p1-${suffix}`,
            durationSeconds: 7200,
            lastReconciledAt: endAt.toISOString(),
            reconcileVersion: 1,
            qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
            capacityShadowEligible: true,
            capacityValidationEligible: true,
            segmentAddedEnergyMinKwh: 0,
            segmentAddedEnergyMaxKwh: 36,
          },
        },
      });
      return { org, vehicle, session, startAt, endAt };
    }

    function scaleSampleEnergy(samples: HvCapacityM2Sample[], factor: number): HvCapacityM2Sample[] {
      return samples.map((row) => ({
        ...row,
        currentEnergyKwh: row.currentEnergyKwh * factor,
      }));
    }

    async function seedReferenceCapacity(organizationId: string, vehicleId: string) {
      await prisma.vehicleBatteryReferenceCapacity.create({
        data: {
          organizationId,
          vehicleId,
          capacityKwh: TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
          capacityType: BatteryReferenceCapacityType.USABLE,
          source: BatteryReferenceCapacitySource.VERIFIED_VEHICLE_SPEC,
          verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
          isActive: true,
        },
      });
    }

    async function seedQualifiedSession(input: {
      orgId: string;
      vehicleId: string;
      suffix: string;
      endAt: Date;
      socStart: number;
      socEnd: number;
    }) {
      const startAt = new Date(input.endAt.getTime() - 2 * 60 * 60 * 1000);
      const packKwh = TESLA_AUDIT_REFERENCE_CAPACITY_KWH;
      return prisma.hvChargeSession.create({
        data: {
          organizationId: input.orgId,
          vehicleId: input.vehicleId,
          segmentFingerprint: `p1-${input.suffix}`,
          dimoSegmentId: `seg-${input.suffix}`,
          source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          startAt,
          endAt: input.endAt,
          startSocPercent: input.socStart,
          endSocPercent: input.socEnd,
          startEnergyKwh: (input.socStart / 100) * packKwh,
          endEnergyKwh: (input.socEnd / 100) * packKwh,
          energyAddedKwh: ((input.socEnd - input.socStart) / 100) * packKwh,
          deltaSocPercent: input.socEnd - input.socStart,
          isOngoing: false,
          quality: BatteryMeasurementQuality.SHADOW,
          idempotencyKey: `hv-session:${input.vehicleId}:p1-${input.suffix}`,
          providerObservedAt: input.endAt,
          metadata: {
            providerSegmentFingerprint: `p1-${input.suffix}`,
            durationSeconds: 7200,
            lastReconciledAt: input.endAt.toISOString(),
            reconcileVersion: 1,
            qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
            capacityShadowEligible: true,
            capacityValidationEligible: true,
            segmentAddedEnergyMinKwh: 0,
            segmentAddedEnergyMaxKwh: ((input.socEnd - input.socStart) / 100) * packKwh,
          },
        },
      });
    }

    async function cleanup(vehicleId: string, organizationId: string) {
      await prisma.hvCapacityObservation.deleteMany({ where: { vehicleId } });
      await prisma.batteryAssessment.deleteMany({ where: { vehicleId } });
      await prisma.hvChargeSession.deleteMany({ where: { vehicleId } });
      await prisma.vehicleBatteryReferenceCapacity.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }

    it('invalidates prior M3 observation when ADDED_ENERGY_RESET gate fails', async () => {
      const { org, vehicle, session } = await seedSession();
      try {
        await observations.createIdempotent({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          method: HV_M3_CAPACITY_METHOD,
          estimatedCapacityKwh: 72,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: HV_M3_MODEL_VERSION,
          observedAt: session.endAt!,
          idempotencyKey: buildHvM3CapacityObservationIdempotencyKey({
            chargeSessionId: session.id,
            modelVersion: HV_M3_MODEL_VERSION,
          }),
          metadata: {
            validationOnly: true,
            methodRole: 'VALIDATION_ONLY',
            segmentAddedEnergyKwh: 36,
            deltaSocPercent: 50,
            gateReasonCodes: [],
            methodConflict: false,
            methodConflictDeviationRatio: null,
            m2MedianCapacityKwh: 72,
            segmentAggregateSource: true,
          },
        });

        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: {
            metadata: {
              ...(session.metadata as object),
              segmentAddedEnergyMinKwh: 5,
            },
          },
        });

        const result = await m3.validateSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          m2MedianCapacityKwh: 72,
        });

        expect(result.persisted).toBe(false);
        const m3Count = await prisma.hvCapacityObservation.count({
          where: { chargeSessionId: session.id, method: HV_M3_CAPACITY_METHOD },
        });
        expect(m3Count).toBe(0);
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    });

    it('resamples M2/M3 after evidence fingerprint drift without leaving duplicate M3 rows', async () => {
      const { org, vehicle, session, endAt } = await seedSession();
      try {
        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        });

        const extendedEnd = new Date(endAt.getTime() + 60 * 60 * 1000);
        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: {
            endAt: extendedEnd,
            endSocPercent: 85,
            endEnergyKwh: 61,
            energyAddedKwh: 40,
            deltaSocPercent: 55,
            metadata: {
              ...(session.metadata as object),
              m2CapacitySummary: null,
              m3Validation: null,
              shadowEvidenceFingerprint: null,
            },
          },
        });

        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        });

        const m3Rows = await prisma.hvCapacityObservation.findMany({
          where: { chargeSessionId: session.id, method: HV_M3_CAPACITY_METHOD },
        });
        expect(m3Rows).toHaveLength(1);
        expect(m3Rows[0].deltaSocPercent).toBe(55);
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    });

    it('concurrent shadow workers remain idempotent for one session', async () => {
      const { org, vehicle, session } = await seedSession();
      try {
        const workers = await Promise.allSettled(
          Array.from({ length: 3 }, () =>
            shadow.recomputeM2ForSession({
              organizationId: org.id,
              vehicleId: vehicle.id,
              chargeSessionId: session.id,
              samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
            }),
          ),
        );
        const rejected = workers.filter(
          (worker): worker is PromiseRejectedResult => worker.status === 'rejected',
        );
        if (rejected.length > 0) {
          throw new Error(
            rejected.map((worker) => String(worker.reason)).join(' | '),
          );
        }

        const m2Count = await prisma.hvCapacityObservation.count({
          where: {
            chargeSessionId: session.id,
            method: HV_M2_CAPACITY_METHOD,
            modelVersion: HV_M2_MODEL_VERSION,
          },
        });
        const m3Count = await prisma.hvCapacityObservation.count({
          where: { chargeSessionId: session.id, method: HV_M3_CAPACITY_METHOD },
        });
        expect(m2Count).toBe(TESLA_AUDIT_M2_SESSION_4_SAMPLES.length);
        expect(m3Count).toBe(1);
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    });

    it('persists refreshed cross-session and SOH assessments when M2 evidence changes at same endAt', async () => {
      const suffix = randomUUID().slice(0, 8);
      const org = await prisma.organization.create({
        data: {
          companyName: `HV P1 cross ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          vin: `X${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `X-${suffix}`.slice(0, 12),
          make: 'Tesla',
          model: 'M3',
          year: 2024,
          fuelType: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      await seedReferenceCapacity(org.id, vehicle.id);

      const sessionEnds = [
        new Date('2026-10-14T21:00:00.000Z'),
        new Date('2026-10-15T21:00:00.000Z'),
        new Date('2026-10-16T21:00:00.000Z'),
      ];
      const sampleSets = [
        TESLA_AUDIT_M2_SESSION_3_SAMPLES,
        TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        TESLA_AUDIT_M2_SESSION_3_SAMPLES,
      ];

      const sessions = await Promise.all(
        sessionEnds.map((endAt, index) =>
          seedQualifiedSession({
            orgId: org.id,
            vehicleId: vehicle.id,
            suffix: `${suffix}-${index}`,
            endAt,
            socStart: 28 + index * 3,
            socEnd: 78 + index * 2,
          }),
        ),
      );

      try {
        for (let i = 0; i < sessions.length; i += 1) {
          await shadow.recomputeM2ForSession({
            organizationId: org.id,
            vehicleId: vehicle.id,
            chargeSessionId: sessions[i].id,
            samplesOverride: sampleSets[i],
          });
        }

        const crossBefore = await prisma.batteryAssessment.findMany({
          where: {
            vehicleId: vehicle.id,
            type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
          },
          orderBy: { createdAt: 'asc' },
        });
        const sohBefore = await prisma.batteryAssessment.findMany({
          where: {
            vehicleId: vehicle.id,
            type: BatteryAssessmentType.HV_SOH_CAPACITY_ESTIMATE,
          },
          orderBy: { createdAt: 'asc' },
        });
        expect(crossBefore.length).toBeGreaterThanOrEqual(1);
        expect(sohBefore.length).toBeGreaterThanOrEqual(1);
        const crossKeyBefore = crossBefore[crossBefore.length - 1].idempotencyKey;
        const sohKeyBefore = sohBefore[sohBefore.length - 1].idempotencyKey;
        const crossMedianBefore = crossBefore[crossBefore.length - 1].scoreValue;

        const target = sessions[2];
        const targetRow = await prisma.hvChargeSession.findUnique({ where: { id: target.id } });
        expect(targetRow?.endAt?.toISOString()).toBe(sessionEnds[2].toISOString());

        await prisma.hvChargeSession.update({
          where: { id: target.id },
          data: {
            endEnergyKwh: (targetRow?.endEnergyKwh ?? 44) + 1.2,
            energyAddedKwh: (targetRow?.energyAddedKwh ?? 28) + 1.2,
          },
        });

        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: target.id,
          samplesOverride: scaleSampleEnergy(TESLA_AUDIT_M2_SESSION_3_SAMPLES, 1.06),
        });

        const crossAfter = await prisma.batteryAssessment.findMany({
          where: {
            vehicleId: vehicle.id,
            type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
          },
          orderBy: { createdAt: 'asc' },
        });
        const sohAfter = await prisma.batteryAssessment.findMany({
          where: {
            vehicleId: vehicle.id,
            type: BatteryAssessmentType.HV_SOH_CAPACITY_ESTIMATE,
          },
          orderBy: { createdAt: 'asc' },
        });

        expect(crossAfter.length).toBeGreaterThan(crossBefore.length);
        expect(crossAfter[crossAfter.length - 1].idempotencyKey).not.toBe(crossKeyBefore);
        expect(sohAfter.length).toBeGreaterThan(sohBefore.length);
        expect(sohAfter[sohAfter.length - 1].idempotencyKey).not.toBe(sohKeyBefore);
        expect(crossAfter[crossAfter.length - 1].scoreValue).not.toBe(crossMedianBefore);

        const refreshedMeta = await prisma.hvChargeSession.findUnique({
          where: { id: target.id },
          select: { metadata: true, endAt: true },
        });
        expect(refreshedMeta?.endAt?.toISOString()).toBe(sessionEnds[2].toISOString());
        const meta = refreshedMeta?.metadata as Record<string, unknown>;
        expect(meta?.m2CapacitySummary).toBeTruthy();
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    }, 120_000);

    it('fail-closed resample leaves metadata cleared and prior observations when transaction aborts', async () => {
      const { org, vehicle, session, endAt } = await seedSession();
      await seedReferenceCapacity(org.id, vehicle.id);
      try {
        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        });

        const beforeCount = await prisma.hvCapacityObservation.count({
          where: {
            chargeSessionId: session.id,
            method: HV_M2_CAPACITY_METHOD,
          },
        });
        expect(beforeCount).toBe(TESLA_AUDIT_M2_SESSION_4_SAMPLES.length);

        const sessionRow = await prisma.hvChargeSession.findUnique({ where: { id: session.id } });
        const metadata = (sessionRow?.metadata ?? {}) as Record<string, unknown>;
        expect(metadata.m2CapacitySummary).toBeTruthy();

        const observedAt = new Date(endAt.getTime() - 60_000);
        const baseCreate = {
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          method: HV_M2_CAPACITY_METHOD,
          estimatedCapacityKwh: 54,
          referenceCapacityKwh: TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: HV_M2_MODEL_VERSION,
          observedAt,
          idempotencyKey: buildHvCapacityObservationIdempotencyKey({
            chargeSessionId: session.id,
            observedAt,
          }),
          metadata: withHvCapacityShadowMetadata({
            socPercent: 50,
            currentEnergyKwh: 28,
            timestampDeltaMs: 0,
            preferredSocBand: true,
            outlier: false,
            gateReasonCodes: [],
            sessionMedianKwh: 54,
          }),
        };

        await expect(
          observations.resampleSessionM2ObservationsTransactional({
            sessionId: session.id,
            chargeSessionId: session.id,
            metadata: metadata as never,
            creates: [
              baseCreate,
              {
                ...baseCreate,
                chargeSessionId: '00000000-0000-0000-0000-000000000000',
                idempotencyKey: `${baseCreate.idempotencyKey}:abort`,
                observedAt: new Date(endAt.getTime() - 30_000),
              },
            ],
          }),
        ).rejects.toThrow();

        const afterCount = await prisma.hvCapacityObservation.count({
          where: {
            chargeSessionId: session.id,
            method: HV_M2_CAPACITY_METHOD,
          },
        });
        expect(afterCount).toBe(beforeCount);

        const afterSession = await prisma.hvChargeSession.findUnique({ where: { id: session.id } });
        const afterMeta = (afterSession?.metadata ?? {}) as Record<string, unknown>;
        expect(afterMeta.m2CapacitySummary).toBeFalsy();
        expect(afterMeta.m3Validation).toBeFalsy();
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    }, 60_000);

    it('preserves shadow artifacts when session endAt unchanged (no fingerprint drift)', async () => {
      const { org, vehicle, session, startAt, endAt } = await seedSession();
      try {
        const fingerprint = buildHvCapacityShadowEvidenceFingerprint({
          startAt,
          endAt,
          startSocPercent: 30,
          endSocPercent: 80,
          startEnergyKwh: 21,
          endEnergyKwh: 57,
          energyAddedKwh: 36,
          deltaSocPercent: 50,
          segmentAddedEnergyMinKwh: 0,
        });

        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        });

        const before = await prisma.hvCapacityObservation.count({
          where: { chargeSessionId: session.id },
        });

        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: {
            metadata: {
              ...(session.metadata as object),
              shadowEvidenceFingerprint: fingerprint,
              reconcileVersion: 2,
            },
          },
        });

        await shadow.recomputeM2ForSession({
          organizationId: org.id,
          vehicleId: vehicle.id,
          chargeSessionId: session.id,
          samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
        });

        const after = await prisma.hvCapacityObservation.count({
          where: { chargeSessionId: session.id },
        });
        expect(after).toBe(before);
      } finally {
        await cleanup(vehicle.id, org.id);
      }
    });
  },
);
