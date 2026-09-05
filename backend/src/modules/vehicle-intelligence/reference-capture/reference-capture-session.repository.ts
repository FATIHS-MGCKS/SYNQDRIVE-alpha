import { Injectable } from '@nestjs/common';
import type { ReferenceCaptureSession, ReferenceCaptureSessionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HF_PHYSICAL_IDENTITY_VERSION } from './reference-capture-physical-sample-identity.util';
import type { ReferenceCaptureAcquisitionState } from './reference-capture.types';
import {
  buildCycleReleaseAcquisitionState,
  finalizeTerminalCalibrationSeries,
  normalizeHfCalibrationSeriesState,
  requestHfCalibrationPhase,
  type HfCalibrationPhaseRequestResult,
  type TerminalCalibrationFinalizationReason,
} from './reference-capture-hf-calibration-phase.policy';
import type { HfRecoveryPolicyV2Config } from './reference-capture-hf-recovery-v2.policy';

function parseAcquisitionState(raw: unknown): ReferenceCaptureAcquisitionState {
  const base = (raw ?? {}) as Partial<ReferenceCaptureAcquisitionState>;
  const seenPhysical = base.seenPhysicalSampleFingerprints ?? [];
  const hfPhysicalIdentityVersion =
    base.hfPhysicalIdentityVersion ??
    (seenPhysical.length > 0
      ? HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1
      : HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2);

  return {
    cycleCount: base.cycleCount ?? 0,
    lastCycleAt: base.lastCycleAt ?? null,
    hfWatermarkAt: base.hfWatermarkAt ?? null,
    hfWatermarkByField:
      base.hfWatermarkByField && typeof base.hfWatermarkByField === 'object'
        ? { ...base.hfWatermarkByField }
        : {},
    hfQueryCoverageByField:
      base.hfQueryCoverageByField && typeof base.hfQueryCoverageByField === 'object'
        ? { ...base.hfQueryCoverageByField }
        : {},
    hfPhysicalIdentityVersion,
    eventWatermarkAt: base.eventWatermarkAt ?? null,
    seenEventFingerprints: base.seenEventFingerprints ?? [],
    seenPhysicalSampleFingerprints:
      hfPhysicalIdentityVersion === HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1
        ? [...seenPhysical]
        : [],
    hfQueryProvenanceRing: Array.isArray(base.hfQueryProvenanceRing)
      ? [...base.hfQueryProvenanceRing]
      : [],
    hfRecoveryCursorByField:
      base.hfRecoveryCursorByField && typeof base.hfRecoveryCursorByField === 'object'
        ? { ...base.hfRecoveryCursorByField }
        : {},
    lastRecoverySweepAt: base.lastRecoverySweepAt ?? null,
    recoverySweepCount: base.recoverySweepCount ?? 0,
    lastHfHistoricalPollAt: base.lastHfHistoricalPollAt ?? null,
    hfCalibrationSeries: normalizeHfCalibrationSeriesState(base.hfCalibrationSeries),
    hfCalibrationActiveCounters: base.hfCalibrationActiveCounters ?? null,
    acquisitionStateVersion: base.acquisitionStateVersion ?? 0,
    lastSequenceNumber: base.lastSequenceNumber ?? 0,
    activeCycleJobId: base.activeCycleJobId ?? null,
    quarantinedProviderFields: base.quarantinedProviderFields ?? [],
    consecutiveTransientFailures: base.consecutiveTransientFailures ?? 0,
    lastFailureClass: base.lastFailureClass ?? null,
    lastFailureAt: base.lastFailureAt ?? null,
  };
}

@Injectable()
export class ReferenceCaptureSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async lockSessionRow(
    tx: Pick<PrismaService, '$executeRaw'>,
    organizationId: string,
    sessionId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT id FROM "ReferenceCaptureSession"
      WHERE id = ${sessionId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
  }

  create(input: {
    organizationId: string;
    vehicleId: string;
    connectionProfile: string;
    powertrainProfile?: string | null;
    hardwareProfile?: string | null;
    manifestId: string;
    manifestVersion: string;
    recorderSoftwareVersion: string;
    massBindingJson?: unknown;
    groundTruthVideoRef?: string | null;
  }): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        connectionProfile: input.connectionProfile,
        powertrainProfile: input.powertrainProfile ?? null,
        hardwareProfile: input.hardwareProfile ?? null,
        manifestId: input.manifestId,
        manifestVersion: input.manifestVersion,
        recorderSoftwareVersion: input.recorderSoftwareVersion,
        massBindingJson: input.massBindingJson as object | undefined,
        groundTruthVideoRef: input.groundTruthVideoRef ?? null,
      },
    });
  }

  findById(organizationId: string, sessionId: string): Promise<ReferenceCaptureSession | null> {
    return this.prisma.referenceCaptureSession.findFirst({
      where: { id: sessionId, organizationId },
    });
  }

  async updateStatusIfCurrent(
    organizationId: string,
    sessionId: string,
    expectedStatus: ReferenceCaptureSessionStatus,
    nextStatus: ReferenceCaptureSessionStatus,
    patch?: Partial<{
      preflightJson: unknown;
      broadObservationFieldCount: number;
      failureReason: string | null;
      startedAt: Date;
      stoppedAt: Date;
      completedAt: Date;
      syncMarkerJson: unknown;
      groundTruthVideoRef: string | null;
      powertrainProfile: string | null;
      hardwareProfile: string | null;
      runnerJobId: string | null;
      pendingCycleJobId: string | null;
    }>,
  ): Promise<ReferenceCaptureSession | null> {
    const result = await this.prisma.referenceCaptureSession.updateMany({
      where: { id: sessionId, organizationId, status: expectedStatus },
      data: {
        status: nextStatus,
        ...(patch?.preflightJson !== undefined
          ? { preflightJson: patch.preflightJson as object }
          : {}),
        ...(patch?.broadObservationFieldCount !== undefined
          ? { broadObservationFieldCount: patch.broadObservationFieldCount }
          : {}),
        ...(patch?.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        ...(patch?.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch?.stoppedAt !== undefined ? { stoppedAt: patch.stoppedAt } : {}),
        ...(patch?.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch?.syncMarkerJson !== undefined
          ? { syncMarkerJson: patch.syncMarkerJson as object }
          : {}),
        ...(patch?.groundTruthVideoRef !== undefined
          ? { groundTruthVideoRef: patch.groundTruthVideoRef }
          : {}),
        ...(patch?.powertrainProfile !== undefined
          ? { powertrainProfile: patch.powertrainProfile }
          : {}),
        ...(patch?.hardwareProfile !== undefined
          ? { hardwareProfile: patch.hardwareProfile }
          : {}),
        ...(patch?.runnerJobId !== undefined ? { runnerJobId: patch.runnerJobId } : {}),
        ...(patch?.pendingCycleJobId !== undefined
          ? { pendingCycleJobId: patch.pendingCycleJobId }
          : {}),
      },
    });

    if (result.count === 0) return null;
    return this.findById(organizationId, sessionId);
  }

  updateStatus(
    organizationId: string,
    sessionId: string,
    status: ReferenceCaptureSessionStatus,
    patch?: Partial<{
      preflightJson: unknown;
      broadObservationFieldCount: number;
      failureReason: string | null;
      startedAt: Date;
      stoppedAt: Date;
      completedAt: Date;
      syncMarkerJson: unknown;
      groundTruthVideoRef: string | null;
      powertrainProfile: string | null;
      hardwareProfile: string | null;
      runnerJobId: string | null;
      pendingCycleJobId: string | null;
    }>,
  ): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.update({
      where: { id: sessionId, organizationId },
      data: {
        status,
        ...(patch?.preflightJson !== undefined
          ? { preflightJson: patch.preflightJson as object }
          : {}),
        ...(patch?.broadObservationFieldCount !== undefined
          ? { broadObservationFieldCount: patch.broadObservationFieldCount }
          : {}),
        ...(patch?.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        ...(patch?.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch?.stoppedAt !== undefined ? { stoppedAt: patch.stoppedAt } : {}),
        ...(patch?.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch?.syncMarkerJson !== undefined
          ? { syncMarkerJson: patch.syncMarkerJson as object }
          : {}),
        ...(patch?.groundTruthVideoRef !== undefined
          ? { groundTruthVideoRef: patch.groundTruthVideoRef }
          : {}),
        ...(patch?.powertrainProfile !== undefined
          ? { powertrainProfile: patch.powertrainProfile }
          : {}),
        ...(patch?.hardwareProfile !== undefined
          ? { hardwareProfile: patch.hardwareProfile }
          : {}),
        ...(patch?.runnerJobId !== undefined ? { runnerJobId: patch.runnerJobId } : {}),
        ...(patch?.pendingCycleJobId !== undefined
          ? { pendingCycleJobId: patch.pendingCycleJobId }
          : {}),
      },
    });
  }

  async tryAcquireCycleLock(
    organizationId: string,
    sessionId: string,
    activeCycleJobId: string,
  ): Promise<{ acquired: boolean; state: ReferenceCaptureAcquisitionState | null }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionRow(tx, organizationId, sessionId);
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: sessionId, organizationId, status: 'RECORDING' },
      });
      if (!session) return { acquired: false, state: null };

      const state = parseAcquisitionState(session.acquisitionStateJson);
      if (state.activeCycleJobId) {
        return { acquired: false, state };
      }

      const nextState: ReferenceCaptureAcquisitionState = {
        ...state,
        activeCycleJobId,
        acquisitionStateVersion: (state.acquisitionStateVersion ?? 0) + 1,
      };

      await tx.referenceCaptureSession.update({
        where: { id: sessionId, organizationId },
        data: { acquisitionStateJson: nextState as object },
      });

      return { acquired: true, state: nextState };
    });
  }

  async releaseCycleLockAndUpdateState(
    organizationId: string,
    sessionId: string,
    activeCycleJobId: string,
    release: {
      dataPlane: ReferenceCaptureAcquisitionState;
      hfPolicy: HfRecoveryPolicyV2Config;
      effectiveAtMs?: number;
    },
    eventWatermarkAt?: Date | null,
  ): Promise<boolean> {
    const effectiveAtMs = release.effectiveAtMs ?? Date.now();
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionRow(tx, organizationId, sessionId);
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!session) return false;

      const current = parseAcquisitionState(session.acquisitionStateJson);
      if (current.activeCycleJobId !== activeCycleJobId) return false;

      const {
        hfCalibrationSeries: _omitSeries,
        hfCalibrationActiveCounters: releaseCounters,
        acquisitionStateVersion: _omitVersion,
        activeCycleJobId: _omitLock,
        ...dataPlaneScalars
      } = release.dataPlane as ReferenceCaptureAcquisitionState;

      const merged = buildCycleReleaseAcquisitionState({
        persisted: current,
        dataPlane: {
          cycleCount: dataPlaneScalars.cycleCount,
          lastCycleAt: dataPlaneScalars.lastCycleAt ?? null,
          hfWatermarkAt: dataPlaneScalars.hfWatermarkAt ?? null,
          hfWatermarkByField: dataPlaneScalars.hfWatermarkByField ?? {},
          hfQueryCoverageByField: dataPlaneScalars.hfQueryCoverageByField ?? {},
          hfPhysicalIdentityVersion:
            dataPlaneScalars.hfPhysicalIdentityVersion ??
            HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
          hfQueryProvenanceRing: dataPlaneScalars.hfQueryProvenanceRing ?? [],
          hfRecoveryCursorByField: dataPlaneScalars.hfRecoveryCursorByField ?? {},
          lastRecoverySweepAt: dataPlaneScalars.lastRecoverySweepAt ?? null,
          recoverySweepCount: dataPlaneScalars.recoverySweepCount ?? 0,
          lastHfHistoricalPollAt: dataPlaneScalars.lastHfHistoricalPollAt ?? null,
          eventWatermarkAt: dataPlaneScalars.eventWatermarkAt ?? null,
          seenEventFingerprints: dataPlaneScalars.seenEventFingerprints ?? [],
          seenPhysicalSampleFingerprints: dataPlaneScalars.seenPhysicalSampleFingerprints ?? [],
          lastSequenceNumber: dataPlaneScalars.lastSequenceNumber ?? 0,
          quarantinedProviderFields: dataPlaneScalars.quarantinedProviderFields ?? [],
          consecutiveTransientFailures: dataPlaneScalars.consecutiveTransientFailures ?? 0,
          lastFailureClass: dataPlaneScalars.lastFailureClass ?? null,
          lastFailureAt: dataPlaneScalars.lastFailureAt ?? null,
          hfCalibrationActiveCounters:
            releaseCounters ?? current.hfCalibrationActiveCounters ?? null,
        },
        hfPolicy: release.hfPolicy,
        effectiveAtMs,
      });

      await tx.referenceCaptureSession.update({
        where: { id: sessionId, organizationId },
        data: {
          acquisitionStateJson: merged as object,
          ...(eventWatermarkAt !== undefined ? { eventWatermarkAt } : {}),
        },
      });
      return true;
    });
  }

  updateAcquisitionState(
    organizationId: string,
    sessionId: string,
    patch: {
      acquisitionStateJson: unknown;
      eventWatermarkAt?: Date | null;
    },
  ): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.update({
      where: { id: sessionId, organizationId },
      data: {
        acquisitionStateJson: patch.acquisitionStateJson as object,
        ...(patch.eventWatermarkAt !== undefined
          ? { eventWatermarkAt: patch.eventWatermarkAt }
          : {}),
      },
    });
  }

  async mergeAcquisitionState(
    organizationId: string,
    sessionId: string,
    merge: (current: ReferenceCaptureAcquisitionState) => ReferenceCaptureAcquisitionState,
  ): Promise<ReferenceCaptureSession | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionRow(tx, organizationId, sessionId);
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!session) return null;
      const current = parseAcquisitionState(session.acquisitionStateJson);
      const next = merge(current);
      const merged: ReferenceCaptureAcquisitionState = {
        ...next,
        acquisitionStateVersion: (current.acquisitionStateVersion ?? 0) + 1,
      };
      return tx.referenceCaptureSession.update({
        where: { id: sessionId, organizationId },
        data: { acquisitionStateJson: merged as object },
      });
    });
  }

  async waitForAcquisitionCycleQuiescence(
    organizationId: string,
    sessionId: string,
    options: { timeoutMs: number; pollIntervalMs: number },
  ): Promise<{ quiesced: boolean; timedOut: boolean }> {
    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      const session = await this.findById(organizationId, sessionId);
      if (!session) return { quiesced: false, timedOut: false };
      const state = parseAcquisitionState(session.acquisitionStateJson);
      if (!state.activeCycleJobId) return { quiesced: true, timedOut: false };
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
    }
    return { quiesced: false, timedOut: true };
  }

  async requestHfCalibrationPhaseAtomic(input: {
    organizationId: string;
    sessionId: string;
    vehicleId: string;
    tokenId: number;
    effectivePollIntervalMs: number;
    nowMs: number;
  }): Promise<{
    session: ReferenceCaptureSession;
    result: HfCalibrationPhaseRequestResult;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionRow(tx, input.organizationId, input.sessionId);
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: input.sessionId, organizationId: input.organizationId },
      });
      if (!session) return null;
      if (session.status !== 'RECORDING') {
        throw new Error(
          `HF calibration phase switch requires RECORDING status (current: ${session.status})`,
        );
      }

      const current = parseAcquisitionState(session.acquisitionStateJson);
      const transition = requestHfCalibrationPhase({
        existing: current.hfCalibrationSeries ?? null,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        effectivePollIntervalMs: input.effectivePollIntervalMs,
        nowMs: input.nowMs,
      });

      const nextState: ReferenceCaptureAcquisitionState = {
        ...current,
        hfCalibrationSeries: transition.series,
        acquisitionStateVersion: (current.acquisitionStateVersion ?? 0) + 1,
      };

      const updated = await tx.referenceCaptureSession.update({
        where: { id: input.sessionId, organizationId: input.organizationId },
        data: { acquisitionStateJson: nextState as object },
      });

      const effectiveActive = transition.series.activePhase;
      const requestedMatchesEffective =
        effectiveActive?.effectivePollIntervalMs === input.effectivePollIntervalMs;

      return {
        session: updated,
        result: {
          ...transition,
          activationStatus: requestedMatchesEffective ? 'EFFECTIVE' : 'REQUESTED',
          controlPlaneRevision: transition.series.controlPlaneRevision,
        },
      };
    });
  }

  async finalizeTerminalCalibrationAtomic(
    organizationId: string,
    sessionId: string,
    args: { terminalAtMs: number; reason: TerminalCalibrationFinalizationReason },
  ): Promise<ReferenceCaptureSession | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionRow(tx, organizationId, sessionId);
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!session) return null;

      const current = parseAcquisitionState(session.acquisitionStateJson);
      const finalized = finalizeTerminalCalibrationSeries({
        series: current.hfCalibrationSeries ?? null,
        counters: current.hfCalibrationActiveCounters ?? null,
        terminalAtMs: args.terminalAtMs,
        reason: args.reason,
      });

      if (!finalized.applied && finalized.series === current.hfCalibrationSeries) {
        return session;
      }

      const nextState: ReferenceCaptureAcquisitionState = {
        ...current,
        hfCalibrationSeries: finalized.series,
        hfCalibrationActiveCounters: finalized.applied ? null : current.hfCalibrationActiveCounters,
        acquisitionStateVersion: finalized.applied
          ? (current.acquisitionStateVersion ?? 0) + 1
          : current.acquisitionStateVersion,
      };

      return tx.referenceCaptureSession.update({
        where: { id: sessionId, organizationId },
        data: { acquisitionStateJson: nextState as object },
      });
    });
  }

  updateReadiness(
    organizationId: string,
    sessionId: string,
    readinessJson: unknown,
  ): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.update({
      where: { id: sessionId, organizationId },
      data: { readinessJson: readinessJson as object },
    });
  }

  updateRunnerJobId(
    organizationId: string,
    sessionId: string,
    runnerJobId: string | null,
  ): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.update({
      where: { id: sessionId, organizationId },
      data: { runnerJobId },
    });
  }

  updatePendingCycleJobId(
    organizationId: string,
    sessionId: string,
    pendingCycleJobId: string | null,
  ): Promise<ReferenceCaptureSession> {
    return this.prisma.referenceCaptureSession.update({
      where: { id: sessionId, organizationId },
      data: { pendingCycleJobId },
    });
  }
}

export { parseAcquisitionState };
