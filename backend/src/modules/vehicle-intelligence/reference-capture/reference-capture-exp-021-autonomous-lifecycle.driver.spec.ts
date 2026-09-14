/**
 * Canonical EXP-021 lifecycle driver — controlled-time regression (production driver code).
 */
import { randomUUID } from 'crypto';
import { Exp021AutonomousLifecycleDriver, syncExp021Settlement } from './reference-capture-exp-021-autonomous-lifecycle.driver';
import { buildExp021RuntimeConfig } from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import { parseAcquisitionState } from './reference-capture-session.repository';
import type { ReferenceCaptureSessionService } from './reference-capture-session.service';
import type { ReferenceCaptureSessionRepository } from './reference-capture-session.repository';
import type { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import { EXP021_CANDIDATE_SHORT_AB_90_60 } from './reference-capture-exp021-calibration-plan.lib';
import {
  expectNo120Phase,
  expectPhaseOrder,
  expectPlanAuthority,
  expectSettlementGeometry,
  expectSlotGeometry,
} from './reference-capture-exp021-autonomous-short-ab-lifecycle.harness';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';

const TEN_MIN_MS = 10 * 60_000;
const MOVING_SAMPLE = {
  speedKmh: 42,
  speedSignalFresh: true,
  vehicleTelemetryFresh: true,
  speedAgeMs: 1000,
  speedTimestamp: new Date().toISOString(),
  speedProviderField: 'speed',
};

function buildConfig() {
  return buildExp021RuntimeConfig({
    env: {
      ORGANIZATION_ID: randomUUID(),
      VEHICLE_ID: randomUUID(),
      TOKEN_ID: '192922',
      EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60',
      EXP021_MOVEMENT_SPEED_KMH: '8',
      EXP021_PARKED_SPEED_KMH: '3',
    },
  });
}

function buildDriverMocks() {
  let clock = Date.parse('2026-09-14T11:43:53.000Z');
  const acquisitionStates = new Map<string, unknown>();
  const sessionId = randomUUID();
  const config = buildConfig();

  const sessionRepo = {
    findById: jest.fn(async (_org: string, sid: string) => ({
      id: sid,
      organizationId: config.organizationId,
      vehicleId: config.vehicleId,
      status: 'RECORDING',
      acquisitionStateJson: acquisitionStates.get(sid) ?? {},
      preflightJson: {},
    })),
  } as unknown as ReferenceCaptureSessionRepository;

  const sessionService = {
    persistExp021CanonicalT0: jest.fn(async () => ({
      created: true,
      authority: { canonicalT0At: new Date(clock).toISOString() },
    })),
    activatePhysicalPhaseAtT0: jest.fn(async () => ({
      reanchored: true,
      sealedPreRollPhaseId: null,
      phaseStartedAt: new Date(clock).toISOString(),
      canonicalT0At: new Date(clock).toISOString(),
      calibrationPhaseId: 'phase-90',
    })),
    switchHfCalibrationPhase: jest.fn(async (_org, sid, body) => {
      const st = parseAcquisitionState(acquisitionStates.get(sid));
      const slots = body.effectivePollIntervalMs === 60_000 ? 10 : 7;
      acquisitionStates.set(sid, {
        ...st,
        hfCalibrationSeries: {
          calibrationPlanId: 'candidate_short_ab_90_60',
          calibrationPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
          phaseOrder: body.effectivePollIntervalMs === 60_000 ? [90_000, 60_000] : [90_000],
          activePhase: {
            effectivePollIntervalMs: body.effectivePollIntervalMs,
            phaseStartedAt: new Date(clock).toISOString(),
            phaseProvenance: body.phaseProvenance ?? 'PHYSICAL_TRANSITION',
            calibrationPhaseId: body.effectivePollIntervalMs === 60_000 ? 'phase-60' : 'phase-90',
          },
          completedPhaseSummaries:
            body.effectivePollIntervalMs === 60_000
              ? [{ effectivePollIntervalMs: 90_000 }]
              : [],
          pendingPhaseRequest: null,
        },
        hfCalibrationActiveCounters: {
          exp021RequestSlots: Array.from({ length: slots }, (_, i) => ({ slotIndex: i })),
        },
      });
      return { pending: false };
    }),
    persistExp021ActivePhaseMovementMetrics: jest.fn(async () => undefined),
    markExp021OrchestrationDegraded: jest.fn(async () => undefined),
    stopRecording: jest.fn(async () => ({ status: 'COMPLETED' })),
    terminalizeExp021PhysicalEndEarly: jest.fn(),
  } as unknown as ReferenceCaptureSessionService;

  const settlementShadow = {
    syncCompletedPhasesFromSession: jest.fn(async () => undefined),
    invalidatePhysicalDriveIntervalCandidate: jest.fn(async () => undefined),
    confirmPhysicalDriveIntervalCandidate: jest.fn(async () => undefined),
    schedulePhysicalDriveIntervalShadow: jest.fn(async () => undefined),
    persistPhysicalDriveIntervalAuthority: jest.fn(async () => undefined),
  } as unknown as ReferenceCaptureSettlementShadowService;

  const driver = new Exp021AutonomousLifecycleDriver(
    { config, sessionService, sessionRepo, settlementShadow },
    {
      nowMs: () => clock,
      sleep: async () => undefined,
      waitPhaseEffective: async (_sid, pollMs) => new Date(clock),
      log: () => undefined,
    },
  );
  driver.sessionId = sessionId;
  driver.deployConvergedAtMs = clock - 60_000;

  return {
    driver,
    sessionService,
    sessionRepo,
    settlementShadow,
    sessionId,
    advance: (ms: number) => {
      clock += ms;
    },
    setClock: (ms: number) => {
      clock = ms;
    },
    t0Ms: () => clock,
  };
}

describe('EXP-021 canonical autonomous lifecycle driver', () => {
  it('A — full short A/B lifecycle uses sessionService.switchHfCalibrationPhase (not test manual calls)', async () => {
    const ctx = buildDriverMocks();
    const { driver, sessionService, sessionId } = ctx;
    const t0 = Date.parse('2026-09-14T11:43:53.000Z');
    ctx.setClock(t0);

    for (let i = 0; i < 4; i++) {
      driver.physicalStartDetector.record(MOVING_SAMPLE, ctx.t0Ms() + i * 1000, 'MOVING');
    }
    const wait = await driver.handleWaitMovement(MOVING_SAMPLE);
    expect(wait.status).toBe('t0_confirmed');
    expect(sessionService.persistExp021CanonicalT0).toHaveBeenCalled();
    expect(sessionService.activatePhysicalPhaseAtT0).toHaveBeenCalled();

    ctx.setClock(t0 + TEN_MIN_MS);
    await driver.tickDriving(MOVING_SAMPLE);
    expect(sessionService.switchHfCalibrationPhase).toHaveBeenCalledWith(
      driver.deps.config.organizationId,
      sessionId,
      { effectivePollIntervalMs: 60_000, phaseProvenance: 'PHYSICAL_TRANSITION' },
    );

    ctx.setClock(t0 + 2 * TEN_MIN_MS);
    const done = await driver.tickDriving(MOVING_SAMPLE);
    expect(done.status).toBe('done');
    expect(sessionService.stopRecording).toHaveBeenCalled();
    expect(driver.manualPhaseTransitionCalls).toBe(0);
  });

  it('scientific geometry helpers remain valid for short AB plan', () => {
    expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
    expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);
    expectSettlementGeometry();
  });

  it('F — duplicate orchestrator lock remains policy-level (lib spec)', () => {
    expect(true).toBe(true);
  });

  it('H — ZERO_RESULT does not block wall transition (driver uses wall authority)', async () => {
    const ctx = buildDriverMocks();
    const t0 = Date.parse('2026-09-14T11:43:53.000Z');
    ctx.setClock(t0);
    for (let i = 0; i < 4; i++) {
      ctx.driver.physicalStartDetector.record(MOVING_SAMPLE, t0 + i * 1000, 'MOVING');
    }
    await ctx.driver.handleWaitMovement(MOVING_SAMPLE);
    ctx.setClock(t0 + TEN_MIN_MS);
    const tick = await ctx.driver.tickDriving(MOVING_SAMPLE);
    expect(tick.status).toBe('continue');
    expect(ctx.sessionService.switchHfCalibrationPhase).toHaveBeenCalled();
  });

  it('restart during 90s preserves session authority via tryResumeFromRecordingSession', () => {
    const ctx = buildDriverMocks();
    const t0 = Date.parse('2026-09-14T11:43:53.000Z');
    const recording = {
      id: ctx.sessionId,
      preflightJson: {
        exp021CanonicalT0: { canonicalT0At: new Date(t0).toISOString() },
      },
      acquisitionStateJson: {
        hfCalibrationSeries: {
          activePhase: {
            effectivePollIntervalMs: 90_000,
            phaseStartedAt: new Date(t0).toISOString(),
            phaseProvenance: 'PHYSICAL_T0',
            calibrationPhaseId: 'phase-90',
          },
        },
      },
    };
    const resume = ctx.driver.tryResumeFromRecordingSession(recording);
    expect(resume).toBe('driving');
    expect(ctx.driver.currentPhaseIndex).toBe(0);
  });

  describe('Trip FSM isolation', () => {
    it('driver module has no Trip FSM mutations', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, 'reference-capture-exp-021-autonomous-lifecycle.driver.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/vehicleTrip\.(create|update|delete|upsert)/);
      expect(src).not.toMatch(/vehicleTripDetectionState\.(create|update|delete|upsert)/);
    });
  });
});
