import { Injectable } from '@nestjs/common';
import type { ReferenceCaptureSession, ReferenceCaptureSessionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

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
      },
    });
  }
}
