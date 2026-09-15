import { Injectable } from '@nestjs/common';
import { Exp021StudyRunState, Exp021StudyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EXP021_COMMITTED_RUN_STATES } from './reference-capture-exp021-fleet-order-allocator.lib';
import type { Exp021FleetOrderBalanceSnapshot, Exp021FleetStudyConfig } from './reference-capture-exp021-fleet.types';

@Injectable()
export class ReferenceCaptureExp021FleetRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  createStudy(input: {
    studyKey: string;
    status?: Exp021StudyStatus;
    dryRun?: boolean;
    configJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.exp021Study.create({
      data: {
        studyKey: input.studyKey,
        status: input.status ?? Exp021StudyStatus.COLLECTING,
        dryRun: input.dryRun ?? true,
        configJson: input.configJson ?? {},
      },
    });
  }

  findStudyByKey(studyKey: string) {
    return this.prisma.exp021Study.findUnique({ where: { studyKey } });
  }

  listCollectingStudies() {
    return this.prisma.exp021Study.findMany({
      where: { status: Exp021StudyStatus.COLLECTING },
      orderBy: { createdAt: 'asc' },
    });
  }

  createEnrollment(input: {
    studyId: string;
    organizationId: string;
    vehicleId: string;
    enrolledTokenId: number;
    allowedPlans: string[];
    enrolledBy?: string;
    enabled?: boolean;
    metadataJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.exp021StudyEnrollment.create({
      data: {
        studyId: input.studyId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        enrolledTokenId: input.enrolledTokenId,
        allowedPlans: input.allowedPlans,
        enrolledBy: input.enrolledBy ?? null,
        enabled: input.enabled ?? true,
        metadataJson: input.metadataJson,
      },
    });
  }

  setEnrollmentEnabled(enrollmentId: string, enabled: boolean) {
    return this.prisma.exp021StudyEnrollment.update({
      where: { id: enrollmentId },
      data: { enabled },
    });
  }

  listEnabledEnrollmentsForStudy(studyId: string) {
    return this.prisma.exp021StudyEnrollment.findMany({
      where: { studyId, enabled: true },
      orderBy: { enrolledAt: 'asc' },
    });
  }

  async loadOrderBalanceSnapshot(studyId: string, vehicleId: string): Promise<Exp021FleetOrderBalanceSnapshot> {
    const [globalRows, vehicleRows] = await Promise.all([
      this.prisma.exp021StudyOrderBalance.findMany({ where: { studyId } }),
      this.prisma.exp021StudyVehicleOrderBalance.findMany({ where: { studyId, vehicleId } }),
    ]);
    const globalCounts: Record<string, number> = {};
    for (const row of globalRows) globalCounts[row.phaseOrderKey] = row.committedCount;
    const vehicleCounts: Record<string, number> = {};
    for (const row of vehicleRows) vehicleCounts[row.phaseOrderKey] = row.committedCount;
    return { globalCounts, vehicleCounts };
  }

  async commitOrderBalanceIncrement(
    tx: Prisma.TransactionClient,
    input: { studyId: string; vehicleId: string; phaseOrderKey: string },
  ): Promise<void> {
    await tx.exp021StudyOrderBalance.upsert({
      where: { studyId_phaseOrderKey: { studyId: input.studyId, phaseOrderKey: input.phaseOrderKey } },
      create: { studyId: input.studyId, phaseOrderKey: input.phaseOrderKey, committedCount: 1 },
      update: { committedCount: { increment: 1 } },
    });
    await tx.exp021StudyVehicleOrderBalance.upsert({
      where: {
        studyId_vehicleId_phaseOrderKey: {
          studyId: input.studyId,
          vehicleId: input.vehicleId,
          phaseOrderKey: input.phaseOrderKey,
        },
      },
      create: {
        studyId: input.studyId,
        vehicleId: input.vehicleId,
        phaseOrderKey: input.phaseOrderKey,
        committedCount: 1,
      },
      update: { committedCount: { increment: 1 } },
    });
  }

  createStudyRun(
    input: {
      studyId: string;
      enrollmentId: string;
      organizationId: string;
      vehicleId: string;
      tokenId: number;
      assignedPhaseOrderMs: number[];
      planId: string;
      planVersion: string;
      state?: Exp021StudyRunState;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.client(tx).exp021StudyRun.create({
      data: {
        studyId: input.studyId,
        enrollmentId: input.enrollmentId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        assignedPhaseOrderMs: input.assignedPhaseOrderMs,
        planId: input.planId,
        planVersion: input.planVersion,
        state: input.state ?? Exp021StudyRunState.PLANNED,
      },
    });
  }

  listCommittedRuns(studyId: string) {
    return this.prisma.exp021StudyRun.findMany({
      where: { studyId, state: { in: [...EXP021_COMMITTED_RUN_STATES] } },
    });
  }

  parseStudyConfig(configJson: unknown): Exp021FleetStudyConfig | null {
    if (!configJson || typeof configJson !== 'object' || Array.isArray(configJson)) return null;
    return configJson as Exp021FleetStudyConfig;
  }
}
