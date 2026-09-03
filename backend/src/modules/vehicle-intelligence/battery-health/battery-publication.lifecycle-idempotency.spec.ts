import { Test } from '@nestjs/testing';
import { BatteryPolicyProfileService } from '../battery-policy-profile/battery-policy-profile.service';
import { resolveBatteryPolicy } from '../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from './battery-v2-domain';
import { BatteryPublicationRepository } from './battery-publication.repository';
import { BatteryPublicationService } from './battery-publication.service';
import { LV_PUBLICATION_OBSERVATION_STALE_MS } from './lv-assessment/lv-publication-thresholds';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2PublicationEnabled: jest.fn().mockReturnValue(true),
}));

describe('BatteryPublicationService lifecycle idempotency (D5)', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const assessmentA = 'assessment-a';
  const assessmentB = 'assessment-b';
  const now = new Date('2026-07-16T12:00:00.000Z');
  const staleAnchor = new Date(
    now.getTime() - LV_PUBLICATION_OBSERVATION_STALE_MS - 60_000,
  ).toISOString();

  let service: BatteryPublicationService;
  let persistMock: jest.Mock;
  let materializeMock: jest.Mock;
  let findPublicationByAssessmentIdentity: jest.Mock;
  let findLatestRetainedLvPublication: jest.Mock;
  let findLatestActiveLvPublication: jest.Mock;

  const assessmentRow = {
    id: assessmentA,
    modelVersion: 1,
    scoreValue: 82,
    confidence: 'HIGH',
    evidenceStrength: 'PRIMARY',
    dataQuality: 'ESTIMATED',
    validFrom: new Date('2026-07-01T08:00:00.000Z'),
    validUntil: new Date('2026-08-15T08:00:00.000Z'),
    computedAt: now,
    idempotencyKey: 'assess-key-a',
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
      firstEvidenceObservedAt: staleAnchor,
    },
  };

  function existingPublication(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pub-a',
      assessmentId: assessmentA,
      version: 1,
      publishedAt: new Date(staleAnchor),
      reason: JSON.stringify({
        maturity: 'STABLE',
        publishedEstimatedHealth: 82,
        stabilizedEstimatedHealth: 82,
        assessmentTrack: 'TELEMETRY',
        assessmentEvidenceObservedAt: staleAnchor,
        ...overrides,
      }),
    };
  }

  let markSupersededMock: jest.Mock;

  beforeEach(async () => {
    persistMock = jest.fn().mockResolvedValue({ id: 'pub-new' });
    materializeMock = jest.fn().mockResolvedValue({ id: 'pub-a' });
    markSupersededMock = jest.fn().mockResolvedValue({ id: 'pub-a' });
    findPublicationByAssessmentIdentity = jest
      .fn()
      .mockResolvedValue(existingPublication());
    findLatestRetainedLvPublication = jest
      .fn()
      .mockResolvedValue(existingPublication());
    findLatestActiveLvPublication = jest
      .fn()
      .mockResolvedValue(existingPublication());

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
            findAssessmentById: jest.fn().mockResolvedValue(assessmentRow),
            findLatestActiveLvPublication,
            findLatestRetainedLvPublication,
            findPublicationByAssessmentIdentity,
            findPublicationById: jest.fn(),
            toPublicationPreviousState: jest.fn().mockImplementation((row) => {
              if (!row) return null;
              const payload = JSON.parse(row.reason);
              return {
                publicationId: row.id,
                assessmentId: row.assessmentId,
                assessmentTrack: payload.assessmentTrack,
                publishedEstimatedHealth: payload.publishedEstimatedHealth,
                stabilizedEstimatedHealth: payload.stabilizedEstimatedHealth,
                maturity: payload.maturity,
                publishedAt: row.publishedAt.toISOString(),
                assessmentEvidenceObservedAt: payload.assessmentEvidenceObservedAt,
              };
            }),
            assessmentToEstimatedHealthModel: jest.fn().mockImplementation((row) => ({
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
            })),
            persistLvPublication: persistMock,
            materializePublicationLifecycleState: materializeMock,
            markPublicationSuperseded: markSupersededMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BatteryPublicationService);
  });

  it('TEST 1: pub:A:v1 STABLE + same A stale → materializes STALE without v2', async () => {
    const result = await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentA,
      publicationVersion: 1,
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.persistedPublicationId).toBe('pub-a');
    expect(persistMock).not.toHaveBeenCalled();
    expect(materializeMock).toHaveBeenCalledTimes(1);
    expect(materializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId: 'pub-a',
        assessmentId: assessmentA,
        decision: expect.objectContaining({ maturity: 'STALE' }),
      }),
    );
  });

  it('TEST 2: pub:A:v1 already STALE + same A retry → idempotent convergence', async () => {
    findPublicationByAssessmentIdentity.mockResolvedValue(
      existingPublication({ maturity: 'STALE' }),
    );
    findLatestRetainedLvPublication.mockResolvedValue(
      existingPublication({ maturity: 'STALE' }),
    );
    findLatestActiveLvPublication.mockResolvedValue(
      existingPublication({ maturity: 'STALE' }),
    );

    const result = await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentA,
      publicationVersion: 1,
      now,
    });

    expect(result.ok).toBe(true);
    expect(materializeMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('TEST 3: previous A stale + current B → STALE(A) not under B identity', async () => {
    findPublicationByAssessmentIdentity.mockResolvedValue(null);
    findLatestRetainedLvPublication.mockResolvedValue(
      existingPublication({ assessmentId: assessmentA }),
    );
    findLatestActiveLvPublication.mockResolvedValue(
      existingPublication({ assessmentId: assessmentA }),
    );

    const assessmentBRow = {
      ...assessmentRow,
      id: assessmentB,
      idempotencyKey: 'assess-key-b',
      inputSummary: {
        ...assessmentRow.inputSummary,
        assessmentTrack: 'WORKSHOP_OVERRIDE',
      },
    };

    const repo = (service as unknown as { publicationRepository: BatteryPublicationRepository })
      .publicationRepository;
    (repo.findAssessmentById as jest.Mock).mockResolvedValue(assessmentBRow);

    await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentB,
      publicationVersion: 1,
      now,
    });

    expect(materializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: assessmentA,
        decision: expect.objectContaining({ maturity: 'STALE' }),
      }),
    );
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({ assessmentId: assessmentB }),
    );
  });

  it('TEST 4: same A retry while still fresh → no lifecycle write', async () => {
    const freshPublication = existingPublication();
    freshPublication.publishedAt = new Date(now.getTime() - 60_000);
    freshPublication.reason = JSON.stringify({
      maturity: 'STABLE',
      publishedEstimatedHealth: 82,
      stabilizedEstimatedHealth: 82,
      assessmentTrack: 'TELEMETRY',
      assessmentEvidenceObservedAt: now.toISOString(),
    });
    findPublicationByAssessmentIdentity.mockResolvedValue(freshPublication);
    findLatestRetainedLvPublication.mockResolvedValue(freshPublication);
    findLatestActiveLvPublication.mockResolvedValue(freshPublication);

    await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentA,
      publicationVersion: 1,
      now,
    });

    expect(materializeMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('TEST 5: first-creation supersession materializes STALE(A) then pub:B:v1', async () => {
    const pubA = existingPublication({ assessmentId: assessmentA });
    findPublicationByAssessmentIdentity.mockResolvedValue(null);
    findLatestRetainedLvPublication.mockResolvedValue(pubA);
    findLatestActiveLvPublication.mockResolvedValue(pubA);

    const assessmentBRow = {
      ...assessmentRow,
      id: assessmentB,
      idempotencyKey: 'assess-key-b',
      scoreValue: 76,
      inputSummary: {
        ...assessmentRow.inputSummary,
        assessmentTrack: 'WORKSHOP_OVERRIDE',
      },
    };
    const repo = (service as unknown as { publicationRepository: BatteryPublicationRepository })
      .publicationRepository;
    (repo.findAssessmentById as jest.Mock).mockResolvedValue(assessmentBRow);

    await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentB,
      publicationVersion: 1,
      now,
    });

    expect(materializeMock).toHaveBeenCalledWith(
      expect.objectContaining({ assessmentId: assessmentA }),
    );
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({ assessmentId: assessmentB }),
    );
  });

  it('TEST 6: crash after pub:B:v1 create — retry repairs A SUPERSEDED without B duplicate', async () => {
    const pubB = {
      id: 'pub-b',
      assessmentId: assessmentB,
      version: 1,
      publishedAt: now,
      reason: JSON.stringify({
        maturity: 'STABLE',
        supersedePublicationId: 'pub-a',
        publishedEstimatedHealth: 76,
        stabilizedEstimatedHealth: 76,
        assessmentTrack: 'WORKSHOP_OVERRIDE',
        assessmentEvidenceObservedAt: now.toISOString(),
      }),
    };

    findPublicationByAssessmentIdentity.mockResolvedValue(pubB);
    findLatestRetainedLvPublication.mockResolvedValue(existingPublication());
    findLatestActiveLvPublication.mockResolvedValue(existingPublication());

    const assessmentBRow = {
      ...assessmentRow,
      id: assessmentB,
      idempotencyKey: 'assess-key-b',
      scoreValue: 76,
      inputSummary: {
        ...assessmentRow.inputSummary,
        assessmentTrack: 'WORKSHOP_OVERRIDE',
      },
    };
    const repo = (service as unknown as { publicationRepository: BatteryPublicationRepository })
      .publicationRepository;
    (repo.findAssessmentById as jest.Mock).mockResolvedValue(assessmentBRow);
    (repo.findPublicationById as jest.Mock).mockImplementation(
      async ({ publicationId }: { publicationId: string }) => {
        if (publicationId === 'pub-a') return existingPublication();
        if (publicationId === 'pub-b') return pubB;
        return null;
      },
    );

    const result = await service.updateLvPublication({
      organizationId,
      vehicleId,
      assessmentId: assessmentB,
      publicationVersion: 1,
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.persistedPublicationId).toBe('pub-b');
    expect(persistMock).not.toHaveBeenCalled();
    expect(markSupersededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId: 'pub-a',
        supersededByPublicationId: 'pub-b',
      }),
    );
    expect(result.supersededPublicationId).toBe('pub-a');
  });
});
