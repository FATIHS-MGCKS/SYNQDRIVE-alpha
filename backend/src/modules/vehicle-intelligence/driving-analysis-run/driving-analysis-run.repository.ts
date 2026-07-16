import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDrivingAnalysisInputFingerprint } from './driving-analysis-run.fingerprint';
import type {
  BeginDrivingAnalysisRunInput,
  CompleteDrivingAnalysisRunInput,
  FailDrivingAnalysisRunInput,
  ResolveDrivingAnalysisRunResult,
} from './driving-analysis-run.types';

@Injectable()
export class DrivingAnalysisRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripInOrg(
    organizationId: string,
    tripId: string,
  ): Promise<{ vehicleId: string }> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    return { vehicleId: trip.vehicleId };
  }

  findById(organizationId: string, runId: string) {
    return this.prisma.drivingAnalysisRun.findFirst({
      where: { id: runId, organizationId },
    });
  }

  findCompletedByFingerprint(
    organizationId: string,
    tripId: string,
    analysisType: BeginDrivingAnalysisRunInput['analysisType'],
    modelVersion: string,
    inputFingerprint: string,
  ) {
    return this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        tripId,
        analysisType,
        modelVersion,
        inputFingerprint,
        status: 'COMPLETED',
      },
    });
  }

  findActiveByFingerprint(
    organizationId: string,
    tripId: string,
    analysisType: BeginDrivingAnalysisRunInput['analysisType'],
    modelVersion: string,
    inputFingerprint: string,
  ) {
    return this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        tripId,
        analysisType,
        modelVersion,
        inputFingerprint,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  findLatestCompleted(
    organizationId: string,
    tripId: string,
    analysisType: BeginDrivingAnalysisRunInput['analysisType'],
  ) {
    return this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        tripId,
        analysisType,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  /**
   * Resolve or start a deterministic run.
   * Same input fingerprint + model version → return existing completed/in-flight run.
   * Changed input or model version → new run superseding the latest completed one.
   */
  async resolveOrBeginRun(input: BeginDrivingAnalysisRunInput): Promise<ResolveDrivingAnalysisRunResult> {
    const trip = await this.assertTripInOrg(input.organizationId, input.tripId);
    if (trip.vehicleId !== input.vehicleId) {
      throw new NotFoundException('Trip vehicle mismatch for organization');
    }

    const inputFingerprint = buildDrivingAnalysisInputFingerprint({
      ...input.inputIdentity,
      organizationId: input.organizationId,
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      analysisType: input.analysisType,
      capabilityVersion: input.capabilityVersion,
    });

    const active = await this.findActiveByFingerprint(
      input.organizationId,
      input.tripId,
      input.analysisType,
      input.modelVersion,
      inputFingerprint,
    );
    if (active) {
      return {
        run: active,
        created: false,
        deduplicated: true,
        supersededRunId: active.supersedesRunId,
      };
    }

    const completed = await this.findCompletedByFingerprint(
      input.organizationId,
      input.tripId,
      input.analysisType,
      input.modelVersion,
      inputFingerprint,
    );
    if (completed) {
      return {
        run: completed,
        created: false,
        deduplicated: true,
        supersededRunId: completed.supersedesRunId,
      };
    }

    const latestCompleted = await this.findLatestCompleted(
      input.organizationId,
      input.tripId,
      input.analysisType,
    );

    const needsSupersede =
      latestCompleted != null &&
      (latestCompleted.modelVersion !== input.modelVersion ||
        latestCompleted.inputFingerprint !== inputFingerprint);

    let supersededRunId: string | null = null;
    if (needsSupersede && latestCompleted) {
      supersededRunId = latestCompleted.id;
      await this.prisma.drivingAnalysisRun.update({
        where: { id: latestCompleted.id },
        data: {
          status: 'SUPERSEDED',
          maturity: 'SUPERSEDED',
        },
      });
    }

    const startedAt = input.startedAt ?? new Date();
    const run = await this.prisma.drivingAnalysisRun.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        analysisType: input.analysisType,
        modelVersion: input.modelVersion,
        inputFingerprint,
        capabilityVersion: input.capabilityVersion,
        startedAt,
        maturity: input.maturity ?? 'SHADOW',
        status: 'IN_PROGRESS',
        recomputeReason: needsSupersede
          ? input.recomputeReason ?? 'INPUT_OR_MODEL_CHANGED'
          : input.recomputeReason ?? null,
        supersedesRunId: supersededRunId,
      },
    });

    return {
      run,
      created: true,
      deduplicated: false,
      supersededRunId,
    };
  }

  async markCompleted(input: CompleteDrivingAnalysisRunInput) {
    const existing = await this.findById(input.organizationId, input.runId);
    if (!existing) {
      throw new NotFoundException('Analysis run not found for organization');
    }

    return this.prisma.drivingAnalysisRun.update({
      where: { id: input.runId },
      data: {
        status: 'COMPLETED',
        completedAt: input.completedAt ?? new Date(),
        maturity: input.maturity ?? existing.maturity,
        stageSummaryJson: (input.stageSummary ?? null) as Prisma.InputJsonValue | undefined,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  async markFailed(input: FailDrivingAnalysisRunInput) {
    const existing = await this.findById(input.organizationId, input.runId);
    if (!existing) {
      throw new NotFoundException('Analysis run not found for organization');
    }

    return this.prisma.drivingAnalysisRun.update({
      where: { id: input.runId },
      data: {
        status: 'FAILED',
        completedAt: input.completedAt ?? new Date(),
        maturity: 'FAILED',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.prisma.drivingAnalysisRun.findMany({
      where: { organizationId, tripId },
      orderBy: { startedAt: 'asc' },
    });
  }
}
