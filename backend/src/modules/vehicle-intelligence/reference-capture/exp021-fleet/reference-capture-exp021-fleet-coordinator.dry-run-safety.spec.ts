import { Test } from '@nestjs/testing';
import { Exp021StudyStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureExp021FleetCoordinatorService } from './reference-capture-exp021-fleet-coordinator.service';
import { ReferenceCaptureExp021FleetRepository } from './reference-capture-exp021-fleet.repository';

describe('ReferenceCaptureExp021FleetCoordinatorService dry-run safety', () => {
  const prismaCreateSession = jest.fn();
  const prismaCreateRun = jest.fn();
  let coordinator: ReferenceCaptureExp021FleetCoordinatorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceCaptureExp021FleetCoordinatorService,
        {
          provide: ReferenceCaptureExp021FleetRepository,
          useValue: {
            listCollectingStudies: jest.fn().mockResolvedValue([
              { id: 'study-1', studyKey: 'exp021-fleet', status: Exp021StudyStatus.COLLECTING, dryRun: true },
            ]),
            listEnabledEnrollmentsForStudy: jest.fn().mockResolvedValue([
              {
                id: 'enr-1',
                organizationId: 'org-1',
                vehicleId: 'veh-1',
                enrolledTokenId: 42,
                enabled: true,
                allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
              },
            ]),
            loadOrderBalanceSnapshot: jest.fn().mockResolvedValue({ globalCounts: {}, vehicleCounts: {} }),
          },
        },
        {
          provide: ReferenceCaptureConfig,
          useValue: {
            isFleetCoordinatorEnabled: () => true,
            isFleetDryRun: () => true,
            isEnabled: () => true,
            getHfRecoveryPolicyConfig: () => ({
              mode: 'V2',
              enabled: true,
              settlementDelayMs: 8000,
              recoveryOverlapMs: 6000,
              historicalPollIntervalMs: 30000,
              sweepEnabled: false,
              sweepIntervalMs: 600000,
              sweepLookbackMs: 3600000,
              canaryOnly: false,
              canaryTokenIds: [],
              availabilityCalibrationEnabled: false,
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            vehicle: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'veh-1',
                dimoVehicle: { tokenId: 42, lastSignal: new Date() },
                latestState: { lastSeenAt: new Date() },
              }),
            },
            referenceCaptureSession: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: prismaCreateSession,
            },
            exp021StudyRun: { create: prismaCreateRun },
          },
        },
      ],
    }).compile();
    coordinator = moduleRef.get(ReferenceCaptureExp021FleetCoordinatorService);
  });

  it('never creates ReferenceCaptureSession or study run rows during dry-run tick', async () => {
    const observations = await coordinator.evaluateFleetDryRunTick();
    expect(observations).toHaveLength(1);
    expect(observations[0].dryRun).toBe(true);
    expect(prismaCreateSession).not.toHaveBeenCalled();
    expect(prismaCreateRun).not.toHaveBeenCalled();
  });
});
