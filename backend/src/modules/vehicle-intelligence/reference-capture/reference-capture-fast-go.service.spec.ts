import * as fs from 'fs';
import * as path from 'path';
import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureFastGoService } from './reference-capture-fast-go.service';
import { ReferenceCaptureConfig } from './reference-capture.config';

function makeReadySession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: ReferenceCaptureSessionStatus.READY,
    manifestVersion: '1.1.0',
    runnerJobId: null,
    pendingCycleJobId: null,
    acquisitionStateJson: { cycleCount: 0, seenEventFingerprints: [], lastSequenceNumber: 0 },
    readinessJson: {
      deploymentPreflightReady: true,
      referenceDriveReady: false,
      blockers: [],
      warnings: [],
      checks: {},
      assessedAt: new Date().toISOString(),
    },
    preflightJson: {
      broadObservationFields: [{ providerField: 'speed' }],
      broadObservationFieldCount: 1,
      availableSignals: ['speed'],
      manifestVersion: '1.1.0',
      connectionProfile: 'DIMO_LTE_R1',
      powertrainProfile: 'ICE_GASOLINE',
      hardwareProfile: 'LTE_R1',
      manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
      checkedAt: new Date().toISOString(),
    },
    massBindingJson: {},
    ...overrides,
  };
}

describe('ReferenceCaptureFastGoService', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeService(timeoutMs = 15_000) {
    const config = {
      isEnabled: () => true,
      getPrearmMaxAgeMs: () => 15 * 60 * 1000,
      getFastGoFirstCycleTimeoutMs: () => timeoutMs,
    } as ReferenceCaptureConfig;

    const sessionService = {
      startRecording: jest.fn(),
      abortSession: jest.fn().mockResolvedValue({}),
    };
    const sessionRepository = {
      findById: jest.fn(),
    };
    const observationRepository = {
      findBySession: jest.fn().mockResolvedValue([]),
    };
    const runtimeHealth = {
      assessRuntimeHealth: jest.fn().mockResolvedValue({
        queueReachable: true,
        storageReadable: true,
        storageWritable: true,
        timestampInstrumentationVerified: true,
        queryPlanCompilable: true,
        workerQueueRegistered: true,
      }),
    };

    const service = new ReferenceCaptureFastGoService(
      config,
      sessionService as never,
      sessionRepository as never,
      observationRepository as never,
      runtimeHealth as never,
    );

    return { service, config, sessionService, sessionRepository, observationRepository, runtimeHealth };
  }

  it('E — confirms GO only with first cycle, signals, and runner continuity', async () => {
    const { service, sessionService, sessionRepository, observationRepository } = makeService();
    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValueOnce({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.RECORDING,
        runnerJobId: 'refcap-session-sess-1',
        pendingCycleJobId: 'refcap-cycle-sess-1-2-uuid',
        acquisitionStateJson: { cycleCount: 1, activeCycleJobId: null },
      });

    sessionService.startRecording.mockResolvedValue({
      id: 'sess-1',
      status: ReferenceCaptureSessionStatus.RECORDING,
    });

    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => 1_001_000,
    });

    expect(result.readyToDrive).toBe(true);
    expect(result.runnerContinuityProven).toBe(true);
    expect(result.timestamps.startRequestStartedAt).toBeTruthy();
    expect(result.timestamps.startAcceptedAt).toBeTruthy();
    expect(result.timestamps.runnerContinuityConfirmedAt).toBeTruthy();
    expect(result.timestamps.goDeadlineAt).toBe(new Date(1_015_000).toISOString());
  });

  it('D — rejects when cycle 1 + signals but runner continuity missing', async () => {
    const { service, sessionService, sessionRepository, observationRepository } = makeService(1_000);
    let now = 1_000_000;
    let calls = 0;
    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValue({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.RECORDING,
        runnerJobId: 'refcap-session-sess-1',
        pendingCycleJobId: null,
        acquisitionStateJson: { cycleCount: 1, activeCycleJobId: null },
      });

    sessionService.startRecording.mockResolvedValue({
      id: 'sess-1',
      status: ReferenceCaptureSessionStatus.RECORDING,
    });
    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT },
    ]);
    sessionService.abortSession.mockResolvedValue({
      status: ReferenceCaptureSessionStatus.ABORTED,
      runnerJobId: null,
      pendingCycleJobId: null,
      acquisitionStateJson: { cycleCount: 1 },
    });

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => {
        calls += 1;
        if (calls <= 6) return 1_000_000;
        now += 20;
        return now;
      },
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('runner_continuity_not_proven');
    expect(sessionService.abortSession).toHaveBeenCalled();
  });

  it('F — already RECORDING with cycle>=1 and zero signals => NO', async () => {
    const { service, sessionRepository, sessionService } = makeService(500);
    let now = 1_000_000;
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      runnerJobId: 'refcap-session-sess-1',
      pendingCycleJobId: 'refcap-cycle-sess-1-2-uuid',
      acquisitionStateJson: { cycleCount: 2 },
    });

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => {
        now += 100;
        return now;
      },
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('go_deadline_exceeded');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('G — already RECORDING with signals but no runner continuity => NO', async () => {
    const { service, sessionRepository, sessionService, observationRepository } = makeService();
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      runnerJobId: 'refcap-session-sess-1',
      pendingCycleJobId: null,
      acquisitionStateJson: { cycleCount: 2, activeCycleJobId: null },
    });
    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('runner_continuity_not_proven');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('H — already RECORDING with full invariant => YES without duplicate enqueue', async () => {
    const { service, sessionRepository, sessionService, observationRepository } = makeService();
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      runnerJobId: 'refcap-session-sess-1',
      pendingCycleJobId: 'refcap-cycle-sess-1-2-uuid',
      acquisitionStateJson: { cycleCount: 2 },
    });
    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(true);
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('J — timeout compensation unconfirmed when abort verification fails', async () => {
    const { service, sessionService, sessionRepository } = makeService(300);
    let now = 1_000_000;
    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValue({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.RECORDING,
        runnerJobId: 'refcap-session-sess-1',
        pendingCycleJobId: 'pending',
        acquisitionStateJson: { cycleCount: 0 },
      });

    sessionService.startRecording.mockResolvedValue({
      id: 'sess-1',
      status: ReferenceCaptureSessionStatus.RECORDING,
    });

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => {
        now += 40;
        return now;
      },
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.compensationStatus).toBe('COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED');
  });

  it('I — ambiguous START failure fences READY session and confirms cleanup', async () => {
    const { service, sessionService, sessionRepository } = makeService();
    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValueOnce({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.ABORTED,
        runnerJobId: null,
        pendingCycleJobId: null,
        acquisitionStateJson: { cycleCount: 0 },
      });

    sessionService.startRecording.mockRejectedValue(new Error('request_timeout'));

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.timestamps.startAcceptedAt).toBeNull();
    expect(sessionService.abortSession).toHaveBeenCalled();
    expect(result.compensationStatus).toBe('COMPENSATION_CONFIRMED');
  });

  it('signal gate — PROBE_RESULT does not satisfy persistence', async () => {
    const { service, sessionRepository, sessionService, observationRepository } = makeService(500);
    let now = 1_000_000;
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      runnerJobId: 'refcap-session-sess-1',
      pendingCycleJobId: 'refcap-cycle-sess-1-2-uuid',
      acquisitionStateJson: { cycleCount: 1 },
    });
    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.PROBE_RESULT },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => {
        now += 100;
        return now;
      },
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('go_deadline_exceeded');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('signal gate — SEGMENT does not satisfy persistence', async () => {
    const { service, sessionRepository, observationRepository } = makeService(500);
    let now = 1_000_000;
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      runnerJobId: 'refcap-session-sess-1',
      pendingCycleJobId: 'refcap-cycle-sess-1-2-uuid',
      acquisitionStateJson: { cycleCount: 1 },
    });
    observationRepository.findBySession.mockResolvedValue([
      { observationKind: ReferenceCaptureObservationKind.SEGMENT },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
      goRequestedAt: new Date(1_000_000),
      nowMs: () => {
        now += 100;
        return now;
      },
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('go_deadline_exceeded');
  });

  it('rejects stale pre-arm beyond configured max age', async () => {
    const { service, sessionRepository, sessionService } = makeService();
    const staleAssessedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    sessionRepository.findById.mockResolvedValue(
      makeReadySession({
        readinessJson: {
          deploymentPreflightReady: true,
          blockers: [],
          warnings: [],
          checks: {},
          assessedAt: staleAssessedAt,
        },
      }),
    );

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('prearm_stale_requires_new_prearm');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });
});

describe('ReferenceCaptureSessionService concurrent start (CAS authority)', () => {
  it('K — rejects second start when CAS loses READY→STARTING race', async () => {
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        organizationId: 'org',
        vehicleId: 'veh',
        status: ReferenceCaptureSessionStatus.READY,
        manifestVersion: '1.1.0',
        powertrainProfile: 'ICE_GASOLINE',
        massBindingJson: {},
        preflightJson: {},
        readinessJson: { deploymentPreflightReady: true },
      }),
      updateStatusIfCurrent: jest.fn().mockResolvedValue(null),
    };
    const config = { isEnabled: () => true } as ReferenceCaptureConfig;
    const { ReferenceCaptureSessionService } = require('./reference-capture-session.service');
    const service = new ReferenceCaptureSessionService(
      config,
      sessionRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { startRunner: jest.fn() } as never,
      { vehicle: { findFirst: jest.fn() } } as never,
    );

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'Concurrent start request — session no longer READY',
    );
  });

  it('L — delayed START blocked after ambiguous fence moves session to ABORTED', async () => {
    const sessionRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 's1',
        organizationId: 'org',
        vehicleId: 'veh',
        status: ReferenceCaptureSessionStatus.ABORTED,
        manifestVersion: '1.1.0',
        powertrainProfile: 'ICE_GASOLINE',
        massBindingJson: {},
        preflightJson: {},
        readinessJson: { deploymentPreflightReady: true },
      }),
      updateStatusIfCurrent: jest.fn(),
    };
    const config = { isEnabled: () => true } as ReferenceCaptureConfig;
    const { ReferenceCaptureSessionService } = require('./reference-capture-session.service');
    const service = new ReferenceCaptureSessionService(
      config,
      sessionRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { startRunner: jest.fn() } as never,
      { vehicle: { findFirst: jest.fn() } } as never,
    );

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'Cannot start recording from status ABORTED',
    );
    expect(sessionRepo.updateStatusIfCurrent).not.toHaveBeenCalled();
  });
});

describe('reference-capture ops workflow scripts (3A.3.1)', () => {
  const opsDir = path.resolve(__dirname, '../../../../scripts/ops');

  it('FAST GO script uses absolute goDeadlineAt before initial GET', () => {
    const source = fs.readFileSync(path.join(opsDir, 'reference-capture-lte-r1-fast-go.ts'), 'utf8');
    expect(source).toContain('goRequestedAtMs = Date.now()');
    expect(source).toContain('computeGoDeadlineMs(goRequestedAtMs');
    expect(source.indexOf('computeGoDeadlineMs')).toBeLessThan(source.indexOf('getSession'));
    expect(source).toContain('goDeadlineAtMs');
    expect(source).not.toMatch(/deadline = Date\.now\(\) \+ timeoutMs/);
  });
});
