import { Test } from '@nestjs/testing';
import { BatteryAssessmentRepository } from './battery-assessment.repository';
import { BatteryAssessmentService } from './battery-assessment.service';
import { BatteryMeasurementRepository } from './battery-measurement.repository';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceStrength,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from './battery-v2-domain';
import { resolveBatteryPolicy } from '../battery-policy-profile/battery-policy-profile.resolver';

describe('BatteryAssessmentService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const now = new Date('2026-07-16T12:00:00.000Z');

  let service: BatteryAssessmentService;
  let persistMock: jest.Mock;

  beforeEach(async () => {
    persistMock = jest.fn().mockResolvedValue({ id: 'assessment-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BatteryAssessmentService,
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
          provide: BatteryMeasurementRepository,
          useValue: {
            listForOrganization: jest.fn().mockResolvedValue([
              {
                id: 'meas-1',
                scope: 'LV',
                type: BatteryMeasurementType.REST_60M,
                quality: BatteryMeasurementQuality.VALID,
                observedAt: now,
                receivedAt: now,
                providerTimestamp: now,
                sessionId: 'sess-1',
                numericValue: 12.66,
                context: null,
                provenance: {
                  providerTimestamp: now.toISOString(),
                  receivedAt: now.toISOString(),
                },
              },
            ]),
          },
        },
        {
          provide: BatteryAssessmentRepository,
          useValue: {
            persistLvEstimatedHealth: persistMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BatteryAssessmentService);
  });

  it('persists a computed LV estimated-health assessment', async () => {
    const result = await service.recomputeLvEstimatedHealth({
      organizationId,
      vehicleId,
      ambientTemperatureC: 15,
      ambientTemperatureSource: 'EXTERIOR_AIR',
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0].estimatedHealthScore).not.toBeNull();
    expect(result.assessments[0].evidenceStrength).toBe(
      BatteryEvidenceStrength.PRIMARY,
    );
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(result.persistedAssessmentIds).toEqual(['assessment-1']);
  });

  it('returns missing evidence when no LV measurements exist', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BatteryAssessmentService,
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
          provide: BatteryMeasurementRepository,
          useValue: {
            listForOrganization: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: BatteryAssessmentRepository,
          useValue: {
            persistLvEstimatedHealth: persistMock,
          },
        },
      ],
    }).compile();

    const emptyService = moduleRef.get(BatteryAssessmentService);
    const result = await emptyService.recomputeLvEstimatedHealth({
      organizationId,
      vehicleId,
      now,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === 'missing_evidence')).toBe(true);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
