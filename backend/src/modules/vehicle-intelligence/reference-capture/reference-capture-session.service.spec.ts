import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from './reference-capture-session.service';
import { ReferenceCaptureConfig } from './reference-capture.config';

function makePrismaMock(): PrismaService {
  return {
    vehicle: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('ReferenceCaptureSessionService lifecycle', () => {
  function makeService() {
    const config = {
      isEnabled: () => true,
      isTripDetectionAffected: () => false,
      replacesProductionScheduler: () => false,
      getCycleIntervalMs: () => 5000,
      getSlowCycleEvery: () => 6,
      getStopQuiescenceTimeoutMs: () => 120_000,
      getStopQuiescencePollIntervalMs: () => 250,
    } as ReferenceCaptureConfig;

    const sessionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      updateStatusIfCurrent: jest.fn(),
      updateReadiness: jest.fn().mockResolvedValue({}),
      updateRunnerJobId: jest.fn().mockResolvedValue({}),
      waitForAcquisitionCycleQuiescence: jest
        .fn()
        .mockResolvedValue({ quiesced: true, timedOut: false }),
      finalizeTerminalCalibrationAtomic: jest.fn().mockResolvedValue({}),
    };
    const observationRepo = { findBySession: jest.fn(), countBySession: jest.fn() };
    const massBinding = { resolveMassBinding: jest.fn().mockResolvedValue({ effectiveMassKg: 1500 }) };
    const preflight = { runPreflight: jest.fn() };
    const acquisition = { captureTick: jest.fn() };
    const writer = {
      flush: jest.fn().mockResolvedValue(0),
      clearSession: jest.fn(),
      enqueueAndMaybeFlush: jest.fn(),
    };
    const readiness = {
      assessSessionReadiness: jest.fn().mockResolvedValue({
        deploymentPreflightReady: true,
        referenceDriveReady: false,
        blockers: ['reference_drive_canary_not_executed'],
        warnings: [],
        checks: {},
        assessedAt: new Date().toISOString(),
      }),
    };
    const runner = {
      startRunner: jest.fn().mockResolvedValue('refcap-cycle-s1-1-uuid'),
      stopRunner: jest.fn().mockResolvedValue(undefined),
      cancelPendingCycleJob: jest.fn().mockResolvedValue({ cancelled: true, jobId: 'pending' }),
      sessionRunnerKey: jest.fn().mockReturnValue('refcap-session-s1'),
    };

    const service = new ReferenceCaptureSessionService(
      config,
      sessionRepo as never,
      observationRepo as never,
      massBinding as never,
      preflight as never,
      acquisition as never,
      writer as never,
      readiness as never,
      runner as never,
      makePrismaMock(),
    );

    return { service, sessionRepo, preflight, acquisition, writer, readiness, runner };
  }

  it('blocks when feature gate disabled', async () => {
    const config = { isEnabled: () => false } as ReferenceCaptureConfig;
    const service = new ReferenceCaptureSessionService(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      makePrismaMock(),
    );
    await expect(
      service.createSession({ organizationId: 'org', vehicleId: 'veh' }),
    ).rejects.toThrow('Reference capture is disabled');
  });

  it('transitions CREATED → PREFLIGHT → READY when deployment preflight passes', async () => {
    const { service, sessionRepo, preflight, readiness } = makeService();
    sessionRepo.findById.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.CREATED,
      massBindingJson: {},
      manifestVersion: '1.1.0',
    });
    preflight.runPreflight.mockResolvedValue({
      broadObservationFieldCount: 42,
      connectionProfile: 'DIMO_LTE_R1',
      powertrainProfile: 'ICE_GASOLINE',
      hardwareProfile: 'LTE_R1',
      manifestVersion: '1.1.0',
    });
    sessionRepo.updateStatus.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.READY,
      connectionProfile: 'DIMO_LTE_R1',
      powertrainProfile: 'ICE_GASOLINE',
      hardwareProfile: 'LTE_R1',
      manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
      manifestVersion: '1.1.0',
      recorderSoftwareVersion: '3A.1.0',
      broadObservationFieldCount: 42,
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { deploymentPreflightReady: true },
      failureReason: null,
      startedAt: null,
      stoppedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const view = await service.runPreflight('org', 's1');
    expect(view.status).toBe(ReferenceCaptureSessionStatus.READY);
    expect(readiness.assessSessionReadiness).toHaveBeenCalled();
  });

  it('uses STARTING then RECORDING before runner enqueue', async () => {
    const { service, sessionRepo, runner } = makeService();
    sessionRepo.findById
      .mockResolvedValueOnce({
        id: 's1',
        organizationId: 'org',
        vehicleId: 'veh',
        status: ReferenceCaptureSessionStatus.READY,
        manifestVersion: '1.1.0',
        powertrainProfile: 'ICE_GASOLINE',
        massBindingJson: {},
        preflightJson: {},
        readinessJson: { deploymentPreflightReady: true },
      })
      .mockResolvedValueOnce({
        id: 's1',
        status: ReferenceCaptureSessionStatus.RECORDING,
        massBindingJson: {},
        preflightJson: {},
        readinessJson: { deploymentPreflightReady: true },
      });
    sessionRepo.updateStatusIfCurrent
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.STARTING })
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.RECORDING });

    await service.startRecording('org', 's1');
    expect(sessionRepo.updateStatusIfCurrent).toHaveBeenNthCalledWith(
      1,
      'org',
      's1',
      ReferenceCaptureSessionStatus.READY,
      ReferenceCaptureSessionStatus.STARTING,
      expect.any(Object),
    );
    expect(sessionRepo.updateStatusIfCurrent).toHaveBeenNthCalledWith(
      2,
      'org',
      's1',
      ReferenceCaptureSessionStatus.STARTING,
      ReferenceCaptureSessionStatus.RECORDING,
      expect.objectContaining({ runnerJobId: expect.any(String), pendingCycleJobId: null }),
    );
    expect(runner.startRunner).toHaveBeenCalled();
  });

  it('K — reverts STARTING to READY via CAS when runner enqueue fails (no concurrent transition)', async () => {
    const { service, sessionRepo, runner } = makeService();
    sessionRepo.findById.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.READY,
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { deploymentPreflightReady: true },
    });
    sessionRepo.updateStatusIfCurrent
      .mockResolvedValueOnce({
        id: 's1',
        status: ReferenceCaptureSessionStatus.STARTING,
      })
      .mockResolvedValueOnce({
        id: 's1',
        status: ReferenceCaptureSessionStatus.RECORDING,
      })
      .mockResolvedValueOnce({
        id: 's1',
        status: ReferenceCaptureSessionStatus.READY,
        failureReason: 'redis unavailable',
        runnerJobId: null,
        pendingCycleJobId: null,
      });
    runner.startRunner.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'Failed to start reference capture runner: redis unavailable',
    );
    expect(runner.stopRunner).toHaveBeenCalledWith('org', 's1');
    expect(sessionRepo.updateStatusIfCurrent).toHaveBeenNthCalledWith(
      3,
      'org',
      's1',
      ReferenceCaptureSessionStatus.RECORDING,
      ReferenceCaptureSessionStatus.READY,
      expect.objectContaining({
        failureReason: 'redis unavailable',
        runnerJobId: null,
        pendingCycleJobId: null,
      }),
    );
    expect(sessionRepo.updateStatus).not.toHaveBeenCalled();
    expect(
      sessionRepo.updateStatusIfCurrent.mock.calls.some(
        (call) => call[3] === ReferenceCaptureSessionStatus.RECORDING,
      ),
    ).toBe(true);
  });

  it('M — concurrent ABORT during STARTING->RECORDING CAS leaves ABORTED (no READY resurrection)', async () => {
    const readySession = {
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.READY,
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { deploymentPreflightReady: true },
    };
    const abortedSession = {
      ...readySession,
      status: ReferenceCaptureSessionStatus.ABORTED,
      runnerJobId: null,
      pendingCycleJobId: null,
    };

    const { service, sessionRepo, runner } = makeService();
    sessionRepo.findById.mockResolvedValueOnce(readySession).mockResolvedValue(abortedSession);
    sessionRepo.updateStatusIfCurrent
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.STARTING })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'compensation superseded by concurrent session transition to ABORTED',
    );
    expect(runner.startRunner).not.toHaveBeenCalled();
    expect(runner.stopRunner).toHaveBeenCalledWith('org', 's1');
    expect(sessionRepo.updateStatus).not.toHaveBeenCalled();
    expect(sessionRepo.updateStatusIfCurrent).toHaveBeenNthCalledWith(
      2,
      'org',
      's1',
      ReferenceCaptureSessionStatus.STARTING,
      ReferenceCaptureSessionStatus.RECORDING,
      expect.any(Object),
    );
    const latest = await sessionRepo.findById('org', 's1');
    expect(latest.status).toBe(ReferenceCaptureSessionStatus.ABORTED);
  });

  it('N — concurrent ABORT during runner failure leaves ABORTED (no READY resurrection)', async () => {
    const readySession = {
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.READY,
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { deploymentPreflightReady: true },
    };
    const abortedSession = {
      ...readySession,
      status: ReferenceCaptureSessionStatus.ABORTED,
      runnerJobId: null,
      pendingCycleJobId: null,
    };

    const { service, sessionRepo, runner } = makeService();
    sessionRepo.findById.mockResolvedValueOnce(readySession).mockResolvedValue(abortedSession);
    sessionRepo.updateStatusIfCurrent
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.STARTING })
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.RECORDING })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    runner.startRunner.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'compensation superseded by concurrent session transition to ABORTED',
    );
    expect(runner.stopRunner).toHaveBeenCalledWith('org', 's1');
    expect(sessionRepo.updateStatus).not.toHaveBeenCalled();
    const latest = await sessionRepo.findById('org', 's1');
    expect(latest.status).toBe(ReferenceCaptureSessionStatus.ABORTED);
  });

  it('O — fencing: COMPENSATION_CONFIRMED ABORTED cannot be resurrected by stale start handler', async () => {
    const readySession = {
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.READY,
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { deploymentPreflightReady: true },
    };
    const abortedSession = {
      ...readySession,
      status: ReferenceCaptureSessionStatus.ABORTED,
      runnerJobId: null,
      pendingCycleJobId: null,
    };

    const { service, sessionRepo, runner } = makeService();
    sessionRepo.findById
      .mockResolvedValueOnce(readySession)
      .mockResolvedValueOnce(abortedSession)
      .mockResolvedValueOnce(abortedSession);
    sessionRepo.updateStatusIfCurrent
      .mockResolvedValueOnce({ id: 's1', status: ReferenceCaptureSessionStatus.STARTING })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(service.startRecording('org', 's1')).rejects.toThrow('ABORTED');
    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'Cannot start recording from status ABORTED',
    );
    expect(sessionRepo.updateStatus).not.toHaveBeenCalled();
    expect(runner.stopRunner).toHaveBeenCalled();
  });

  it('stop cancels pending cycle without requiring active job removal', async () => {
    const { service, sessionRepo, writer, runner } = makeService();
    sessionRepo.findById.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.RECORDING,
      massBindingJson: {},
      preflightJson: {},
      readinessJson: {},
      manifestVersion: '1.1.0',
      connectionProfile: 'DIMO_LTE_R1',
      powertrainProfile: null,
      hardwareProfile: null,
      manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
      recorderSoftwareVersion: '3A.1.0',
      broadObservationFieldCount: 10,
      failureReason: null,
      startedAt: new Date(),
      stoppedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    sessionRepo.updateStatus.mockResolvedValue({
      ...sessionRepo.findById.mock.results[0]?.value,
      status: ReferenceCaptureSessionStatus.COMPLETED,
    });

    await service.stopRecording('org', 's1');
    expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
      'org',
      's1',
      ReferenceCaptureSessionStatus.STOPPING,
      expect.any(Object),
    );
    expect(runner.cancelPendingCycleJob).toHaveBeenCalledWith('org', 's1');
    expect(writer.flush).toHaveBeenCalledWith('s1');
  });
});

describe('ReferenceCaptureConfig isolation', () => {
  it('does not affect trip detection or production schedulers', () => {
    const config = new ReferenceCaptureConfig({ get: () => false } as never);
    expect(config.isTripDetectionAffected()).toBe(false);
    expect(config.replacesProductionScheduler()).toBe(false);
  });
});
