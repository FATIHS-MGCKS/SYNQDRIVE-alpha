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
  function makeService() {
    const config = {
      isEnabled: () => true,
      getPrearmMaxAgeMs: () => 15 * 60 * 1000,
      getFastGoFirstCycleTimeoutMs: () => 15_000,
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

  it('starts READY session and confirms first cycle with observations', async () => {
    const { service, sessionService, sessionRepository, observationRepository } = makeService();
    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValueOnce({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.RECORDING,
        runnerJobId: 'refcap-session-sess-1',
        pendingCycleJobId: 'refcap-cycle-sess-1-1-uuid',
        acquisitionStateJson: { cycleCount: 1, activeCycleJobId: null },
      });

    sessionService.startRecording.mockResolvedValue({
      id: 'sess-1',
      status: ReferenceCaptureSessionStatus.RECORDING,
      operational: { cycleCount: 0, pendingCycleJobId: 'refcap-cycle-sess-1-1-uuid' },
    });

    observationRepository.findBySession.mockResolvedValue([
      {
        observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
        providerField: 'speed',
      },
    ]);

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(true);
    expect(result.cycleCount).toBe(1);
    expect(result.signalObservationCount).toBe(1);
    expect(result.nextCycleScheduled).toBe(true);
    expect(sessionService.startRecording).toHaveBeenCalledTimes(1);
    expect(result.timestamps.startAcceptedAt).toBeTruthy();
    expect(result.timestamps.readyToDriveAt).toBeTruthy();
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

  it('rejects vehicle/session mismatch', async () => {
    const { service, sessionRepository, sessionService } = makeService();
    sessionRepository.findById.mockResolvedValue(makeReadySession({ vehicleId: 'other-veh' }));

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('vehicle_session_mismatch');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('returns idempotent success when already RECORDING with confirmed first cycle', async () => {
    const { service, sessionRepository, sessionService, observationRepository } = makeService();
    sessionRepository.findById.mockResolvedValue({
      ...makeReadySession(),
      status: ReferenceCaptureSessionStatus.RECORDING,
      startedAt: new Date('2026-09-01T19:12:27.239Z'),
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
    expect(result.reason).toBe('already_recording_confirmed');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('aborts session when first cycle times out (no zombie recording)', async () => {
    const { service, sessionRepository, sessionService } = makeService();
    const config = {
      isEnabled: () => true,
      getPrearmMaxAgeMs: () => 15 * 60 * 1000,
      getFastGoFirstCycleTimeoutMs: () => 50,
    } as ReferenceCaptureConfig;

    const fastService = new ReferenceCaptureFastGoService(
      config,
      sessionService as never,
      sessionRepository as never,
      { findBySession: jest.fn() } as never,
      {
        assessRuntimeHealth: jest.fn().mockResolvedValue({
          queueReachable: true,
          storageReadable: true,
          storageWritable: true,
          workerQueueRegistered: true,
        }),
      } as never,
    );

    sessionRepository.findById
      .mockResolvedValueOnce(makeReadySession())
      .mockResolvedValue({
        ...makeReadySession(),
        status: ReferenceCaptureSessionStatus.RECORDING,
        acquisitionStateJson: { cycleCount: 0 },
      });

    sessionService.startRecording.mockResolvedValue({
      id: 'sess-1',
      status: ReferenceCaptureSessionStatus.RECORDING,
    });

    const result = await fastService.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('first_cycle_timeout');
    expect(sessionService.abortSession).toHaveBeenCalledWith(
      'org-1',
      'sess-1',
      expect.stringContaining('fast_go_compensation'),
    );
  });

  it('does not start when runtime queue is unreachable', async () => {
    const { service, sessionRepository, sessionService, runtimeHealth } = makeService();
    sessionRepository.findById.mockResolvedValue(makeReadySession());
    runtimeHealth.assessRuntimeHealth.mockResolvedValue({
      queueReachable: false,
      storageReadable: true,
      storageWritable: true,
      workerQueueRegistered: true,
    });

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('redis_queue_unreachable');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });

  it('rejects non-READY statuses with explicit reason', async () => {
    const { service, sessionRepository, sessionService } = makeService();
    sessionRepository.findById.mockResolvedValue(
      makeReadySession({ status: ReferenceCaptureSessionStatus.CREATED }),
    );

    const result = await service.executeFastGo({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sessionId: 'sess-1',
    });

    expect(result.readyToDrive).toBe(false);
    expect(result.blockers).toContain('session_not_prearmed_run_prearm_first');
    expect(sessionService.startRecording).not.toHaveBeenCalled();
  });
});

describe('ReferenceCaptureSessionService concurrent start (CAS authority)', () => {
  it('rejects second start when CAS loses READY→STARTING race', async () => {
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
    );

    await expect(service.startRecording('org', 's1')).rejects.toThrow(
      'Concurrent start request — session no longer READY',
    );
  });
});

describe('reference-capture ops workflow scripts (3A.3.1)', () => {
  const opsDir = path.resolve(__dirname, '../../../../scripts/ops');

  it('FAST GO script does not bootstrap AppModule or NestFactory', () => {
    const source = fs.readFileSync(path.join(opsDir, 'reference-capture-lte-r1-fast-go.ts'), 'utf8');
    expect(source).not.toMatch(/import\s+\{[^}]*AppModule/);
    expect(source).not.toMatch(/import\s+\{[^}]*NestFactory/);
    expect(source).not.toMatch(/NestFactory\.create/);
    expect(source).toContain('ReferenceCaptureOpsHttpClient');
    expect(source).toContain('printReadyToDriveBanner');
  });

  it('PRE-ARM script may bootstrap Nest but does not call startRecording', () => {
    const source = fs.readFileSync(path.join(opsDir, 'reference-capture-lte-r1-prearm.ts'), 'utf8');
    expect(source).toContain('AppModule');
    expect(source).toContain('runPreflight');
    expect(source).not.toMatch(/startRecording/);
    expect(source).toContain('PREARM_READY');
  });

  it('legacy ARM script is marked deprecated in favor of two-stage workflow', () => {
    const source = fs.readFileSync(
      path.join(opsDir, 'reference-capture-lte-r1-reference-drive-arm.ts'),
      'utf8',
    );
    expect(source).toContain('@deprecated');
    expect(source).toContain('reference-capture-lte-r1-prearm.ts');
    expect(source).toContain('reference-capture-lte-r1-fast-go.ts');
  });
});
