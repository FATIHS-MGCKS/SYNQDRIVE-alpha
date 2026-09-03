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
import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import { readPublicationHandoffFromAssessmentSummary } from './lv-publication-handoff.metadata';

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
      expect(ids).not.toContain(wrongTypeId);

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

    it('excludes structurally malformed handoff carriers without aborting valid discovery', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const anchor = Date.now();
      const valid = await createAssessment({
        label: 'valid-malformed-filter',
        computedAt: new Date(anchor - 1),
      });
      await prisma.batteryAssessment.update({
        where: { id: valid.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: valid.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${valid.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [valid.id],
            },
          },
        },
      });

      const malformedIds: string[] = [];
      const malformedCases = [
        {
          label: 'bad-status',
          handoff: {
            status: 'BROKEN',
            selectedAssessmentId: 'x',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:x:v1',
            publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
            epochAssessmentIds: ['x'],
          },
        },
        {
          label: 'empty-epoch',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'x',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:x:v1',
            publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
            epochAssessmentIds: [],
          },
        },
        {
          label: 'epoch-wrong-type',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'x',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:x:v1',
            publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
            epochAssessmentIds: 'not-an-array',
          },
        },
        {
          label: 'selected-mismatch',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'other-assessment',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:other:v1',
            publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
            epochAssessmentIds: ['other-assessment'],
          },
        },
        {
          label: 'version-string',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'pending',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:pending:v1',
            publicationVersion: '1',
            epochAssessmentIds: ['pending'],
          },
        },
        {
          label: 'version-fractional',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'pending',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:pending:v1',
            publicationVersion: 1.5,
            epochAssessmentIds: ['pending'],
          },
        },
        {
          label: 'version-null',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'pending',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:pending:v1',
            publicationVersion: null,
            epochAssessmentIds: ['pending'],
          },
        },
        {
          label: 'version-object',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'pending',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:pending:v1',
            publicationVersion: { major: 1 },
            epochAssessmentIds: ['pending'],
          },
        },
        {
          label: 'version-array',
          handoff: {
            status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
            selectedAssessmentId: 'pending',
            assessmentTrack: 'TELEMETRY',
            idempotencyKey: 'pub:pending:v1',
            publicationVersion: [1],
            epochAssessmentIds: ['pending'],
          },
        },
      ] as const;

      for (const [index, malformed] of malformedCases.entries()) {
        const row = await createAssessment({
          label: `malformed-${malformed.label}-${index}`,
          computedAt: new Date(anchor - 10 - index),
        });
        malformedIds.push(row.id);
        await prisma.batteryAssessment.update({
          where: { id: row.id },
          data: {
            inputSummary: {
              assessmentTrack: 'TELEMETRY',
              assessmentMode: 'CANONICAL',
              publicationHandoff: {
                ...malformed.handoff,
                selectedAssessmentId:
                  malformed.label === 'selected-mismatch'
                    ? 'other-assessment'
                    : row.id,
                idempotencyKey: `pub:${row.id}:v1`,
                epochAssessmentIds:
                  malformed.label === 'epoch-wrong-type'
                    ? malformed.handoff.epochAssessmentIds
                    : malformed.label === 'selected-mismatch'
                      ? ['other-assessment']
                      : malformed.label === 'empty-epoch'
                        ? []
                        : [row.id],
              },
            },
          },
        });
      }

      const rows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(valid.id);
      expect(ids).toContain(missingId);
      expect(ids).toContain(enqueuedId);
      for (const malformedId of malformedIds) {
        expect(ids).not.toContain(malformedId);
      }
      expect(ids).not.toContain(wrongTypeId);
    });

    it('executes safely when epochAssessmentIds has non-array legacy JSON types', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const anchor = Date.now();
      const valid = await createAssessment({
        label: 'valid-epoch-type-safety',
        computedAt: new Date(anchor - 1),
      });
      await prisma.batteryAssessment.update({
        where: { id: valid.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: valid.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${valid.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [valid.id],
            },
          },
        },
      });

      const nonArrayEpochTypes = [
        { label: 'epoch-string', value: 'not-an-array' },
        { label: 'epoch-object', value: { ids: [valid.id] } },
        { label: 'epoch-number', value: 42 },
        { label: 'epoch-boolean', value: true },
        { label: 'epoch-null', value: null },
      ] as const;

      for (const [index, epochCase] of nonArrayEpochTypes.entries()) {
        const row = await createAssessment({
          label: `epoch-type-${epochCase.label}`,
          computedAt: new Date(anchor - 10 - index),
        });
        await prisma.batteryAssessment.update({
          where: { id: row.id },
          data: {
            inputSummary: {
              assessmentTrack: 'TELEMETRY',
              assessmentMode: 'CANONICAL',
              publicationHandoff: {
                status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
                selectedAssessmentId: row.id,
                assessmentTrack: 'TELEMETRY',
                idempotencyKey: `pub:${row.id}:v1`,
                publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
                epochAssessmentIds: epochCase.value,
              },
            },
          },
        });
      }

      const rows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(valid.id);
      expect(ids).toContain(missingId);
    });

    it('keeps repairable carriers with malformed lastAttemptAt and normalizes on fairness touch', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const anchor = Date.now();
      const malformedAttempt = await createAssessment({
        label: 'bad-last-attempt-repairable',
        computedAt: new Date(anchor - 3),
      });
      await prisma.batteryAssessment.update({
        where: { id: malformedAttempt.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
              selectedAssessmentId: malformedAttempt.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${malformedAttempt.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [malformedAttempt.id],
              lastAttemptAt: 'not-a-timestamp',
            },
          },
        },
      });

      const validFresh = await createAssessment({
        label: 'valid-fresh-attempt',
        computedAt: new Date(anchor - 2),
      });
      await prisma.batteryAssessment.update({
        where: { id: validFresh.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: validFresh.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${validFresh.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [validFresh.id],
              lastAttemptAt: '2026-06-01T00:00:00.000Z',
            },
          },
        },
      });

      const rows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(malformedAttempt.id);
      expect(ids).toContain(validFresh.id);

      const subset = rows.filter((row) =>
        [malformedAttempt.id, validFresh.id].includes(row.id),
      );
      const malformedIndex = subset.findIndex((row) => row.id === malformedAttempt.id);
      const freshIndex = subset.findIndex((row) => row.id === validFresh.id);
      expect(malformedIndex).toBeGreaterThanOrEqual(0);
      expect(freshIndex).toBeGreaterThanOrEqual(0);
      expect(malformedIndex).toBeLessThan(freshIndex);

      const service = new LvPublicationHandoffService(
        prisma as never,
        { enqueue: jest.fn() } as never,
        { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
      );
      const fairnessAt = new Date('2026-09-02T12:00:00.000Z');
      await service.touchReconciliationFairness({
        organizationId,
        assessmentId: malformedAttempt.id,
        idempotencyKey: `pub:${malformedAttempt.id}:v1`,
        attemptedAt: fairnessAt,
      });

      const updated = await prisma.batteryAssessment.findFirst({
        where: { id: malformedAttempt.id },
      });
      const handoff = readPublicationHandoffFromAssessmentSummary(
        updated?.inputSummary,
      );
      expect(handoff?.lastAttemptAt).toBe(fairnessAt.toISOString());
    });

    it('does not let structurally malformed rows occupy bounded scan ahead of valid backlog', async () => {
      const lookbackFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const anchor = Date.now();
      const validLate = await createAssessment({
        label: 'valid-stress-late',
        computedAt: new Date(anchor - 200),
      });
      await prisma.batteryAssessment.update({
        where: { id: validLate.id },
        data: {
          inputSummary: {
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
            publicationHandoff: {
              status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
              selectedAssessmentId: validLate.id,
              assessmentTrack: 'TELEMETRY',
              idempotencyKey: `pub:${validLate.id}:v1`,
              publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
              epochAssessmentIds: [validLate.id],
              lastAttemptAt: null,
            },
          },
        },
      });

      const malformedIds: string[] = [];
      for (let index = 0; index < 12; index += 1) {
        const malformed = await createAssessment({
          label: `stress-malformed-${index}`,
          computedAt: new Date(anchor - index),
        });
        malformedIds.push(malformed.id);
        await prisma.batteryAssessment.update({
          where: { id: malformed.id },
          data: {
            inputSummary: {
              assessmentTrack: 'TELEMETRY',
              assessmentMode: 'CANONICAL',
              publicationHandoff: {
                status: 'CORRUPT',
                selectedAssessmentId: malformed.id,
                assessmentTrack: 'TELEMETRY',
                idempotencyKey: `pub:${malformed.id}:v1`,
                publicationVersion: 1.5,
                epochAssessmentIds: [malformed.id],
              },
            },
          },
        });
      }

      const boundedRows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 5,
      });
      const boundedIds = boundedRows.map((row) => row.id);

      for (const malformedId of malformedIds) {
        expect(boundedIds).not.toContain(malformedId);
      }
      expect(boundedIds.length).toBeGreaterThan(0);

      const fullRows = await fetchPublicationHandoffReconcileCandidates(prisma, {
        lookbackFrom,
        limit: 50,
      });
      const fullIds = fullRows.map((row) => row.id);
      expect(fullIds).toContain(validLate.id);
    });
  },
);
