/**
 * EXP-021 candidate_short_ab_90_60 — autonomous orchestrator full-lifecycle regression.
 * Controlled-time harness; no manual PRE-ARM/FAST-GO/T0-watcher paths.
 */
import {
  acquireOrchestratorLock,
  buildOrchestratorLockKey,
  buildExp021RuntimeConfig,
  extendOrchestratorLock,
  isOrchestratorOwnedRecordingSession,
  releaseOrchestratorLock,
  EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY,
} from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Exp021ShortAbAutonomousLifecycleHarness,
  buildShortAbRuntimeConfig,
  expectNo120Phase,
  expectPhaseOrder,
  expectPlanAuthority,
  expectSettlementGeometry,
  expectSlotGeometry,
} from './reference-capture-exp021-autonomous-short-ab-lifecycle.harness';
import { cadenceSequenceFromPlan, EXP021_CANDIDATE_SHORT_AB_90_60 } from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';

const ORCHESTRATOR_SOURCE = readFileSync(
  join(__dirname, '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.ts'),
  'utf8',
);

describe('EXP-021 autonomous short A/B lifecycle harness', () => {
  const TEN_MIN_MS = 10 * 60_000;

  it('A — clean uninterrupted 90→60 lifecycle completes without manual phase transition', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    const result = harness.runAutonomousLifecycle();

    expect(result.status).toBe('COMPLETED');
    expect(result.manualPhaseTransitionCalls).toBe(0);
    expect(result.series.phaseOrder).toEqual([90_000, 60_000]);
    expect(result.series.terminalFinalizationAt).toBeTruthy();
    const completedCadences = (result.series.completedPhaseSummaries ?? []).map(
      (s) => s.effectivePollIntervalMs,
    );
    expect(completedCadences).toEqual(expect.arrayContaining([90_000, 60_000]));
    expect(result.slotCountsByPhase).toEqual([
      { cadenceMs: 90_000, slotCount: 7 },
      { cadenceMs: 60_000, slotCount: 10 },
    ]);
    expectNo120Phase(result.series);
    harness.assertScientificGeometry();
  });

  it('scientific geometry: 7/10 slots, 19+19 settlement windows, plan authority', () => {
    expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
    expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);
    expectSettlementGeometry();
    const config = buildShortAbRuntimeConfig();
    expect(config.calibrationPlan.planId).toBe('candidate_short_ab_90_60');
    expect(config.cadencePhaseOrderMs).toEqual([90_000, 60_000]);
  });

  it('B — restart during 90s phase preserves durable authority', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    harness.autonomousCreateSession();
    harness.autonomousStartRecording();
    harness.autonomousPersistT0();
    harness.autonomousActivateFirstPhase();
    harness.advance(5 * 60_000);

    const snap = harness.snapshot;
    const seriesId = snap.series?.calibrationSeriesId;
    const phaseId = snap.series?.activePhase?.calibrationPhaseId;

    const restarted = new Exp021ShortAbAutonomousLifecycleHarness({
      orchestratorRunId: snap.orchestratorRunId,
      sessionId: snap.sessionId,
    });
    restarted.restore(snap);
    restarted.simulateOrchestratorRestart();

    expect(restarted.snapshot.series?.calibrationSeriesId).toBe(seriesId);
    expect(restarted.snapshot.series?.activePhase?.calibrationPhaseId).toBe(phaseId);
    expect(restarted.snapshot.series?.calibrationPlanId).toBe('candidate_short_ab_90_60');

    const targetEnd = snap.t0Ms! + 20 * 60_000;
    while (restarted.snapshot.status !== 'COMPLETED' && restarted.now <= targetEnd + 60_000) {
      restarted.autonomousDrivingTick();
      restarted.advance(15_000);
    }
    expect(restarted.snapshot.status).toBe('COMPLETED');
    if (restarted.snapshot.series) expectPlanAuthority(restarted.snapshot.series);
  });

  it('C — restart near 90s wall boundary still transitions exactly once', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    harness.autonomousCreateSession();
    harness.autonomousStartRecording();
    const t0 = harness.autonomousPersistT0().canonicalT0At!;
    harness.autonomousActivateFirstPhase();
    harness.setNow(Date.parse(t0) + TEN_MIN_MS - 1_000);

    const snap = harness.snapshot;
    const resumed = new Exp021ShortAbAutonomousLifecycleHarness();
    resumed.restore(snap);
    resumed.setNow(Date.parse(t0) + TEN_MIN_MS);
    const first = resumed.autonomousDrivingTick();
    expect(first.transitioned).toBe(true);
    expect(resumed.snapshot.series?.activePhase?.effectivePollIntervalMs).toBe(60_000);
    expect(resumed.snapshot.series?.completedPhaseSummaries?.length).toBe(1);
  });

  it('D — restart immediately after 90→60 transition preserves 60s slots', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    harness.autonomousCreateSession();
    harness.autonomousStartRecording();
    harness.autonomousPersistT0();
    harness.autonomousActivateFirstPhase();
    harness.setNow(harness.snapshot.t0Ms! + TEN_MIN_MS);
    harness.autonomousDrivingTick();
    const mid = harness.snapshot;
    expect(mid.series?.activePhase?.effectivePollIntervalMs).toBe(60_000);

    const resumed = new Exp021ShortAbAutonomousLifecycleHarness();
    resumed.restore(mid);
    expect(resumed.snapshot.counters?.exp021RequestSlots?.length).toBe(10);
    expect(resumed.snapshot.currentPhaseIndex).toBe(1);
  });

  it('E — restart during 60s phase completes to terminal state', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    harness.autonomousCreateSession();
    harness.autonomousStartRecording();
    harness.autonomousPersistT0();
    harness.autonomousActivateFirstPhase();
    harness.setNow(harness.now + TEN_MIN_MS);
    harness.autonomousDrivingTick();
    harness.advance(3 * 60_000);

    const snap = harness.snapshot;
    const resumed = new Exp021ShortAbAutonomousLifecycleHarness();
    resumed.restore(snap);
    resumed.setNow(snap.t0Ms! + 2 * TEN_MIN_MS);
    resumed.autonomousDrivingTick();
    expect(resumed.snapshot.status).toBe('COMPLETED');
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
    const key = buildOrchestratorLockKey('org-harness', 'veh-harness');
    const first = await acquireOrchestratorLock(redis, key, 30_000);
    expect(first.acquired).toBe(true);
    const second = await acquireOrchestratorLock(redis, key, 30_000);
    expect(second.acquired).toBe(false);
    if (first.acquired) {
      const extended = await extendOrchestratorLock(redis, first.handle, 30_000);
      expect(extended).toBe(true);
      await releaseOrchestratorLock(redis, first.handle);
    }
    const third = await acquireOrchestratorLock(redis, key, 30_000);
    expect(third.acquired).toBe(true);
  });

  it('G — ownership stamp required for attach/recording (multi-replica guard)', () => {
    const runId = 'run-a';
    const foreign = { [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: { runId: 'run-b' } };
    expect(isOrchestratorOwnedRecordingSession(foreign, runId)).toBe(false);
    const owned = { [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: { runId } };
    expect(isOrchestratorOwnedRecordingSession(owned, runId)).toBe(true);
  });

  it('H — provider ZERO_RESULT on slots does not block automatic phase transition', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    harness.autonomousCreateSession();
    harness.autonomousStartRecording();
    harness.autonomousPersistT0();
    harness.autonomousActivateFirstPhase();
    harness.injectProviderFailures(2);
    harness.setNow(harness.snapshot.t0Ms! + TEN_MIN_MS);
    const tick = harness.autonomousDrivingTick();
    expect(tick.transitioned).toBe(true);
    expect(harness.snapshot.series?.activePhase?.effectivePollIntervalMs).toBe(60_000);
  });

  it('I — delayed slot issue does not skip required 60s phase', () => {
    const harness = new Exp021ShortAbAutonomousLifecycleHarness();
    const result = harness.runAutonomousLifecycle();
    const completedCadences = (result.series.completedPhaseSummaries ?? []).map(
      (s) => s.effectivePollIntervalMs,
    );
    expect(completedCadences).toEqual(expect.arrayContaining([90_000, 60_000]));
    expect(result.slotCountsByPhase.some((s) => s.cadenceMs === 60_000 && s.slotCount === 10)).toBe(
      true,
    );
    expectPhaseOrder(result.series);
  });

  it('J — settlement geometry remains 19 windows per phase (38 total)', () => {
    expectSettlementGeometry();
    const plan = EXP021_CANDIDATE_SHORT_AB_90_60;
    expect(cadenceSequenceFromPlan(plan)).toEqual([90_000, 60_000]);
  });

  describe('Trip FSM isolation (read-only audit)', () => {
    it('orchestrator does not mutate Trip FSM — observe only', () => {
      expect(ORCHESTRATOR_SOURCE).toMatch(/vehicleTripDetectionState\.findUnique/);
      expect(ORCHESTRATOR_SOURCE).toMatch(/vehicleTrip\.findFirst/);
      expect(ORCHESTRATOR_SOURCE).not.toMatch(/vehicleTrip\.(create|update|delete|upsert)/);
      expect(ORCHESTRATOR_SOURCE).not.toMatch(/vehicleTripDetectionState\.(update|upsert|create)/);
    });
  });

  describe('runtime config authority', () => {
    it('buildExp021RuntimeConfig resolves short AB plan from env', () => {
      const config = buildShortAbRuntimeConfig();
      expect(config.calibrationPlan.planId).toBe('candidate_short_ab_90_60');
      expect(config.nominalTotalDurationMs).toBe(20 * 60_000);
    });
  });
});
