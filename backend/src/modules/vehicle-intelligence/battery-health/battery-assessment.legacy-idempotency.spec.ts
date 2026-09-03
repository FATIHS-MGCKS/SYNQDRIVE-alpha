import { BatteryAssessmentRepository } from './battery-assessment.repository';
import {
  buildLegacyLvEstimatedHealthAssessmentIdempotencyKey,
  buildLvEstimatedHealthAssessmentIdempotencyKey,
} from './lv-assessment/lv-estimated-health-assessment.policy';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import { BatteryEvidenceStrength } from './battery-v2-domain';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function assessmentForFingerprint(evidenceFingerprint: string): LvEstimatedHealthAssessment {
  return {
    assessmentType: 'LV_ESTIMATED_HEALTH',
    scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
    assessmentTrack: 'TELEMETRY',
    assessmentMode: 'CANONICAL',
    modelVersion: 1,
    estimatedHealthScore: 80,
    confidence: 'HIGH',
    confidenceScore: 0.9,
    evidenceStrength: BatteryEvidenceStrength.SUPPLEMENTARY,
    dataQuality: 'ESTIMATED',
    measurementCoverage: {
      selectedCount: 2,
      rejectedCount: 0,
      restMeasurementCount: 2,
      startProxyCount: 0,
      workshopMeasurementCount: 0,
      shadowExperimentalCount: 0,
      weightedInputCount: 2,
      coverageRatio: 1,
    },
    validFrom: '2026-09-03T08:00:00.000Z',
    validUntil: null,
    publicationEligible: true,
    reasons: [],
    idempotencyKey: buildLvEstimatedHealthAssessmentIdempotencyKey({
      vehicleId: VEH,
      assessmentTrack: 'TELEMETRY',
      assessmentMode: 'CANONICAL',
      evidenceFingerprint,
    }),
    inputSummary: {
      evidenceFingerprint,
      selectedMeasurementIds: ['meas-a', 'meas-b'],
      rejectedMeasurementIds: [],
    },
  };
}

describe('BatteryAssessmentRepository legacy idempotency compatibility', () => {
  const evidenceFingerprint = 'CANONICAL:TELEMETRY:meas-a|meas-b';
  const legacyKey = buildLegacyLvEstimatedHealthAssessmentIdempotencyKey({
    vehicleId: VEH,
    assessmentTrack: 'TELEMETRY',
    assessmentMode: 'CANONICAL',
    evidenceFingerprint,
  });
  const digestAssessment = assessmentForFingerprint(evidenceFingerprint);

  it('returns existing legacy-row via legacy key lookup before creating digest duplicate', async () => {
    const legacyRow = { id: 'legacy-row-id', idempotencyKey: legacyKey };
    const prisma = {
      batteryAssessment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(legacyRow),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const repository = new BatteryAssessmentRepository(prisma as never);

    const existing = await repository.findExistingLvEstimatedHealthByCanonicalIdentity({
      organizationId: ORG,
      vehicleId: VEH,
      assessment: digestAssessment,
    });

    expect(existing).toBe(legacyRow);
    expect(prisma.batteryAssessment.create).not.toHaveBeenCalled();
  });

  it('persistLvEstimatedHealth reuses legacy row instead of inserting digest-key duplicate', async () => {
    const legacyRow = { id: 'legacy-row-id', idempotencyKey: legacyKey };
    const prisma = {
      batteryAssessment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(legacyRow),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const repository = new BatteryAssessmentRepository(prisma as never);

    const persisted = await repository.persistLvEstimatedHealth({
      organizationId: ORG,
      vehicleId: VEH,
      assessment: digestAssessment,
    });

    expect(persisted).toBe(legacyRow);
    expect(prisma.batteryAssessment.create).not.toHaveBeenCalled();
  });
});
