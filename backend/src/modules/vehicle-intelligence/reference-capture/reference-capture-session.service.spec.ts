import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureSessionService } from './reference-capture-session.service';
import { ReferenceCaptureConfig } from './reference-capture.config';

describe('ReferenceCaptureSessionService lifecycle', () => {
  function makeService(overrides?: Partial<Record<string, unknown>>) {
    const config = {
      isEnabled: () => true,
      isTripDetectionAffected: () => false,
      replacesProductionScheduler: () => false,
    } as ReferenceCaptureConfig;

    const sessionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
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

    const service = new ReferenceCaptureSessionService(
      config,
      sessionRepo as never,
      observationRepo as never,
      massBinding as never,
      preflight as never,
      acquisition as never,
      writer as never,
    );

    return { service, sessionRepo, preflight, acquisition, writer, ...overrides };
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
    );
    await expect(
      service.createSession({ organizationId: 'org', vehicleId: 'veh' }),
    ).rejects.toThrow('Reference capture is disabled');
  });

  it('transitions CREATED → PREFLIGHT → READY', async () => {
    const { service, sessionRepo, preflight } = makeService();
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
      failureReason: null,
      startedAt: null,
      stoppedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const view = await service.runPreflight('org', 's1');
    expect(view.status).toBe(ReferenceCaptureSessionStatus.READY);
    expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
      'org',
      's1',
      ReferenceCaptureSessionStatus.PREFLIGHT,
    );
  });

  it('supports abort from active states', async () => {
    const { service, sessionRepo, writer } = makeService();
    sessionRepo.findById.mockResolvedValue({
      id: 's1',
      organizationId: 'org',
      vehicleId: 'veh',
      status: ReferenceCaptureSessionStatus.RECORDING,
      massBindingJson: {},
      preflightJson: {},
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
