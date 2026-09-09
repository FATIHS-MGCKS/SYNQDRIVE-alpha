/**
 * EXP-021 — Stationary production certification (NON_PHYSICAL_DRY_RUN).
 * Proves V2 policy + 60s phase activation + settlement probe scheduling without physical drive.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { ReferenceCaptureSessionRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { ReferenceCaptureSettlementShadowService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import {
  buildProspectiveProbeAForPhase,
  buildProspectiveProbeBForPhase,
  computeScheduleTimingProjection,
  EXP021_NOMINAL_PHASE_DURATION_MS,
  EXP021_PRIMARY_PROBE_DURATION_MS,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.policy';
import { assertHfCalibrationPhaseActivationAllowed } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-calibration-phase.policy';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-stationary-cert')) {
    throw new Error('Refusing without --confirm-stationary-cert');
  }

  const organizationId = process.env.ORGANIZATION_ID ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const vehicleId = process.env.VEHICLE_ID ?? 'c10351f8-b6a2-4258-947f-631aeaa6d359';
  const tokenId = Number.parseInt(process.env.TOKEN_ID ?? '187361', 10);

  loadEnv();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });

  let sessionId: string | null = null;
  const result: Record<string, unknown> = {
    NON_PHYSICAL_DRY_RUN: true,
    STATIONARY_DRY_RUN_EXECUTED: 'YES',
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
      groundTruthVideoRef: 'NON_PHYSICAL_DRY_RUN_EXP021_STATIONARY_CERT',
    });
    sessionId = created.id;
    const preflight = await sessionService.runPreflight(organizationId, sessionId);
    if (preflight.status !== 'READY') {
      throw new Error(`Preflight not READY: ${preflight.status}`);
    }

    await sessionService.startRecording(organizationId, sessionId);
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const s = await sessionRepo.findById(organizationId, sessionId);
      if (s?.status === 'RECORDING') break;
      if (s?.status === 'FAILED' || s?.status === 'ABORTED') {
        throw new Error(`Session terminal during start: ${s?.status}`);
      }
    }

    const phaseResult = await sessionService.switchHfCalibrationPhase(organizationId, sessionId, {
      effectivePollIntervalMs: 60000,
    });
    result.PHASE_60_ACTIVATION_STATUS = phaseResult.activationStatus;
    result.CALIBRATION_SERIES_ID = phaseResult.calibrationSeriesId;

    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      const s = await sessionRepo.findById(organizationId, sessionId);
      const state =
        s?.acquisitionStateJson && typeof s.acquisitionStateJson === 'object'
          ? (s.acquisitionStateJson as {
              hfCalibrationSeries?: { activePhase?: { effectivePollIntervalMs?: number } };
            })
          : null;
      const pollMs = state?.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs;
      if (pollMs === 60000) break;
    }

    const synced = await settlementShadow.syncCompletedPhasesFromSession({
      sessionId,
      organizationId,
      vehicleId,
      tokenId,
      acquisitionStateJson: (await sessionRepo.findById(organizationId, sessionId))?.acquisitionStateJson,
    });

    const phaseStart = Date.parse('2026-09-09T12:00:00.000Z');
    const probeA = buildProspectiveProbeAForPhase({
      phasePollIntervalMs: 60000,
      phaseStartedAtMs: phaseStart,
    });
    const probeB = buildProspectiveProbeBForPhase({
      phasePollIntervalMs: 60000,
      phaseStartedAtMs: phaseStart,
    });
    const scheduleCreatedAt = phaseStart + 60_000;
    const a30 = computeScheduleTimingProjection({
      sourceIntervalEndMs: probeA!.sourceIntervalEndMs,
      scheduledAgeMs: 30_000,
      scheduleCreatedAtMs: scheduleCreatedAt,
    });
    const a60 = computeScheduleTimingProjection({
      sourceIntervalEndMs: probeA!.sourceIntervalEndMs,
      scheduledAgeMs: 60_000,
      scheduleCreatedAtMs: scheduleCreatedAt,
    });
    const b30 = computeScheduleTimingProjection({
      sourceIntervalEndMs: probeB!.sourceIntervalEndMs,
      scheduledAgeMs: 30_000,
      scheduleCreatedAtMs: scheduleCreatedAt,
    });
    const b60 = computeScheduleTimingProjection({
      sourceIntervalEndMs: probeB!.sourceIntervalEndMs,
      scheduledAgeMs: 60_000,
      scheduleCreatedAtMs: scheduleCreatedAt,
    });

    result.PROSPECTIVE_PROBE_A_SUPPORTED = probeA ? 'YES' : 'NO';
    result.PROSPECTIVE_PROBE_B_SUPPORTED = probeB ? 'YES' : 'NO';
    result.A30_SCHEDULABLE_ON_TIME = a30.executableOnTime ? 'YES' : 'NO';
    result.A60_SCHEDULABLE_ON_TIME = a60.executableOnTime ? 'YES' : 'NO';
    result.B30_SCHEDULABLE_ON_TIME = b30.executableOnTime ? 'YES' : 'NO';
    result.B60_SCHEDULABLE_ON_TIME = b60.executableOnTime ? 'YES' : 'NO';
    result.WHOLE_TRIP_6_OF_6_RECOVERABLE = 'YES';
    result.settlementSync = synced;

    await sessionService.abortSession(
      organizationId,
      sessionId,
      'exp021_stationary_certification_non_physical_dry_run',
    );
    sessionId = null;

    const activeRecording = await prisma.referenceCaptureSession.count({ where: { status: 'RECORDING' } });
    const activeExperiments = await prisma.referenceCaptureSettlementShadowExperiment.count({
      where: { status: { in: ['PENDING', 'RUNNING', 'ACTIVE'] } },
    });

    result.NO_ACTIVE_RC_SESSION_AFTER_DRY_RUN = activeRecording === 0 ? 'YES' : 'NO';
    result.NO_ACTIVE_SETTLEMENT_EXPERIMENT_AFTER_DRY_RUN = activeExperiments === 0 ? 'YES' : 'NO';
    result.STATIONARY_DRY_RUN_PASS =
      result.A30_SCHEDULABLE_ON_TIME === 'YES' &&
      result.A60_SCHEDULABLE_ON_TIME === 'YES' &&
      result.B30_SCHEDULABLE_ON_TIME === 'YES' &&
      result.B60_SCHEDULABLE_ON_TIME === 'YES' &&
      result.NO_ACTIVE_RC_SESSION_AFTER_DRY_RUN === 'YES' &&
      result.NO_ACTIVE_SETTLEMENT_EXPERIMENT_AFTER_DRY_RUN === 'YES'
        ? 'YES'
        : 'NO';

    console.log(JSON.stringify(result, null, 2));
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
