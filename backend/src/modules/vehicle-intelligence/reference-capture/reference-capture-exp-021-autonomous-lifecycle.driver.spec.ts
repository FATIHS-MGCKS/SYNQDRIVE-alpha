/**
 * Canonical EXP-021 lifecycle driver — controlled-time production-path regression.
 * Uses the same Exp021AutonomousLifecycleDriver as reference-capture-exp-021-autonomous-orchestrator.ts.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  acquireOrchestratorLock,
  buildExp021RuntimeConfig,
  buildOrchestratorLockKey,
  extendOrchestratorLock,
  EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY,
  isOrchestratorOwnedRecordingSession,
  releaseOrchestratorLock,
} from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import {
  Exp021AutonomousLifecycleDriver,
  syncExp021Settlement,
} from './reference-capture-exp-021-autonomous-lifecycle.driver';
import { parseAcquisitionState } from './reference-capture-session.repository';
import type { ReferenceCaptureSessionService } from './reference-capture-session.service';
import type { ReferenceCaptureSessionRepository } from './reference-capture-session.repository';
import type { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import {
  cadenceSequenceFromPlan,
  EXP021_CANDIDATE_SHORT_AB_90_60,
} from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';
import {
  expectNo120Phase,
  expectPhaseOrder,
  expectPlanAuthority,
  expectSettlementGeometry,
  expectSlotGeometry,
} from './reference-capture-exp021-short-ab-geometry.assertions';
import type { SpeedSample } from './reference-capture-exp-021-motion.lib';
import {
  buildExp021PhysicalAuthority,
  EXP021_PHYSICAL_AUTHORITY_KEY,
  mergeExp021PhysicalAuthority,
} from './reference-capture-exp-021-physical-authority.lib';

const TEN_MIN_MS = 10 * 60_000;
const NOMINAL_TOTAL_MS = 20 * 60_000;
const T0_ISO = '2026-09-14T11:43:53.000Z';

const MOVING_SAMPLE: SpeedSample = {
  speedKmh: 42,
  speedUnit: 'km/h',
  speedSignalFresh: true,
  vehicleTelemetryFresh: true,
  speedAgeMs: 1000,
  speedTimestamp: new Date(T0_ISO).toISOString(),
  speedProviderField: 'speed',
};

const ORCHESTRATOR_SOURCE = readFileSync(
  join(__dirname, '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.ts'),
  'utf8',
);
const DRIVER_SOURCE = readFileSync(
  join(__dirname, 'reference-capture-exp-021-autonomous-lifecycle.driver.ts'),
  'utf8',
);

interface LifecycleTestContext {
  config: ReturnType<typeof buildConfig>;
  sessionId: string;
  orchestratorRunId: string;
  sessionService: ReferenceCaptureSessionService;
  sessionRepo: ReferenceCaptureSessionRepository;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  acquisitionStates: Map<string, unknown>;
  preflightBySession: Map<string, Record<string, unknown>>;
  sessionStatus: Map<string, 'READY' | 'RECORDING' | 'COMPLETED'>;
  switchPhaseCallCount: number;
  persistT0CallCount: number;
  clock: number;
  createDriver(): Exp021AutonomousLifecycleDriver;
  advance(ms: number): void;
  setClock(ms: number): void;
  getState(): ReturnType<typeof parseAcquisitionState>;
  recordingRow(): { id: string; preflightJson: unknown; acquisitionStateJson: unknown };
}

function canonicalT0FromPreflight(preflight: Record<string, unknown> | undefined): string | undefined {
  const block = preflight?.[EXP021_PHYSICAL_AUTHORITY_KEY];
  if (block && typeof block === 'object' && block !== null && 'canonicalT0At' in block) {
    const at = (block as { canonicalT0At: unknown }).canonicalT0At;
    return typeof at === 'string' ? at : undefined;
  }
  return undefined;
}

function buildConfig() {
  return buildExp021RuntimeConfig({
    env: {
      ORGANIZATION_ID: randomUUID(),
      VEHICLE_ID: randomUUID(),
      TOKEN_ID: '192922',
      EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60',
      EXP021_TARGET_DEPLOY_SHA: 'driver-regression-test-sha',
      EXP021_MOVEMENT_SPEED_KMH: '8',
      EXP021_PARKED_SPEED_KMH: '3',
    },
  });
}

function buildLifecycleContext(options?: {
  sessionId?: string;
  orchestratorRunId?: string;
  startMs?: number;
}): LifecycleTestContext {
  let clock = options?.startMs ?? Date.parse(T0_ISO);
  const config = buildConfig();
  const sessionId = options?.sessionId ?? randomUUID();
  const orchestratorRunId = options?.orchestratorRunId ?? `exp021-driver-${randomUUID()}`;
  const acquisitionStates = new Map<string, unknown>();
  const preflightBySession = new Map<string, Record<string, unknown>>();
  const sessionStatus = new Map<string, 'READY' | 'RECORDING' | 'COMPLETED'>();
  sessionStatus.set(sessionId, 'RECORDING');
  let switchPhaseCallCount = 0;
  let persistT0CallCount = 0;

  const sessionRepo = {
    findById: jest.fn(async (_org: string, sid: string) => ({
      id: sid,
      organizationId: config.organizationId,
      vehicleId: config.vehicleId,
      status: sessionStatus.get(sid) ?? 'RECORDING',
      acquisitionStateJson: acquisitionStates.get(sid) ?? {},
      preflightJson: preflightBySession.get(sid) ?? {},
    })),
  } as unknown as ReferenceCaptureSessionRepository;

  const baseSeries = (sid: string, overrides: Record<string, unknown> = {}) => ({
    calibrationSeriesId: `series-${sid}`,
    vehicleId: config.vehicleId,
    tokenId: typeof config.tokenId === 'number' ? config.tokenId : Number.parseInt(String(config.tokenId), 10),
    seriesStartedAt: new Date(clock).toISOString(),
    calibrationPlanId: 'candidate_short_ab_90_60',
    calibrationPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
    completedPhases: [],
    completedPhaseSummaries: [],
    pendingPhaseRequest: null,
    terminalFinalizationAt: null,
    ...overrides,
  });

  const sessionService = {
    persistExp021CanonicalT0: jest.fn(async (_org, sid, body) => {
      persistT0CallCount += 1;
      const authority = buildExp021PhysicalAuthority({
        firstQualifyingMovementAt: body.firstQualifyingMovementAt,
        startConfirmedAt: body.startConfirmedAt,
        persistedAtMs: body.nowMs,
      });
      preflightBySession.set(
        sid,
        mergeExp021PhysicalAuthority(preflightBySession.get(sid), authority) as Record<string, unknown>,
      );
      return { created: persistT0CallCount === 1, authority };
    }),
    activatePhysicalPhaseAtT0: jest.fn(async (_org, sid, body) => {
      const slots = body.effectivePollIntervalMs === 60_000 ? 10 : 7;
      acquisitionStates.set(sid, {
        hfCalibrationSeries: baseSeries(sid, {
          phaseOrder: [90_000],
          activePhase: {
            effectivePollIntervalMs: 90_000,
            phaseStartedAt: new Date(clock).toISOString(),
            phaseProvenance: 'PHYSICAL_T0',
            calibrationPhaseId: 'phase-90',
          },
        }),
        hfCalibrationActiveCounters: {
          exp021RequestSlots: Array.from({ length: slots }, (_, i) => ({ slotIndex: i })),
        },
      });
      return {
        reanchored: true,
        sealedPreRollPhaseId: null,
        phaseStartedAt: new Date(clock).toISOString(),
        canonicalT0At:
          canonicalT0FromPreflight(preflightBySession.get(sid)) ?? new Date(clock).toISOString(),
        calibrationPhaseId: 'phase-90',
      };
    }),
    switchHfCalibrationPhase: jest.fn(async (_org, sid, body) => {
      switchPhaseCallCount += 1;
      const st = parseAcquisitionState(acquisitionStates.get(sid));
      const slots = body.effectivePollIntervalMs === 60_000 ? 10 : 7;
      const prev = st.hfCalibrationSeries?.activePhase;
      acquisitionStates.set(sid, {
        ...st,
        hfCalibrationSeries: baseSeries(sid, {
          phaseOrder: body.effectivePollIntervalMs === 60_000 ? [90_000, 60_000] : [90_000],
          activePhase: {
            effectivePollIntervalMs: body.effectivePollIntervalMs,
            phaseStartedAt: new Date(clock).toISOString(),
            phaseProvenance: body.phaseProvenance ?? 'PHYSICAL_TRANSITION',
            calibrationPhaseId: body.effectivePollIntervalMs === 60_000 ? 'phase-60' : 'phase-90',
          },
          completedPhaseSummaries: prev
            ? [{ effectivePollIntervalMs: prev.effectivePollIntervalMs, calibrationPhaseId: prev.calibrationPhaseId }]
            : [],
        }),
        hfCalibrationActiveCounters: {
          exp021RequestSlots: Array.from({ length: slots }, (_, i) => ({ slotIndex: i })),
        },
      });
      return { pending: false };
    }),
    persistExp021ActivePhaseMovementMetrics: jest.fn(async () => undefined),
    markExp021OrchestrationDegraded: jest.fn(async () => undefined),
    stopRecording: jest.fn(async (_org, sid) => {
      sessionStatus.set(sid, 'COMPLETED');
      const st = parseAcquisitionState(acquisitionStates.get(sid));
      const priorSeries = st.hfCalibrationSeries;
      acquisitionStates.set(sid, {
        ...st,
        hfCalibrationSeries: priorSeries
          ? {
              ...priorSeries,
              activePhase: null,
              terminalFinalizationAt: new Date(clock).toISOString(),
              completedPhaseSummaries: [
                ...(priorSeries.completedPhaseSummaries ?? []),
                priorSeries.activePhase
                  ? {
                      effectivePollIntervalMs: priorSeries.activePhase.effectivePollIntervalMs,
                      calibrationPhaseId: priorSeries.activePhase.calibrationPhaseId,
                    }
                  : { effectivePollIntervalMs: 60_000, calibrationPhaseId: 'phase-60' },
              ],
            }
          : null,
      });
      return { status: 'COMPLETED' };
    }),
    terminalizeExp021PhysicalEndEarly: jest.fn(),
  } as unknown as ReferenceCaptureSessionService;

  const settlementShadow = {
    syncCompletedPhasesFromSession: jest.fn(async () => undefined),
    invalidatePhysicalDriveIntervalCandidate: jest.fn(async () => undefined),
    confirmPhysicalDriveIntervalCandidate: jest.fn(async () => undefined),
    schedulePhysicalDriveIntervalShadow: jest.fn(async () => undefined),
    persistPhysicalDriveIntervalAuthority: jest.fn(async () => undefined),
  } as unknown as ReferenceCaptureSettlementShadowService;

  const createDriver = () =>
    new Exp021AutonomousLifecycleDriver(
      { config, sessionService, sessionRepo, settlementShadow },
      {
        nowMs: () => clock,
        sleep: async () => undefined,
        waitPhaseEffective: async (_sid, pollMs) => new Date(clock),
        log: () => undefined,
      },
    );

  return {
    config,
    sessionId,
    orchestratorRunId,
    sessionService,
    sessionRepo,
    settlementShadow,
    acquisitionStates,
    preflightBySession,
    sessionStatus,
    switchPhaseCallCount: 0,
    persistT0CallCount: 0,
    clock,
    createDriver,
    advance(ms: number) {
      clock += ms;
    },
    setClock(ms: number) {
      clock = ms;
    },
    getState() {
      return parseAcquisitionState(acquisitionStates.get(sessionId));
    },
    recordingRow() {
      return {
        id: sessionId,
        preflightJson: preflightBySession.get(sessionId) ?? {},
        acquisitionStateJson: acquisitionStates.get(sessionId) ?? {},
      };
    },
  };
}

async function confirmT0ViaDriver(
  ctx: LifecycleTestContext,
  driver: Exp021AutonomousLifecycleDriver,
): Promise<void> {
  const t0 = Date.parse(T0_ISO);
  ctx.setClock(t0);
  driver.deployConvergedAtMs = t0 - 120_000;
  driver.sessionId = ctx.sessionId;
  ctx.preflightBySession.set(ctx.sessionId, {
    [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: {
      runId: ctx.orchestratorRunId,
      startedAt: new Date(t0 - 60_000).toISOString(),
    },
  });
  for (let i = 0; i < 4; i++) {
    const sample: SpeedSample = {
      ...MOVING_SAMPLE,
      speedTimestamp: new Date(t0 + i * 1000).toISOString(),
    };
    driver.physicalStartDetector.record(sample, t0 + i * 1000, 'MOVING');
  }
  const wait = await driver.handleWaitMovement({
    ...MOVING_SAMPLE,
    speedTimestamp: new Date(t0 + 3_000).toISOString(),
  });
  expect(wait.status).toBe('t0_confirmed');
}

async function runDrivingToCompletion(
  ctx: LifecycleTestContext,
  driver: Exp021AutonomousLifecycleDriver,
): Promise<'FINAL_PHASE_WALL_CLOCK' | 'PHYSICAL_RUN_ENDED_EARLY'> {
  const t0 = Date.parse(T0_ISO);
  const targetEnd = t0 + NOMINAL_TOTAL_MS;
  let stopReason: 'FINAL_PHASE_WALL_CLOCK' | 'PHYSICAL_RUN_ENDED_EARLY' = 'FINAL_PHASE_WALL_CLOCK';
  while (!driver.physicalDriveEnded && ctx.clock <= targetEnd + 60_000) {
    const tick = await driver.tickDriving(MOVING_SAMPLE);
    if (tick.status === 'done') {
      stopReason = tick.stopReason;
      break;
    }
    ctx.advance(15_000);
  }
  if (!driver.physicalDriveEnded) {
    ctx.setClock(targetEnd);
    const finalTick = await driver.tickDriving(MOVING_SAMPLE);
    if (finalTick.status === 'done') stopReason = finalTick.stopReason;
  }
  return stopReason;
}

describe('EXP-021 canonical autonomous lifecycle driver', () => {
  it('A — full short A/B lifecycle: driver owns transitions (no test manual phase calls)', async () => {
    const ctx = buildLifecycleContext();
    const driver = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver);

    expect(ctx.sessionService.persistExp021CanonicalT0).toHaveBeenCalled();
    expect(ctx.sessionService.activatePhysicalPhaseAtT0).toHaveBeenCalled();
    expect(driver.manualPhaseTransitionCalls).toBe(0);

    const stopReason = await runDrivingToCompletion(ctx, driver);
    expect(stopReason).toBe('FINAL_PHASE_WALL_CLOCK');
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalledTimes(1);
    expect(ctx.sessionService.stopRecording).toHaveBeenCalled();

    const st = ctx.getState();
    expect(st.hfCalibrationSeries?.phaseOrder).toEqual([90_000, 60_000]);
    expect(st.hfCalibrationSeries?.terminalFinalizationAt).toBeTruthy();
    expect(ctx.sessionStatus.get(ctx.sessionId)).toBe('COMPLETED');
    if (st.hfCalibrationSeries) {
      expectPhaseOrder(st.hfCalibrationSeries);
      expectNo120Phase(st.hfCalibrationSeries);
      expectPlanAuthority(st.hfCalibrationSeries);
    }
    expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
    expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);
    expectSettlementGeometry();
  });

  it('scientific geometry: 7/10 slots, 19+19 settlement windows, plan authority', () => {
    expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
    expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);
    expectSettlementGeometry();
    const config = buildConfig();
    expect(config.calibrationPlan.planId).toBe('candidate_short_ab_90_60');
    expect(config.cadencePhaseOrderMs).toEqual([90_000, 60_000]);
    expect(cadenceSequenceFromPlan(EXP021_CANDIDATE_SHORT_AB_90_60)).toEqual([90_000, 60_000]);
  });

  it('B — restart during active 90s phase preserves authority and completes once', async () => {
    const ctx = buildLifecycleContext();
    const driver1 = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver1);
    ctx.advance(5 * 60_000);
    const seriesId = ctx.getState().hfCalibrationSeries?.calibrationSeriesId;
    const phaseId = ctx.getState().hfCalibrationSeries?.activePhase?.calibrationPhaseId;

    const driver2 = ctx.createDriver();
    const resume = driver2.tryResumeFromRecordingSession(ctx.recordingRow());
    expect(resume).toBe('driving');
    expect(driver2.currentPhaseIndex).toBe(0);
    expect(ctx.getState().hfCalibrationSeries?.calibrationSeriesId).toBe(seriesId);
    expect(ctx.getState().hfCalibrationSeries?.activePhase?.calibrationPhaseId).toBe(phaseId);

    await runDrivingToCompletion(ctx, driver2);
    expect(ctx.sessionStatus.get(ctx.sessionId)).toBe('COMPLETED');
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalledTimes(1);
    expect(ctx.sessionService.persistExp021CanonicalT0).toHaveBeenCalledTimes(1);
  });

  it('C — restart near 90s wall boundary transitions exactly once', async () => {
    const ctx = buildLifecycleContext();
    const driver1 = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver1);
    const t0 = Date.parse(T0_ISO);
    ctx.setClock(t0 + TEN_MIN_MS - 1_000);

    const driver2 = ctx.createDriver();
    driver2.tryResumeFromRecordingSession(ctx.recordingRow());
    ctx.setClock(t0 + TEN_MIN_MS);
    await driver2.tickDriving(MOVING_SAMPLE);
    expect(ctx.getState().hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalledTimes(1);
  });

  it('D — restart immediately after 90→60 preserves 60s slot geometry', async () => {
    const ctx = buildLifecycleContext();
    const driver1 = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver1);
    const t0 = Date.parse(T0_ISO);
    ctx.setClock(t0 + TEN_MIN_MS);
    await driver1.tickDriving(MOVING_SAMPLE);
    expect(ctx.getState().hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);

    const driver2 = ctx.createDriver();
    driver2.tryResumeFromRecordingSession(ctx.recordingRow());
    expect(driver2.currentPhaseIndex).toBe(1);
    expect(ctx.getState().hfCalibrationActiveCounters?.exp021RequestSlots?.length).toBe(10);
  });

  it('E — restart during 60s phase completes to terminal', async () => {
    const ctx = buildLifecycleContext();
    const driver1 = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver1);
    const t0 = Date.parse(T0_ISO);
    ctx.setClock(t0 + TEN_MIN_MS);
    await driver1.tickDriving(MOVING_SAMPLE);
    ctx.advance(3 * 60_000);

    const driver2 = ctx.createDriver();
    driver2.tryResumeFromRecordingSession(ctx.recordingRow());
    ctx.setClock(t0 + 2 * TEN_MIN_MS);
    const done = await driver2.tickDriving(MOVING_SAMPLE);
    expect(done.status).toBe('done');
    expect(ctx.sessionStatus.get(ctx.sessionId)).toBe('COMPLETED');
  });

  it('F — duplicate orchestrator startup fails closed on Redis lock', async () => {
    const store = new Map<string, string>();
    const redis = {
      async set(key: string, value: string, _mode: string, _ttl: number, nx: string) {
        if (nx === 'NX' && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      },
      async eval(script: string, _numKeys: number, key: string, token: string) {
        if (script.includes('pexpire')) return store.get(key) === token ? 1 : 0;
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      },
    } as unknown as Pick<import('ioredis').default, 'set' | 'eval'>;
    const key = buildOrchestratorLockKey('org-driver', 'veh-driver');
    const first = await acquireOrchestratorLock(redis, key, 30_000);
    expect(first.acquired).toBe(true);
    const second = await acquireOrchestratorLock(redis, key, 30_000);
    expect(second.acquired).toBe(false);
    if (first.acquired) {
      expect(await extendOrchestratorLock(redis, first.handle, 30_000)).toBe(true);
      await releaseOrchestratorLock(redis, first.handle);
    }
    expect((await acquireOrchestratorLock(redis, key, 30_000)).acquired).toBe(true);
  });

  it('G — ownership stamp required for attach/recording (multi-replica guard)', () => {
    const runId = 'run-a';
    expect(
      isOrchestratorOwnedRecordingSession(
        { [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: { runId: 'run-b' } },
        runId,
      ),
    ).toBe(false);
    expect(
      isOrchestratorOwnedRecordingSession(
        { [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: { runId } },
        runId,
      ),
    ).toBe(true);
  });

  it('H — ZERO_RESULT tolerance: wall authority still transitions 90→60', async () => {
    const ctx = buildLifecycleContext();
    const driver = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver);
    const st = ctx.getState();
    if (st.hfCalibrationActiveCounters) {
      st.hfCalibrationActiveCounters.nativeFastLoopProviderZeroResultCount = 3;
      ctx.acquisitionStates.set(ctx.sessionId, st);
    }
    const t0 = Date.parse(T0_ISO);
    ctx.setClock(t0 + TEN_MIN_MS);
    const tick = await driver.tickDriving(MOVING_SAMPLE);
    expect(tick.status).toBe('continue');
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalled();
  });

  it('slot geometry assertions track active phase counters', async () => {
    const ctx = buildLifecycleContext();
    const driver = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver);
    const st90 = ctx.getState();
    if (st90.hfCalibrationSeries) {
      expectSlotGeometry(st90.hfCalibrationActiveCounters ?? null, st90.hfCalibrationSeries);
    }
    const t0 = Date.parse(T0_ISO);
    ctx.setClock(t0 + TEN_MIN_MS);
    await driver.tickDriving(MOVING_SAMPLE);
    const st60 = ctx.getState();
    if (st60.hfCalibrationSeries) {
      expectSlotGeometry(st60.hfCalibrationActiveCounters ?? null, st60.hfCalibrationSeries);
    }
  });

  it('E-terminal — restart after completed lifecycle does not duplicate T0 or phase transitions', async () => {
    const ctx = buildLifecycleContext();
    const driver1 = ctx.createDriver();
    await confirmT0ViaDriver(ctx, driver1);
    await runDrivingToCompletion(ctx, driver1);
    expect(ctx.sessionStatus.get(ctx.sessionId)).toBe('COMPLETED');
    expect(ctx.getState().hfCalibrationSeries?.terminalFinalizationAt).toBeTruthy();

    const driver2 = ctx.createDriver();
    const resume = driver2.tryResumeFromRecordingSession(ctx.recordingRow());
    expect(resume).toBe('wait_movement');
    expect(ctx.sessionService.persistExp021CanonicalT0).toHaveBeenCalledTimes(1);
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalledTimes(1);
    expect(driver2.physicalDriveEnded).toBe(false);
  });

  it('syncExp021Settlement delegates to settlement shadow via repository read', async () => {
    const ctx = buildLifecycleContext();
    await syncExp021Settlement(
      ctx.settlementShadow,
      ctx.sessionRepo,
      ctx.config,
      ctx.sessionId,
    );
    expect(ctx.settlementShadow.syncCompletedPhasesFromSession).toHaveBeenCalled();
  });

  describe('Trip FSM isolation (read-only audit)', () => {
    it('orchestrator observes trip state only — no Trip FSM mutations', () => {
      expect(ORCHESTRATOR_SOURCE).toMatch(/vehicleTripDetectionState\.findUnique/);
      expect(ORCHESTRATOR_SOURCE).toMatch(/vehicleTrip\.findFirst/);
      expect(ORCHESTRATOR_SOURCE).not.toMatch(/vehicleTrip\.(create|update|delete|upsert)/);
      expect(ORCHESTRATOR_SOURCE).not.toMatch(/vehicleTripDetectionState\.(update|upsert|create)/);
    });

    it('canonical lifecycle driver has no Trip FSM writes', () => {
      expect(DRIVER_SOURCE).not.toMatch(/vehicleTrip\.(create|update|delete|upsert)/);
      expect(DRIVER_SOURCE).not.toMatch(/vehicleTripDetectionState\.(create|update|delete|upsert)/);
    });
  });
});
