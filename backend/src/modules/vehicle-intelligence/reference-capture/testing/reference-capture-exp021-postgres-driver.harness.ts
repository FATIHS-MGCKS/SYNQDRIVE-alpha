/**
 * PostgreSQL persistence bridge for Exp021AutonomousLifecycleDriver integration tests.
 * Delegates sessionService calls to repository atomic methods — not a lifecycle reimplementation.
 */
import type { PrismaClient } from '@prisma/client';
import { buildExp021RuntimeConfig } from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import { Exp021AutonomousLifecycleDriver } from '../reference-capture-exp-021-autonomous-lifecycle.driver';
import type { ReferenceCaptureSessionService } from '../reference-capture-session.service';
import type { ReferenceCaptureSettlementShadowService } from '../reference-capture-settlement-shadow.service';
import {
  parseAcquisitionState,
  type ReferenceCaptureSessionRepository,
} from '../reference-capture-session.repository';
import type { HfRecoveryPolicyV2Config } from '../reference-capture-hf-recovery-v2.policy';
import type { ReferenceCaptureSeed } from './reference-capture-postgres.integration.harness';
import { activatePendingPhaseAtBoundary } from './reference-capture-postgres.integration.harness';
import type { SpeedSample } from '../reference-capture-exp-021-motion.lib';

export const EXP021_PG_MOVING_SAMPLE: SpeedSample = {
  speedKmh: 42,
  speedUnit: 'km/h',
  speedSignalFresh: true,
  vehicleTelemetryFresh: true,
  speedAgeMs: 1000,
  speedTimestamp: new Date('2026-09-14T11:43:53.000Z').toISOString(),
  speedProviderField: 'speed',
};

export function buildPostgresExp021RuntimeConfig(organizationId: string, vehicleId: string, tokenId: number) {
  return buildExp021RuntimeConfig({
    env: {
      ORGANIZATION_ID: organizationId,
      VEHICLE_ID: vehicleId,
      TOKEN_ID: String(tokenId),
      EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60',
      EXP021_TARGET_DEPLOY_SHA: 'exp021-postgres-integration-sha',
      EXP021_MOVEMENT_SPEED_KMH: '8',
      EXP021_PARKED_SPEED_KMH: '3',
    },
  });
}

export function createPostgresDriverSessionServiceAdapter(args: {
  repo: ReferenceCaptureSessionRepository;
  seed: ReferenceCaptureSeed;
  hfPolicy: HfRecoveryPolicyV2Config;
  getNowMs: () => number;
}): ReferenceCaptureSessionService {
  const { repo, seed, hfPolicy, getNowMs } = args;
  return {
    persistExp021CanonicalT0: async (_org, sid, body) => {
      const result = await repo.persistExp021CanonicalT0Atomic({
        organizationId: seed.organizationId,
        sessionId: sid,
        firstQualifyingMovementAt: body.firstQualifyingMovementAt,
        startConfirmedAt: body.startConfirmedAt,
        nowMs: body.nowMs,
      });
      if (!result) throw new Error('persistExp021CanonicalT0Atomic returned null');
      return result;
    },
    activatePhysicalPhaseAtT0: async (_org, sid, body) => {
      const result = await repo.activatePhysicalPhaseAtT0Atomic({
        organizationId: seed.organizationId,
        sessionId: sid,
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        effectivePollIntervalMs: body.effectivePollIntervalMs,
        hfPolicy,
        nowMs: getNowMs(),
      });
      if (!result) throw new Error('activatePhysicalPhaseAtT0Atomic returned null');
      return {
        reanchored: result.reanchored,
        sealedPreRollPhaseId: result.sealedPreRollPhaseId,
        phaseStartedAt: result.phaseStartedAt,
        canonicalT0At: result.canonicalT0At,
        calibrationPhaseId: result.activePhase.calibrationPhaseId,
      };
    },
    switchHfCalibrationPhase: async (_org, sid, body) => {
      const atomic = await repo.requestHfCalibrationPhaseAtomic({
        organizationId: seed.organizationId,
        sessionId: sid,
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        effectivePollIntervalMs: body.effectivePollIntervalMs,
        nowMs: getNowMs(),
        phaseProvenance: body.phaseProvenance ?? 'PHYSICAL_TRANSITION',
      });
      if (!atomic) throw new Error('requestHfCalibrationPhaseAtomic returned null');
      const pendingState = parseAcquisitionState(atomic.session.acquisitionStateJson);
      if (pendingState.hfCalibrationSeries?.pendingPhaseRequest) {
        await activatePendingPhaseAtBoundary(
          repo,
          seed.organizationId,
          sid,
          hfPolicy,
          getNowMs(),
        );
      }
      return { pending: false };
    },
    persistExp021ActivePhaseMovementMetrics: async (_org, sid, body) => {
      await repo.persistExp021ActivePhaseMovementAtomic({
        organizationId: seed.organizationId,
        sessionId: sid,
        calibrationPhaseId: body.calibrationPhaseId,
        validMovementDurationMs: body.validMovementDurationMs,
        uncertainMovementDurationMs: body.uncertainMovementDurationMs,
      });
    },
    markExp021OrchestrationDegraded: async (_org, sid, reason) => {
      await repo.markExp021OrchestrationDegradedAtomic({
        organizationId: seed.organizationId,
        sessionId: sid,
        reason,
        nowMs: getNowMs(),
      });
    },
    stopRecording: async (_org, sid) => {
      const finalized = await repo.finalizeTerminalCalibrationAtomic(seed.organizationId, sid, {
        terminalAtMs: getNowMs(),
        reason: 'STOP',
      });
      if (!finalized) throw new Error('finalizeTerminalCalibrationAtomic returned null');
      return { status: 'COMPLETED' };
    },
    terminalizeExp021PhysicalEndEarly: async () => {
      throw new Error('not used in short AB postgres driver tests');
    },
  } as unknown as ReferenceCaptureSessionService;
}

const noopSettlementShadow = {
  syncCompletedPhasesFromSession: async () => undefined,
  invalidatePhysicalDriveIntervalCandidate: async () => undefined,
  confirmPhysicalDriveIntervalCandidate: async () => undefined,
  schedulePhysicalDriveIntervalShadow: async () => undefined,
  persistPhysicalDriveIntervalAuthority: async () => undefined,
} as unknown as ReferenceCaptureSettlementShadowService;

export function createPostgresExp021Driver(args: {
  repo: ReferenceCaptureSessionRepository;
  seed: ReferenceCaptureSeed;
  hfPolicy: HfRecoveryPolicyV2Config;
  getNowMs: () => number;
  sessionId: string;
}): Exp021AutonomousLifecycleDriver {
  const config = buildPostgresExp021RuntimeConfig(
    args.seed.organizationId,
    args.seed.vehicleId,
    args.seed.tokenId,
  );
  const sessionService = createPostgresDriverSessionServiceAdapter({
    repo: args.repo,
    seed: args.seed,
    hfPolicy: args.hfPolicy,
    getNowMs: args.getNowMs,
  });
  const driver = new Exp021AutonomousLifecycleDriver(
    {
      config,
      sessionService,
      sessionRepo: args.repo,
      settlementShadow: noopSettlementShadow,
    },
    {
      nowMs: args.getNowMs,
      sleep: async () => undefined,
      waitPhaseEffective: async () => new Date(args.getNowMs()),
      log: () => undefined,
    },
  );
  driver.sessionId = args.sessionId;
  driver.deployConvergedAtMs = args.getNowMs() - 120_000;
  return driver;
}

export async function armShortAb90PhaseFromPersistedT0(args: {
  repo: ReferenceCaptureSessionRepository;
  seed: ReferenceCaptureSeed;
  hfPolicy: HfRecoveryPolicyV2Config;
  t0Ms: number;
  cadence90Ms: number;
}): Promise<void> {
  await args.repo.persistExp021CanonicalT0Atomic({
    organizationId: args.seed.organizationId,
    sessionId: args.seed.sessionId,
    firstQualifyingMovementAt: new Date(args.t0Ms),
    startConfirmedAt: new Date(args.t0Ms + 1_000),
    nowMs: args.t0Ms + 1_000,
  });
  await args.repo.activatePhysicalPhaseAtT0Atomic({
    organizationId: args.seed.organizationId,
    sessionId: args.seed.sessionId,
    vehicleId: args.seed.vehicleId,
    tokenId: args.seed.tokenId,
    effectivePollIntervalMs: args.cadence90Ms,
    hfPolicy: args.hfPolicy,
    nowMs: args.t0Ms,
  });
}

export async function reloadSessionRow(
  prisma: PrismaClient,
  repo: ReferenceCaptureSessionRepository,
  organizationId: string,
  sessionId: string,
) {
  const session = await repo.findById(organizationId, sessionId);
  if (!session) throw new Error(`session ${sessionId} missing after reload`);
  return session;
}
