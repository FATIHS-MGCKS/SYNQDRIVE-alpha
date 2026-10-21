/**
 * EXP-021 — Stationary production certification (NON_PHYSICAL).
 * Default: structural dry-run with real phase-60 activation + persisted schedule proof.
 * Optional: --e2e-shadow-smoke waits for real A30/A60/B30/B60 observations via BullMQ worker.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { ReferenceCaptureSessionRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { ReferenceCaptureSettlementShadowService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import { assertHfCalibrationPhaseActivationAllowed } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-calibration-phase.policy';
import { EXP021_MANDATORY_AGES_MS } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.policy';
import {
  buildExp021RuntimeConfig,
  loadBackendEnvFile,
} from './reference-capture-exp-021-autonomous-orchestrator.lib';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPhaseEffective(
  sessionRepo: ReferenceCaptureSessionRepository,
  organizationId: string,
  sessionId: string,
  pollMs: number,
): Promise<boolean> {
  for (let i = 0; i < 45; i += 1) {
    await sleep(2000);
    const s = await sessionRepo.findById(organizationId, sessionId);
    const state =
      s?.acquisitionStateJson && typeof s.acquisitionStateJson === 'object'
        ? (s.acquisitionStateJson as {
            hfCalibrationSeries?: { activePhase?: { effectivePollIntervalMs?: number; phaseStartedAt?: string } };
          })
        : null;
    const ap = state?.hfCalibrationSeries?.activePhase;
    if (ap?.effectivePollIntervalMs === pollMs && ap.phaseStartedAt) {
      return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const e2eSmoke = process.argv.includes('--e2e-shadow-smoke');
  if (!process.argv.includes('--confirm-stationary-cert')) {
    throw new Error('Refusing without --confirm-stationary-cert');
  }

  loadBackendEnvFile();
  const runtimeConfig = buildExp021RuntimeConfig();
  const organizationId = runtimeConfig.organizationId;
  const vehicleId = runtimeConfig.vehicleId;
  const tokenId = runtimeConfig.tokenId;
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });

  let sessionId: string | null = null;
  const result: Record<string, unknown> = {
    NON_PHYSICAL_DRY_RUN: true,
    STATIONARY_DRY_RUN_EXECUTED: 'YES',
    E2E_SHADOW_SMOKE: e2eSmoke ? 'YES' : 'NO',
  };

  try {
    const prisma = app.get(PrismaService);
    const rcConfig = app.get(ReferenceCaptureConfig);
    const sessionService = app.get(ReferenceCaptureSessionService);
    const sessionRepo = app.get(ReferenceCaptureSessionRepository);
    const settlementShadow = app.get(ReferenceCaptureSettlementShadowService);

    const recording = await prisma.referenceCaptureSession.count({ where: { status: 'RECORDING' } });
    if (recording > 0) {
      throw new Error(`Refusing stationary cert: ${recording} RECORDING session(s) active`);
    }

    const hfBase = rcConfig.getHfRecoveryPolicyConfig();
    const hfEffective = rcConfig.resolveHfRecoveryPolicyForToken(tokenId);
    let policyAllowed = false;
    let policyBlocker: string | undefined;
    try {
      assertHfCalibrationPhaseActivationAllowed(hfEffective, hfBase);
      policyAllowed = true;
    } catch (error) {
      policyBlocker = error instanceof Error ? error.message : String(error);
    }
    result.EFFECTIVE_HF_POLICY_MODE = hfEffective.mode;
    result.CALIBRATION_PHASE_ACTIVATION_ALLOWED = policyAllowed ? 'YES' : 'NO';
    if (policyBlocker) result.policyBlocker = policyBlocker;
    result.SETTLEMENT_SHADOW_ENABLED = rcConfig.isSettlementShadowEnabled() ? 'YES' : 'NO';

    if (!policyAllowed) {
      throw new Error(policyBlocker ?? 'HF V2 policy gate failed');
    }
    if (!rcConfig.isSettlementShadowEnabled()) {
      throw new Error('Settlement shadow not enabled');
    }

    const created = await sessionService.createSession({
      organizationId,
      vehicleId,
      groundTruthVideoRef: e2eSmoke
        ? 'NON_PHYSICAL_E2E_SHADOW_SMOKE_EXP021'
        : 'NON_PHYSICAL_DRY_RUN_EXP021_STATIONARY_CERT',
    });
    sessionId = created.id;
    const preflight = await sessionService.runPreflight(organizationId, sessionId);
    if (preflight.status !== 'READY') {
      throw new Error(`Preflight not READY: ${preflight.status}`);
    }

    await sessionService.startRecording(organizationId, sessionId);
    for (let i = 0; i < 30; i += 1) {
      await sleep(2000);
      const s = await sessionRepo.findById(organizationId, sessionId);
      if (s?.status === 'RECORDING') break;
      if (s?.status === 'FAILED' || s?.status === 'ABORTED') {
        throw new Error(`Session terminal during start: ${s?.status}`);
      }
    }

    const phaseResult = await sessionService.switchHfCalibrationPhase(organizationId, sessionId, {
      effectivePollIntervalMs: 60000,
      phaseProvenance: 'PRE_ROLL',
    });
    result.PHASE_60_ACTIVATION_STATUS = phaseResult.activationStatus;
    result.CALIBRATION_SERIES_ID = phaseResult.calibrationSeriesId;

    const phase60Effective = await waitForPhaseEffective(sessionRepo, organizationId, sessionId, 60000);
    result.PHASE_60_EFFECTIVE_PROVEN = phase60Effective ? 'YES' : 'NO';
    if (!phase60Effective) {
      throw new Error('Phase 60 did not become EFFECTIVE in acquisition state');
    }

    await settlementShadow.syncCompletedPhasesFromSession({
      sessionId,
      organizationId,
      vehicleId,
      tokenId,
      acquisitionStateJson: (await sessionRepo.findById(organizationId, sessionId))?.acquisitionStateJson,
    });

    const persistedSchedules = await prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: { sessionId, probeId: { in: ['SP-60-A', 'SP-60-B'] } },
      select: { probeId: true, scheduledAgeMs: true, status: true, scheduledAt: true },
    });
    result.PHASE60_EXPECTED_SCHEDULES = 12;
    result.PHASE60_PERSISTED_SCHEDULES = persistedSchedules.length;
    result.PERSISTED_SCHEDULE_COUNT = persistedSchedules.length;
    for (const probeId of ['SP-60-A', 'SP-60-B']) {
      for (const age of EXP021_MANDATORY_AGES_MS) {
        const found = persistedSchedules.some(
          (row) => row.probeId === probeId && row.scheduledAgeMs === age,
        );
        result[`PERSISTED_${probeId}_${age / 1000}S`] = found ? 'YES' : 'NO';
      }
    }

    if (e2eSmoke) {
      const observationTargets = [
        { probeId: 'SP-60-A', age: 30_000, key: 'REAL_A30_OBSERVATION_EXECUTED' },
        { probeId: 'SP-60-A', age: 60_000, key: 'REAL_A60_OBSERVATION_EXECUTED' },
        { probeId: 'SP-60-B', age: 30_000, key: 'REAL_B30_OBSERVATION_EXECUTED' },
        { probeId: 'SP-60-B', age: 60_000, key: 'REAL_B60_OBSERVATION_EXECUTED' },
      ];
      for (const target of observationTargets) {
        result[target.key] = 'NO';
      }
      for (let minute = 0; minute < 8; minute += 1) {
        await sleep(60_000);
        for (const target of observationTargets) {
          if (result[target.key] === 'YES') continue;
          const obs = await prisma.referenceCaptureSettlementShadowObservation.findFirst({
            where: { sessionId, probeId: target.probeId, scheduledAgeMs: target.age },
            select: {
              actualAgeMs: true,
              scheduleDriftMs: true,
              providerRequestStatus: true,
              rawRowCount: true,
              requestStartedAt: true,
              observationJson: true,
            },
          });
          if (obs) {
            result[target.key] = 'YES';
            result[`${target.key}_META`] = {
              actualAgeMs: obs.actualAgeMs,
              scheduleDriftMs: obs.scheduleDriftMs,
              providerRequestStatus: obs.providerRequestStatus,
              rawRowCount: obs.rawRowCount,
              requestStartedAt: obs.requestStartedAt.toISOString(),
            };
          }
        }
        if (observationTargets.every((t) => result[t.key] === 'YES')) {
          break;
        }
      }
    } else {
      result.REAL_A30_OBSERVATION_EXECUTED = 'SKIPPED_NON_E2E';
      result.REAL_A60_OBSERVATION_EXECUTED = 'SKIPPED_NON_E2E';
      result.REAL_B30_OBSERVATION_EXECUTED = 'SKIPPED_NON_E2E';
      result.REAL_B60_OBSERVATION_EXECUTED = 'SKIPPED_NON_E2E';
    }

    result.WHOLE_TRIP_6_OF_6_RECOVERABLE = 'NOT_PROVEN_WITHOUT_STOP_RECORDING';

    await sessionService.abortSession(
      organizationId,
      sessionId,
      e2eSmoke
        ? 'exp021_stationary_e2e_shadow_smoke_complete'
        : 'exp021_stationary_certification_non_physical_dry_run',
    );
    sessionId = null;

    const activeRecording = await prisma.referenceCaptureSession.count({ where: { status: 'RECORDING' } });
    const activeExperiments = await prisma.referenceCaptureSettlementShadowExperiment.count({
      where: { status: { in: ['PENDING', 'RUNNING', 'ACTIVE'] } },
    });

    result.NO_ACTIVE_RC_SESSION_AFTER_DRY_RUN = activeRecording === 0 ? 'YES' : 'NO';
    result.NO_ACTIVE_SETTLEMENT_EXPERIMENT_AFTER_DRY_RUN = activeExperiments === 0 ? 'YES' : 'NO';

    const structuralPass =
      result.PHASE_60_EFFECTIVE_PROVEN === 'YES' &&
      result.PHASE60_PERSISTED_SCHEDULES === 12 &&
      result.NO_ACTIVE_RC_SESSION_AFTER_DRY_RUN === 'YES' &&
      result.NO_ACTIVE_SETTLEMENT_EXPERIMENT_AFTER_DRY_RUN === 'YES';

    const e2ePass =
      !e2eSmoke ||
      (result.REAL_A30_OBSERVATION_EXECUTED === 'YES' &&
        result.REAL_A60_OBSERVATION_EXECUTED === 'YES' &&
        result.REAL_B30_OBSERVATION_EXECUTED === 'YES' &&
        result.REAL_B60_OBSERVATION_EXECUTED === 'YES');

    result.STATIONARY_DRY_RUN_PASS = structuralPass && e2ePass ? 'YES' : 'NO';

    console.log(JSON.stringify(result, null, 2));
    if (result.STATIONARY_DRY_RUN_PASS !== 'YES') {
      throw new Error('Stationary certification failed');
    }
  } catch (error) {
    result.STATIONARY_DRY_RUN_PASS = 'NO';
    result.error = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify(result, null, 2));
    throw error;
  } finally {
    if (sessionId) {
      try {
        const sessionService = app.get(ReferenceCaptureSessionService);
        await sessionService.abortSession(
          organizationId,
          sessionId,
          'exp021_stationary_certification_cleanup_on_failure',
        );
      } catch {
        // best effort
      }
    }
    await app.close();
  }
}

main().catch(() => process.exit(1));
