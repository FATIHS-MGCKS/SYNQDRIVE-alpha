import { Test } from '@nestjs/testing';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { resolveBatteryPolicy } from '../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from './battery-v2-domain';
import { BatteryPublicationRepository } from './battery-publication.repository';
import { BatteryPublicationService } from './battery-publication.service';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2PublicationEnabled: jest.fn().mockReturnValue(true),
}));

describe('BatteryPublicationService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const assessmentId = 'assessment-1';
  const now = new Date('2026-07-16T12:00:00.000Z');

  let service: BatteryPublicationService;
  let persistMock: jest.Mock;
  let supersedeMock: jest.Mock;

  beforeEach(async () => {
    persistMock = jest.fn().mockResolvedValue({ id: 'pub-new' });
    supersedeMock = jest.fn().mockResolvedValue({ id: 'pub-old' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BatteryPublicationService,
        {
          provide: BatteryPolicyProfileService,
          useValue: {
            resolveForVehicle: jest.fn().mockResolvedValue(
              resolveBatteryPolicy({
                driveProfile: BatteryDriveProfile.ICE,
                chemistry: BatteryChemistry.AGM,
                lvSignalPresent: true,
              }),
            ),
          },
        },
        {
          provide: BatteryPublicationRepository,
          useValue: {
            findAssessmentById: jest.fn().mockResolvedValue({
              id: assessmentId,
              modelVersion: 1,
              scoreValue: 82,
              confidence: 'HIGH',
              evidenceStrength: 'PRIMARY',
              dataQuality: 'ESTIMATED',
              validFrom: new Date('2026-07-01T08:00:00.000Z'),
              validUntil: new Date('2026-08-15T08:00:00.000Z'),
              computedAt: now,
              idempotencyKey: 'assess-key',
              inputSummary: {
                assessmentTrack: 'TELEMETRY',
                assessmentMode: 'CANONICAL',
                confidenceScore: 0.85,
                publicationEligible: true,
                measurementCoverage: {
                  selectedCount: 6,
                  rejectedCount: 0,
                  restMeasurementCount: 6,
                  startProxyCount: 0,
                  workshopMeasurementCount: 0,
                  shadowExperimentalCount: 0,
                  weightedInputCount: 6,
                  coverageRatio: 1,
                },
                selectedMeasurementIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
                firstEvidenceObservedAt: new Date(
                  now.getTime() - 15 * 24 * 60 * 60_000,
                ).toISOString(),
              },
            }),
            findLatestActiveLvPublication: jest.fn().mockResolvedValue(null),
            toPublicationPreviousState: jest.fn().mockReturnValue(null),
            assessmentToEstimatedHealthModel: jest.fn().mockImplementation(
              (row) => ({
                assessmentType: 'LV_ESTIMATED_HEALTH',
                scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
                assessmentTrack: row.inputSummary.assessmentTrack,
                assessmentMode: row.inputSummary.assessmentMode,
                modelVersion: row.modelVersion,
                estimatedHealthScore: row.scoreValue,
                confidence: row.confidence,
                confidenceScore: row.inputSummary.confidenceScore,
                evidenceStrength: row.evidenceStrength,
                dataQuality: row.dataQuality,
                measurementCoverage: row.inputSummary.measurementCoverage,
                validFrom: row.validFrom.toISOString(),
                validUntil: row.validUntil.toISOString(),
                publicationEligible: true,
                reasons: [],
                idempotencyKey: row.idempotencyKey,
                inputSummary: row.inputSummary,
              }),
            ),
            persistLvPublication: persistMock,
            markPublicationSuperseded: supersedeMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BatteryPublicationService);
  });

  it('persists a stable LV publication when gates pass', async () => {
    const result = await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId,
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.decision.maturity).toBe('STABLE');
    expect(result.decision.userFacingPublished).toBe(true);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(result.persistedPublicationId).toBe('pub-new');
  });
});
