import {
  BatteryEvidenceScope,
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  PrismaClient,
} from '@prisma/client';
import { BatteryAssessmentRepository } from './battery-assessment.repository';
import {
  buildLegacyLvEstimatedHealthAssessmentIdempotencyKey,
  buildLvEstimatedHealthAssessmentIdempotencyKey,
  LV_ASSESSMENT_LEGACY_IDEMPOTENCY_KEY_UNSAFE_BYTES,
} from './lv-assessment/lv-estimated-health-assessment.policy';
import { LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION } from './lv-assessment/lv-assessment-thresholds';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import { BatteryEvidenceStrength } from './battery-v2-domain';
import { BatteryEvidenceStrength as PrismaBatteryEvidenceStrength } from '@prisma/client';

const LIVE = process.env.BATTERY_V2_ASSESSMENT_PERSISTENCE_INTEGRATION === '1';

async function probeDatabase(): Promise<{ ok: boolean; version?: string }> {
  if (!process.env.DATABASE_URL) return { ok: false };
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    return { ok: true, version: rows[0]?.version };
  } catch {
    return { ok: false };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function buildLargeFingerprint(): string {
  const manyIds = Array.from({ length: 80 }, (_, index) =>
    `aaaaaaaa-bbbb-cccc-dddd-${String(index).padStart(12, '0')}`,
  ).join('|');
  return `CANONICAL:TELEMETRY:${manyIds}`;
}

function buildRepresentativeAssessment(input: {
  vehicleId: string;
  evidenceFingerprint: string;
}): LvEstimatedHealthAssessment {
  const selectedMeasurementIds = input.evidenceFingerprint
    .split(':')
    .at(-1)!
    .split('|')
    .filter(Boolean);
  const rejectedMeasurementIds = ['rejected-meas-1', 'rejected-meas-2'];
  return {
    assessmentType: 'LV_ESTIMATED_HEALTH',
    scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
    assessmentTrack: 'TELEMETRY',
    assessmentMode: 'CANONICAL',
    modelVersion: LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION,
    estimatedHealthScore: 72,
    confidence: 'MEDIUM',
    confidenceScore: 0.62,
    evidenceStrength: BatteryEvidenceStrength.SUPPLEMENTARY,
    dataQuality: 'ESTIMATED',
    measurementCoverage: {
      selectedCount: selectedMeasurementIds.length,
      rejectedCount: rejectedMeasurementIds.length,
      restMeasurementCount: selectedMeasurementIds.length,
      startProxyCount: 0,
      workshopMeasurementCount: 0,
      shadowExperimentalCount: 0,
      weightedInputCount: selectedMeasurementIds.length,
      coverageRatio: 0.8,
    },
    validFrom: '2026-09-03T08:00:00.000Z',
    validUntil: '2026-09-10T08:00:00.000Z',
    publicationEligible: true,
    reasons: [{ code: 'score_is_not_soh', labelDe: 'Geschätzter Verhaltenszustand' }],
    idempotencyKey: buildLvEstimatedHealthAssessmentIdempotencyKey({
      vehicleId: input.vehicleId,
      assessmentTrack: 'TELEMETRY',
      assessmentMode: 'CANONICAL',
      evidenceFingerprint: input.evidenceFingerprint,
    }),
    inputSummary: {
      evidenceFingerprint: input.evidenceFingerprint,
      selectedMeasurementIds,
      rejectedMeasurementIds,
      policyProfile: 'ICE_STANDARD',
      chemistry: 'LEAD_ACID',
    },
  };
}

(LIVE ? describe : describe.skip)(
  'battery assessment persistence (real PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let repository: BatteryAssessmentRepository;
    let organizationId = '';
    let vehicleId = '';
    let dbVersion = '';

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'BATTERY_V2_ASSESSMENT_PERSISTENCE_INTEGRATION=1 requires DATABASE_URL',
        );
      }
      const probe = await probeDatabase();
      if (!probe.ok) {
        throw new Error('DATABASE_URL is not reachable for persistence integration');
      }
      dbVersion = probe.version ?? 'unknown';
      prisma = new PrismaClient();
      repository = new BatteryAssessmentRepository(prisma as never);
    }, 60_000);

    afterAll(async () => {
      if (prisma) {
        await prisma.$disconnect().catch(() => undefined);
      }
    });

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `BV2 Persist Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId,
          licensePlate: `BP-${suffix}`,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'Persist',
          year: 2024,
          fuelType: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      vehicleId = vehicle.id;
    });

    afterEach(async () => {
      if (!organizationId) return;
      await prisma.batteryAssessment.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('proves legacy raw key would exceed btree tuple limit while digest key persists', async () => {
      const evidenceFingerprint = buildLargeFingerprint();
      expect(evidenceFingerprint.length).toBeGreaterThan(
        LV_ASSESSMENT_LEGACY_IDEMPOTENCY_KEY_UNSAFE_BYTES,
      );

      const legacyKey = buildLegacyLvEstimatedHealthAssessmentIdempotencyKey({
        vehicleId,
        assessmentTrack: 'TELEMETRY',
        assessmentMode: 'CANONICAL',
        evidenceFingerprint,
      });
      expect(legacyKey.length).toBeGreaterThan(LV_ASSESSMENT_LEGACY_IDEMPOTENCY_KEY_UNSAFE_BYTES);

      const assessment = buildRepresentativeAssessment({ vehicleId, evidenceFingerprint });
      expect(assessment.idempotencyKey).toMatch(/:fp[a-f0-9]{64}$/);

      const created = await repository.persistLvEstimatedHealth({
        organizationId,
        vehicleId,
        assessment,
      });

      const readBack = await prisma.batteryAssessment.findUniqueOrThrow({
        where: { id: created.id },
      });
      const summary = readBack.inputSummary as Record<string, unknown>;

      expect(readBack.idempotencyKey).toBe(assessment.idempotencyKey);
      expect(readBack.scoreValue).toBe(72);
      expect(summary.evidenceFingerprint).toBe(evidenceFingerprint);
      expect(summary.selectedMeasurementIds).toEqual(
        assessment.inputSummary.selectedMeasurementIds,
      );
      expect(summary.rejectedMeasurementIds).toEqual(
        assessment.inputSummary.rejectedMeasurementIds,
      );

      const second = await repository.persistLvEstimatedHealth({
        organizationId,
        vehicleId,
        assessment,
      });
      expect(second.id).toBe(created.id);

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          postgresVersion: dbVersion,
          databaseUrlHost: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'isolated',
          fixtureOrganizationId: organizationId,
        }),
      );
    });

    it('reuses existing legacy-key row when same evidence is persisted under digest key', async () => {
      const evidenceFingerprint = buildLargeFingerprint();
      const legacyKey = buildLegacyLvEstimatedHealthAssessmentIdempotencyKey({
        vehicleId,
        assessmentTrack: 'TELEMETRY',
        assessmentMode: 'CANONICAL',
        evidenceFingerprint,
      });
      const selectedMeasurementIds = evidenceFingerprint.split(':').at(-1)!.split('|').filter(Boolean);

      const legacyRow = await prisma.batteryAssessment.create({
        data: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: BatteryAssessmentType.LV_ESTIMATED_HEALTH,
          scoreValue: 70,
          textValue: 'ESTIMATED_HEALTH_NOT_SOH',
          confidence: 'MEDIUM',
          evidenceStrength: PrismaBatteryEvidenceStrength.SUPPLEMENTARY,
          dataQuality: 'ESTIMATED',
          maturity: BatteryAssessmentMaturity.MEDIUM,
          modelVersion: LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION,
          idempotencyKey: legacyKey,
          inputSummary: {
            evidenceFingerprint,
            selectedMeasurementIds,
            rejectedMeasurementIds: ['legacy-rejected'],
          },
        },
      });

      const digestAssessment = buildRepresentativeAssessment({ vehicleId, evidenceFingerprint });
      const persisted = await repository.persistLvEstimatedHealth({
        organizationId,
        vehicleId,
        assessment: digestAssessment,
      });

      expect(persisted.id).toBe(legacyRow.id);
      const count = await prisma.batteryAssessment.count({
        where: { organizationId, vehicleId },
      });
      expect(count).toBe(1);
    });
  },
);
