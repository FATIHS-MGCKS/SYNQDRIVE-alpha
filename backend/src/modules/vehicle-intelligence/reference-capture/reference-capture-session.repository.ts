import { Injectable } from '@nestjs/common';
import type { ReferenceCaptureSession, ReferenceCaptureSessionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HF_PHYSICAL_IDENTITY_VERSION } from './reference-capture-physical-sample-identity.util';
import type { ReferenceCaptureAcquisitionState } from './reference-capture.types';

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
    nextState: ReferenceCaptureAcquisitionState,
    eventWatermarkAt?: Date | null,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.referenceCaptureSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!session) return false;

      const current = parseAcquisitionState(session.acquisitionStateJson);
      if (current.activeCycleJobId !== activeCycleJobId) return false;

      const merged: ReferenceCaptureAcquisitionState = {
        ...nextState,
        activeCycleJobId: null,
      };

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
