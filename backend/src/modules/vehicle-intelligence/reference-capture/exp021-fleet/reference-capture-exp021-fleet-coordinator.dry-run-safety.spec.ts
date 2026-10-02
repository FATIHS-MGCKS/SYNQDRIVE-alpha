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
  let fleetRepository: {
    reserveStudyRunAssignment: jest.Mock;
    listEnabledEnrollmentsForStudy: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    fleetRepository = {
      reserveStudyRunAssignment: jest.fn(),
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
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceCaptureExp021FleetCoordinatorService,
        {
          provide: ReferenceCaptureExp021FleetRepository,
          useValue: {
            listCollectingStudies: jest.fn().mockResolvedValue([
              { id: 'study-1', studyKey: 'exp021-fleet', status: Exp021StudyStatus.COLLECTING, dryRun: true },
            ]),
            loadOrderBalanceSnapshot: jest.fn().mockResolvedValue({ globalCounts: {}, vehicleCounts: {} }),
            ...fleetRepository,
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
    expect(fleetRepository.reserveStudyRunAssignment).not.toHaveBeenCalled();
  });

  it('exposes freshness provenance on dry-run observations', async () => {
    const observations = await coordinator.evaluateFleetDryRunTick();
    expect(observations[0].freshnessTimestamp).toBeTruthy();
    expect(observations[0].freshnessAuthority).toBeTruthy();
    expect(observations[0].freshnessAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('H — token mismatch leaves enrollment ineligible without side effects', async () => {
    const prisma = (coordinator as unknown as { prisma: { vehicle: { findFirst: jest.Mock } } }).prisma;
    prisma.vehicle.findFirst.mockResolvedValueOnce({
      id: 'veh-1',
      dimoVehicle: { tokenId: 999, lastSignal: new Date() },
      latestState: { lastSeenAt: new Date(), rawPayloadJson: null },
    });
    const observations = await coordinator.evaluateFleetDryRunTick();
    expect(observations[0].eligible).toBe(false);
    expect(observations[0].reasonCodes).toContain('TOKEN_MISMATCH');
    expect(prismaCreateSession).not.toHaveBeenCalled();
    expect(prismaCreateRun).not.toHaveBeenCalled();
  });

  it('I — HF policy denied leaves enrollment ineligible', async () => {
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
              canaryOnly: true,
              canaryTokenIds: [1],
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
            referenceCaptureSession: { findFirst: jest.fn().mockResolvedValue(null), create: prismaCreateSession },
            exp021StudyRun: { create: prismaCreateRun },
          },
        },
      ],
    }).compile();
    const hfDeniedCoordinator = moduleRef.get(ReferenceCaptureExp021FleetCoordinatorService);
    const observations = await hfDeniedCoordinator.evaluateFleetDryRunTick();
    expect(observations[0].eligible).toBe(false);
    expect(observations[0].reasonCodes).toContain('HF_POLICY_BLOCKED');
    expect(observations[0].hfPolicyAllowed).toBe(false);
  });

  it('J — active session conflict leaves enrollment ineligible', async () => {
    const prisma = (coordinator as unknown as { prisma: { referenceCaptureSession: { findFirst: jest.Mock } } }).prisma;
    prisma.referenceCaptureSession.findFirst.mockResolvedValueOnce({ id: 'session-active' });
    const observations = await coordinator.evaluateFleetDryRunTick();
    expect(observations[0].eligible).toBe(false);
    expect(observations[0].reasonCodes).toContain('ACTIVE_SESSION_CONFLICT');
    expect(observations[0].activeSessionConflict).toBe(true);
  });

  it('K — fleetDryRun=false refuses evaluation (fail closed)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceCaptureExp021FleetCoordinatorService,
        {
          provide: ReferenceCaptureExp021FleetRepository,
          useValue: {
            listCollectingStudies: jest.fn(),
            listEnabledEnrollmentsForStudy: jest.fn(),
            loadOrderBalanceSnapshot: jest.fn(),
          },
        },
        {
          provide: ReferenceCaptureConfig,
          useValue: {
            isFleetCoordinatorEnabled: () => true,
            isFleetDryRun: () => false,
            isEnabled: () => true,
            getHfRecoveryPolicyConfig: () => ({}),
          },
        },
        { provide: PrismaService, useValue: { vehicle: { findFirst: jest.fn() } } },
      ],
    }).compile();
    const liveCoordinator = moduleRef.get(ReferenceCaptureExp021FleetCoordinatorService);
    const observations = await liveCoordinator.evaluateFleetDryRunTick();
    expect(observations).toEqual([]);
  });

  it('L — reference capture disabled leaves enrollment ineligible', async () => {
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
            isEnabled: () => false,
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
            referenceCaptureSession: { findFirst: jest.fn().mockResolvedValue(null), create: prismaCreateSession },
            exp021StudyRun: { create: prismaCreateRun },
          },
        },
      ],
    }).compile();
    const disabledCoordinator = moduleRef.get(ReferenceCaptureExp021FleetCoordinatorService);
    const observations = await disabledCoordinator.evaluateFleetDryRunTick();
    expect(observations[0].eligible).toBe(false);
    expect(observations[0].reasonCodes).toContain('REFERENCE_CAPTURE_DISABLED');
  });

  it('classifies KS MX 2024 real-drive fixture as FRESH when latestState is newer than lastSignal', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-16T12:10:00.000Z'));
    fleetRepository.listEnabledEnrollmentsForStudy.mockResolvedValueOnce([
      {
        id: 'd1d3de38-dbcc-4569-9dae-9846d894abd7',
        organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
        vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        enrolledTokenId: 187336,
        enabled: true,
        allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
      },
    ]);
    const prisma = (coordinator as unknown as { prisma: { vehicle: { findFirst: jest.Mock } } }).prisma;
    prisma.vehicle.findFirst.mockResolvedValueOnce({
      id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      dimoVehicle: { tokenId: 187336, lastSignal: new Date('2026-09-15T20:56:14.000Z') },
      latestState: {
        lastSeenAt: new Date('2026-09-16T12:05:15.000Z'),
        rawPayloadJson: { lastSeen: '2026-09-16T12:05:15Z' },
      },
    });
    const observations = await coordinator.evaluateFleetDryRunTick();
    expect(observations[0].telemetryFreshness).toBe('FRESH');
    expect(observations[0].freshnessAuthority).toBe('LATEST_STATE_LAST_SEEN_AT');
    expect(observations[0].eligible).toBe(true);
    expect(observations[0].proposedPlanId).toBeTruthy();
    expect(prismaCreateSession).not.toHaveBeenCalled();
    expect(prismaCreateRun).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
