import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { fetchRestAssessmentHandoffReconcileCandidates } from './lv-rest-assessment-handoff-reconciliation.query';
import { buildCanonicalLvAssessmentHandoffJobKey } from './lv-rest-assessment-handoff.policy';
import { LV_REST_ASSESSMENT_HANDOFF_STATUS } from './lv-rest-assessment-handoff.metadata';

const LIVE = process.env.BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION === '1';

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
  'lv-rest-assessment-handoff reconciliation SQL (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let organizationId = '';
    let vehicleId = '';
    let fixtureAId = '';
    let fixtureBId = '';
    let fixtureCId = '';
    let fixtureDId = '';
    let fixtureOrderEarlyId = '';
    let fixtureOrderLateId = '';

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1 requires DATABASE_URL to be set',
        );
      }
      const dbOk = await probeDatabase();
      if (!dbOk) {
        throw new Error(
          'BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1 requires a reachable PostgreSQL DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      if (prisma) {
        await prisma.$disconnect().catch(() => undefined);
      }
    });

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const observedAt = new Date();

      const org = await prisma.organization.create({
        data: {
          companyName: `Handoff Reconcile SQL Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;

      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId,
          licensePlate: `HR-${suffix}`,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'HandoffSQL',
          year: 2024,
          fuelType: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      vehicleId = vehicle.id;

      const createSessionWithMeasurement = async (input: {
        label: string;
        measurementType: BatteryMeasurementType;
        targetKey: 'REST_60M' | 'REST_6H';
        provenance: Record<string, unknown> | null;
        handoff?: Record<string, unknown> | null;
      }) => {
        const session = await prisma.batteryMeasurementSession.create({
          data: {
            organizationId,
            vehicleId,
            scope: BatteryEvidenceScope.LV,
            type: BatteryMeasurementSessionType.LV_REST_WINDOW,
            status: BatteryMeasurementSessionStatus.COMPLETED,
            startedAt: observedAt,
            endedAt: observedAt,
            idempotencyKey: `session-${input.label}-${suffix}`,
            metadata: {
              scheduledTargets: {
                [input.targetKey]: {
                  idempotencyKey: `rest-${input.label}-${suffix}`,
                  scheduledFor: observedAt.toISOString(),
                  status: 'COMPLETED',
                  ...(input.handoff ? { assessmentHandoff: input.handoff } : {}),
                },
              },
            } as Prisma.InputJsonValue,
          },
        });

        const measurement = await prisma.batteryMeasurement.create({
          data: {
            organizationId,
            vehicleId,
            sessionId: session.id,
            scope: BatteryEvidenceScope.LV,
            type: input.measurementType,
            quality: BatteryMeasurementQuality.SHADOW,
            observedAt,
            idempotencyKey: `measurement-${input.label}-${suffix}`,
            provenance: (input.provenance ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

        return measurement.id;
      };

      fixtureAId = await createSessionWithMeasurement({
        label: 'eligible-60m',
        measurementType: BatteryMeasurementType.REST_60M,
        targetKey: 'REST_60M',
        provenance: { sourceObservationId: `obs-a-${suffix}` },
        handoff: {
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
          measurementId: 'pending',
          idempotencyKey: 'pending',
        },
      });

      fixtureBId = await createSessionWithMeasurement({
        label: 'eligible-6h',
        measurementType: BatteryMeasurementType.REST_6H,
        targetKey: 'REST_6H',
        provenance: { sourceObservationId: `obs-b-${suffix}` },
        handoff: {
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
          measurementId: 'pending-b',
          idempotencyKey: 'pending-b',
          lastAttemptAt: null,
        },
      });

      const executedMeasurementId = await createSessionWithMeasurement({
        label: 'executed-60m',
        measurementType: BatteryMeasurementType.REST_60M,
        targetKey: 'REST_60M',
        provenance: { sourceObservationId: `obs-c-${suffix}` },
        handoff: null,
      });
      fixtureCId = executedMeasurementId;
      const executedSession = await prisma.batteryMeasurement.findFirst({
        where: { id: executedMeasurementId },
        select: { sessionId: true },
      });
      const executedKey = buildCanonicalLvAssessmentHandoffJobKey({
        vehicleId,
        measurementId: executedMeasurementId,
      });
      if (executedSession?.sessionId) {
        await prisma.batteryMeasurementSession.update({
          where: { id: executedSession.sessionId },
          data: {
            metadata: {
              scheduledTargets: {
                REST_60M: {
                  idempotencyKey: `rest-executed-${suffix}`,
                  scheduledFor: observedAt.toISOString(),
                  status: 'COMPLETED',
                  assessmentHandoff: {
                    status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
                    measurementId: executedMeasurementId,
                    idempotencyKey: executedKey,
                    executedAt: observedAt.toISOString(),
                    lastAttemptAt: observedAt.toISOString(),
                  },
                },
              },
            } as Prisma.InputJsonValue,
          },
        });
      }

      fixtureDId = await createSessionWithMeasurement({
        label: 'no-source-observation',
        measurementType: BatteryMeasurementType.REST_60M,
        targetKey: 'REST_60M',
        provenance: { syntheticMissed: true },
        handoff: {
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
          measurementId: 'pending-d',
          idempotencyKey: 'pending-d',
        },
      });

      fixtureOrderLateId = await createSessionWithMeasurement({
        label: 'order-late',
        measurementType: BatteryMeasurementType.REST_60M,
        targetKey: 'REST_60M',
        provenance: { sourceObservationId: `obs-late-${suffix}` },
        handoff: {
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
          measurementId: 'pending-late',
          idempotencyKey: 'pending-late',
          lastAttemptAt: '2026-09-01T12:00:00.000Z',
        },
      });

      fixtureOrderEarlyId = await createSessionWithMeasurement({
        label: 'order-early',
        measurementType: BatteryMeasurementType.REST_60M,
        targetKey: 'REST_60M',
        provenance: { sourceObservationId: `obs-early-${suffix}` },
        handoff: {
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
          measurementId: 'pending-early',
          idempotencyKey: 'pending-early',
          lastAttemptAt: null,
        },
      });
    }, 30_000);

    afterEach(async () => {
      if (!organizationId) return;
      await prisma.batteryMeasurement.deleteMany({ where: { vehicleId } });
      await prisma.batteryMeasurementSession.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      organizationId = '';
      vehicleId = '';
    }, 30_000);

    it('selects eligible incomplete candidates and excludes EXECUTED / ineligible rows', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 3600_000);
      const rows = await fetchRestAssessmentHandoffReconcileCandidates(prisma as never, {
        lookbackFrom,
        limit: 200,
      });
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(fixtureAId);
      expect(ids).toContain(fixtureBId);
      expect(ids).not.toContain(fixtureCId);
      expect(ids).not.toContain(fixtureDId);
    });

    it('orders never-inspected candidates before previously inspected ones', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 3600_000);
      const rows = await fetchRestAssessmentHandoffReconcileCandidates(prisma as never, {
        lookbackFrom,
        limit: 200,
      });
      const ids = rows.map((row) => row.id);
      const earlyIndex = ids.indexOf(fixtureOrderEarlyId);
      const lateIndex = ids.indexOf(fixtureOrderLateId);

      expect(earlyIndex).toBeGreaterThanOrEqual(0);
      expect(lateIndex).toBeGreaterThanOrEqual(0);
      expect(earlyIndex).toBeLessThan(lateIndex);
    });
  },
);
