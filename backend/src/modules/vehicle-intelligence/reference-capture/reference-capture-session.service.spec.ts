import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureSessionService } from './reference-capture-session.service';
import { ReferenceCaptureConfig } from './reference-capture.config';

describe('ReferenceCaptureSessionService lifecycle', () => {
  function makeService(overrides?: Partial<Record<string, unknown>>) {
    const config = {
      isEnabled: () => true,
      isTripDetectionAffected: () => false,
      replacesProductionScheduler: () => false,
      getCycleIntervalMs: () => 5000,
      getSlowCycleEvery: () => 6,
    } as ReferenceCaptureConfig;

    const sessionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      updateReadiness: jest.fn().mockResolvedValue({}),
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
        referenceDriveReady: true,
        blockers: [],
        warnings: [],
        checks: {},
        assessedAt: new Date().toISOString(),
      }),
    };
    const runner = {
      startRunner: jest.fn().mockResolvedValue(undefined),
      stopRunner: jest.fn().mockResolvedValue(undefined),
      isRunnerOperational: () => true,
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
    );

    return { service, sessionRepo, preflight, acquisition, writer, readiness, runner, ...overrides };
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
    );
    await expect(
      service.createSession({ organizationId: 'org', vehicleId: 'veh' }),
    ).rejects.toThrow('Reference capture is disabled');
  });

  it('transitions CREATED → PREFLIGHT → READY when readiness passes', async () => {
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
      readinessJson: { referenceDriveReady: true },
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
    expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
      'org',
      's1',
      ReferenceCaptureSessionStatus.PREFLIGHT,
    );
  });

  it('starts autonomous runner on startRecording', async () => {
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
      readinessJson: { referenceDriveReady: true },
    });
    sessionRepo.updateStatus.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.RECORDING,
      connectionProfile: 'DIMO_LTE_R1',
      powertrainProfile: 'ICE_GASOLINE',
      hardwareProfile: 'LTE_R1',
      manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
      manifestVersion: '1.1.0',
      recorderSoftwareVersion: '3A.1.0',
      broadObservationFieldCount: 10,
      massBindingJson: {},
      preflightJson: {},
      readinessJson: { referenceDriveReady: true },
      failureReason: null,
      startedAt: new Date(),
      stoppedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.startRecording('org', 's1');
    expect(runner.startRunner).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', organizationId: 'org' }),
    );
  });

  it('supports abort from active states and stops runner', async () => {
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
      status: ReferenceCaptureSessionStatus.ABORTED,
    });

    await service.abortSession('org', 's1', 'operator_cancel');
    expect(runner.stopRunner).toHaveBeenCalledWith('org', 's1');
    expect(writer.flush).toHaveBeenCalledWith('s1');
    expect(writer.clearSession).toHaveBeenCalledWith('s1');
  });
});

describe('ReferenceCaptureConfig isolation', () => {
  it('does not affect trip detection or production schedulers', () => {
    const config = new ReferenceCaptureConfig({ get: () => false } as never);
    expect(config.isTripDetectionAffected()).toBe(false);
    expect(config.replacesProductionScheduler()).toBe(false);
  });
});
