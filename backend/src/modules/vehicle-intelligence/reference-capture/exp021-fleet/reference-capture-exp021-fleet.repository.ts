import { Injectable } from '@nestjs/common';
import {
  Exp021StudyRunState,
  Exp021StudyStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  EXP021_COMMITTED_RUN_STATES,
  phaseOrderKey,
  proposeBalancedPhaseOrder,
} from './reference-capture-exp021-fleet-order-allocator.lib';
import type { Exp021FleetOrderBalanceSnapshot, Exp021FleetStudyConfig } from './reference-capture-exp021-fleet.types';
import { validateMinimumMatrixConfig } from './reference-capture-exp021-fleet-minimum-matrix.lib';

export class Exp021FleetRunIdentityError extends Error {
  readonly code = 'EXP021_FLEET_RUN_IDENTITY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021FleetRunIdentityError';
  }
}

export class Exp021FleetAssignmentError extends Error {
  readonly code = 'EXP021_FLEET_ASSIGNMENT';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021FleetAssignmentError';
  }
}

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

  private async loadOrderBalanceSnapshotInTx(
    tx: Prisma.TransactionClient,
    studyId: string,
    vehicleId: string,
  ): Promise<Exp021FleetOrderBalanceSnapshot> {
    const [globalRows, vehicleRows] = await Promise.all([
      tx.exp021StudyOrderBalance.findMany({ where: { studyId } }),
      tx.exp021StudyVehicleOrderBalance.findMany({ where: { studyId, vehicleId } }),
    ]);
    const globalCounts: Record<string, number> = {};
    for (const row of globalRows) globalCounts[row.phaseOrderKey] = row.committedCount;
    const vehicleCounts: Record<string, number> = {};
    for (const row of vehicleRows) vehicleCounts[row.phaseOrderKey] = row.committedCount;
    return { globalCounts, vehicleCounts };
  }

  private async commitOrderBalanceIncrementInTx(
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

  /**
   * PR-D boundary: atomically reserve one PLANNED run and commit balance counters.
   * PR-C coordinator MUST NOT call this.
   */
  async reserveStudyRunAssignment(input: {
    enrollmentId: string;
    resolvedTokenId: number;
  }) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const enrollment = await tx.exp021StudyEnrollment.findUnique({
              where: { id: input.enrollmentId },
              include: { study: true },
            });
            if (!enrollment) {
              throw new Exp021FleetRunIdentityError('Enrollment not found');
            }
            if (!enrollment.enabled) {
              throw new Exp021FleetRunIdentityError('Enrollment disabled');
            }
            if (enrollment.study.status !== Exp021StudyStatus.COLLECTING) {
              throw new Exp021FleetRunIdentityError(`Study status not COLLECTING: ${enrollment.study.status}`);
            }
            if (enrollment.enrolledTokenId !== input.resolvedTokenId) {
              throw new Exp021FleetRunIdentityError('Resolved token does not match enrollment authority');
            }

            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${enrollment.studyId}))`;

            const balance = await this.loadOrderBalanceSnapshotInTx(
              tx,
              enrollment.studyId,
              enrollment.vehicleId,
            );
            const proposed = proposeBalancedPhaseOrder({
              allowedPlans: enrollment.allowedPlans,
              vehicleId: enrollment.vehicleId,
              balance,
            });
            if (!proposed) {
              throw new Exp021FleetAssignmentError('No assignable phase order for enrollment');
            }

            const run = await tx.exp021StudyRun.create({
              data: {
                studyId: enrollment.studyId,
                enrollmentId: enrollment.id,
                organizationId: enrollment.organizationId,
                vehicleId: enrollment.vehicleId,
                tokenId: enrollment.enrolledTokenId,
                assignedPhaseOrderMs: proposed.phaseOrderMs,
                planId: proposed.planId,
                planVersion: proposed.planVersion,
                state: Exp021StudyRunState.PLANNED,
              },
            });

            await this.commitOrderBalanceIncrementInTx(tx, {
              studyId: enrollment.studyId,
              vehicleId: enrollment.vehicleId,
              phaseOrderKey: proposed.phaseOrderKey,
            });

            return { run, proposed };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt < maxAttempts && this.isSerializationFailure(error)) continue;
        throw error;
      }
    }
    throw new Exp021FleetAssignmentError('Assignment reservation failed after retries');
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

  resolveValidatedMinimumMatrixConfig(configJson: unknown): ReturnType<typeof validateMinimumMatrixConfig> {
    return validateMinimumMatrixConfig(this.parseStudyConfig(configJson));
  }

  private isSerializationFailure(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }
}
