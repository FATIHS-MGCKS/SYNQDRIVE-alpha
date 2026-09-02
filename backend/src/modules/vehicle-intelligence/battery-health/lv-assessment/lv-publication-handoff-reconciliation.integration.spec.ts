import {
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  BatteryEvidenceScope,
  BatteryEvidenceStrength,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { fetchPublicationHandoffReconcileCandidates } from './lv-publication-handoff-reconciliation.query';
import { LV_PUBLICATION_HANDOFF_STATUS } from './lv-publication-handoff.metadata';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';

const LIVE = process.env.BATTERY_V2_PUB_HANDOFF_RECONCILE_INTEGRATION === '1';

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
  'lv-publication-handoff reconciliation SQL (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let organizationId = '';
    let vehicleId = '';
    let missingId = '';
    let enqueuedId = '';
    let executedId = '';
    let wrongTypeId = '';
    let nonLvId = '';
    let orderEarlyId = '';
    let orderLateId = '';

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'BATTERY_V2_PUB_HANDOFF_RECONCILE_INTEGRATION=1 requires DATABASE_URL to be set',
        );
      }
      const dbOk = await probeDatabase();
      if (!dbOk) {
        throw new Error(
          'BATTERY_V2_PUB_HANDOFF_RECONCILE_INTEGRATION=1 requires a reachable PostgreSQL DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      if (prisma) {
        await prisma.$disconnect().catch(() => undefined);
      }
    });

    const createAssessment = async (input: {
      label: string;
      type?: BatteryAssessmentType;
      scope?: BatteryEvidenceScope;
      track?: string;
      mode?: string;
      handoff?: Record<string, unknown> | null;
      computedAt?: Date;
    }) => {
      const observedAt = input.computedAt ?? new Date();
      return prisma.batteryAssessment.create({
        data: {
          organizationId,
          vehicleId,
          scope: input.scope ?? BatteryEvidenceScope.LV,
          type: input.type ?? BatteryAssessmentType.LV_ESTIMATED_HEALTH,
          evidenceStrength: BatteryEvidenceStrength.PRIMARY,
          maturity: BatteryAssessmentMaturity.HIGH,
          modelVersion: 1,
          computedAt: observedAt,
          idempotencyKey: `assess-${input.label}-${suffix}`,
          inputSummary: {
            assessmentTrack: input.track ?? 'TELEMETRY',
            assessmentMode: input.mode ?? 'CANONICAL',
            ...(input.handoff ? { publicationHandoff: input.handoff } : {}),
          } as Prisma.InputJsonValue,
        },
      });
    };

    let suffix = '';

    beforeEach(async () => {
      suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const anchor = Date.now();
      const computedAt = {
        missing: new Date(anchor - 1),
        enqueued: new Date(anchor - 2),
        executed: new Date(anchor - 3),
        wrongType: new Date(anchor - 4),
        nonLv: new Date(anchor - 5),
        orderLate: new Date(anchor - 6),
        orderEarly: new Date(anchor - 7),
      } as const;

      const org = await prisma.organization.create({
        data: {
          companyName: `Pub Handoff Reconcile SQL Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;

      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId,
          licensePlate: `PH-${suffix}`,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'PubHandoffSQL',
          year: 2024,
          fuelType: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      vehicleId = vehicle.id;

      const missing = await createAssessment({
        label: 'missing',
        computedAt: computedAt.missing,
        handoff: {
          status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
          selectedAssessmentId: 'pending',
          assessmentTrack: 'TELEMETRY',
          idempotencyKey: 'pending',
          publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
          epochAssessmentIds: ['pending'],
        },
      });
      missingId = missing.id;
      await prisma.batteryAssessment.update({
        where: { id: missing.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: missing.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${missing.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [missing.id],
            },
          },
        },
      });

      const enqueued = await createAssessment({
        label: 'enqueued',
        computedAt: computedAt.enqueued,
        handoff: {
          status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
          selectedAssessmentId: 'pending-e',
          assessmentTrack: 'TELEMETRY',
          idempotencyKey: 'pending-e',
          publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
          epochAssessmentIds: ['pending-e'],
          lastAttemptAt: null,
        },
      });
      enqueuedId = enqueued.id;
      await prisma.batteryAssessment.update({
        where: { id: enqueued.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
              selectedAssessmentId: enqueued.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${enqueued.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [enqueued.id],
              lastAttemptAt: null,
            },
          },
        },
      });

      const executed = await createAssessment({
        label: 'executed',
        computedAt: computedAt.executed,
      });
      executedId = executed.id;
      await prisma.batteryAssessment.update({
        where: { id: executed.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
              selectedAssessmentId: executed.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${executed.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [executed.id],
              lastAttemptAt: executed.computedAt.toISOString(),
            },
          },
        },
      });

      const wrongType = await createAssessment({
        label: 'shadow',
        computedAt: computedAt.wrongType,
        mode: 'SHADOW',
      });
      wrongTypeId = wrongType.id;
      await prisma.batteryAssessment.update({
        where: { id: wrongType.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'SHADOW',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: wrongType.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${wrongType.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [wrongType.id],
            },
          },
        },
      });

      const nonLv = await createAssessment({
        label: 'hv',
        computedAt: computedAt.nonLv,
        scope: BatteryEvidenceScope.HV,
        type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
      });
      nonLvId = nonLv.id;
      await prisma.batteryAssessment.update({
        where: { id: nonLv.id },
        data: {
          inputSummary: {
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: nonLv.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${nonLv.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [nonLv.id],
            },
          },
        },
      });

      const orderEarly = await createAssessment({
        label: 'order-early',
        computedAt: computedAt.orderEarly,
      });
      orderEarlyId = orderEarly.id;
      await prisma.batteryAssessment.update({
        where: { id: orderEarly.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
              selectedAssessmentId: orderEarly.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${orderEarly.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [orderEarly.id],
              lastAttemptAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      });

      const orderLate = await createAssessment({
        label: 'order-late',
        computedAt: computedAt.orderLate,
      });
      orderLateId = orderLate.id;
      await prisma.batteryAssessment.update({
        where: { id: orderLate.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: orderLate.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${orderLate.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [orderLate.id],
              lastAttemptAt: null,
            },
          },
        },
      });
    });

    it('includes incomplete MISSING and ENQUEUED candidates with correct mapping', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const rows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(missingId);
      expect(ids).toContain(enqueuedId);
      expect(ids).not.toContain(executedId);
      expect(ids).not.toContain(nonLvId);

      const missingRow = rows.find((row) => row.id === missingId);
      expect(missingRow?.organizationId).toBe(organizationId);
      expect(missingRow?.vehicleId).toBe(vehicleId);
      const handoff = (missingRow?.inputSummary as Record<string, unknown>)
        ?.publicationHandoff as Record<string, unknown>;
      expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.MISSING);
      expect(Array.isArray(handoff?.epochAssessmentIds)).toBe(true);
    });

    it('orders NULLS FIRST then oldest lastAttemptAt', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const rows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const subset = rows.filter((row) =>
        [orderEarlyId, orderLateId, enqueuedId].includes(row.id),
      );
      const lateIndex = subset.findIndex((row) => row.id === orderLateId);
      const earlyIndex = subset.findIndex((row) => row.id === orderEarlyId);
      expect(lateIndex).toBeGreaterThanOrEqual(0);
      expect(earlyIndex).toBeGreaterThanOrEqual(0);
      expect(lateIndex).toBeLessThan(earlyIndex);
    });
  },
);
