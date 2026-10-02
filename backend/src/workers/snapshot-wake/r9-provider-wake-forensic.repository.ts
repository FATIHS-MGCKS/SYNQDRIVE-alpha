import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@shared/database/prisma.service';

import type { R9ProviderWakeCorrelationContext } from './r9-provider-wake-correlation.types';
import {
  R9ProviderWakeForensicTenantConflictError,
  type R9ProviderWakeForensicIntakeRecord,
  type R9ProviderWakeForensicSnapshotLineageUpdate,
  type R9ProviderWakeForensicTripLineageUpdate,
} from './r9-provider-wake-forensic.types';

function parseOptionalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function assertTenantBinding(
  wakeCorrelationId: string,
  expected: { organizationId: string; vehicleId: string },
  actual: { organizationId: string; vehicleId: string },
): void {
  if (
    actual.organizationId !== expected.organizationId ||
    actual.vehicleId !== expected.vehicleId
  ) {
    throw new R9ProviderWakeForensicTenantConflictError(
      wakeCorrelationId,
      `Forensic row tenant mismatch for wakeCorrelationId=${wakeCorrelationId}`,
    );
  }
}

function correlationToCreateData(
  record: R9ProviderWakeForensicIntakeRecord,
): Prisma.R9ProviderWakeForensicCreateInput {
  const { correlation: c } = record;
  return {
    wakeCorrelationId: c.wakeCorrelationId,
    organizationId: c.organizationId,
    provider: 'DIMO',
    dimoTokenId: c.dimoTokenId,
    signalName: c.signalName,
    wakeReason: c.wakeReason,
    providerObservedAt: parseOptionalDate(c.providerObservedAt),
    receivedAt: new Date(c.receivedAt),
    fsmStateAtIntake: record.fsmStateAtIntake ?? null,
    classification: record.classification,
    lineageRole: record.lineageRole ?? null,
    coalesceCount: 0,
    providerDeliveryId: c.providerDeliveryId,
    payloadFingerprint: c.payloadFingerprint,
    wakeCorrelationVersion: c.wakeCorrelationVersion,
    vehicle: { connect: { id: c.vehicleId } },
  };
}

@Injectable()
export class R9ProviderWakeForensicRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordIntake(record: R9ProviderWakeForensicIntakeRecord): Promise<void> {
    const { correlation } = record;
    const existing = await this.prisma.r9ProviderWakeForensic.findUnique({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
      select: { organizationId: true, vehicleId: true },
    });
    if (existing) {
      assertTenantBinding(correlation.wakeCorrelationId, correlation, existing);
      await this.prisma.r9ProviderWakeForensic.update({
        where: { wakeCorrelationId: correlation.wakeCorrelationId },
        data: {
          classification: record.classification,
          fsmStateAtIntake: record.fsmStateAtIntake ?? undefined,
          lineageRole: record.lineageRole ?? undefined,
        },
      });
      return;
    }

    await this.prisma.r9ProviderWakeForensic.create({
      data: correlationToCreateData(record),
    });
  }

  async recordCoordinatorOutcome(params: {
    correlation: R9ProviderWakeCorrelationContext;
    classification: R9ProviderWakeForensicIntakeRecord['classification'];
    lineageRole?: R9ProviderWakeForensicIntakeRecord['lineageRole'];
    fsmStateAtIntake?: R9ProviderWakeForensicIntakeRecord['fsmStateAtIntake'];
    incrementCoalesce?: boolean;
  }): Promise<void> {
    const { correlation } = params;
    const existing = await this.prisma.r9ProviderWakeForensic.findUnique({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
    });

    if (!existing) {
      await this.recordIntake({
        correlation,
        classification: params.classification,
        fsmStateAtIntake: params.fsmStateAtIntake,
        lineageRole: params.lineageRole,
      });
      if (params.incrementCoalesce) {
        await this.incrementCoalesceCount(correlation);
      }
      return;
    }

    assertTenantBinding(correlation.wakeCorrelationId, correlation, existing);
    await this.prisma.r9ProviderWakeForensic.update({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
      data: {
        classification: params.classification,
        lineageRole: params.lineageRole ?? existing.lineageRole,
        fsmStateAtIntake: params.fsmStateAtIntake ?? existing.fsmStateAtIntake,
        ...(params.incrementCoalesce ? { coalesceCount: { increment: 1 } } : {}),
      },
    });
  }

  async incrementCoalesceCount(
    correlation: Pick<R9ProviderWakeCorrelationContext, 'wakeCorrelationId' | 'organizationId' | 'vehicleId'>,
  ): Promise<void> {
    const existing = await this.prisma.r9ProviderWakeForensic.findUnique({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
    });
    if (!existing) {
      return;
    }
    assertTenantBinding(correlation.wakeCorrelationId, correlation, existing);
    await this.prisma.r9ProviderWakeForensic.update({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
      data: { coalesceCount: { increment: 1 } },
    });
  }

  async recordSnapshotRequested(update: R9ProviderWakeForensicSnapshotLineageUpdate): Promise<void> {
    await this.patchLineage(update, {
      snapshotRequestedAt: update.snapshotRequestedAt ?? undefined,
      snapshotJobId: update.snapshotJobId ?? undefined,
      lineageRole: update.lineageRole ?? undefined,
    });
  }

  async recordSnapshotStarted(update: R9ProviderWakeForensicSnapshotLineageUpdate): Promise<void> {
    await this.patchLineage(update, {
      snapshotStartedAt: update.snapshotStartedAt ?? undefined,
      snapshotJobId: update.snapshotJobId ?? undefined,
    });
  }

  async recordSnapshotCompleted(update: R9ProviderWakeForensicSnapshotLineageUpdate): Promise<void> {
    await this.patchLineage(update, {
      snapshotFinishedAt: update.snapshotFinishedAt ?? undefined,
      providerFetchedAt: update.providerFetchedAt ?? undefined,
      snapshotSourceTimestamp: update.snapshotSourceTimestamp ?? undefined,
      snapshotStatus: update.snapshotStatus ?? undefined,
      snapshotJobId: update.snapshotJobId ?? undefined,
      lineageRole: update.lineageRole ?? undefined,
    });
  }

  async recordTripEvaluation(update: R9ProviderWakeForensicTripLineageUpdate): Promise<void> {
    await this.patchLineage(update, {
      fsmStateAfterEvaluation: update.fsmStateAfterEvaluation ?? undefined,
      tripEvaluationResult: update.tripEvaluationResult ?? undefined,
      possibleStartAt: update.possibleStartAt ?? undefined,
    });
  }

  async recordActiveTrip(update: R9ProviderWakeForensicTripLineageUpdate): Promise<void> {
    await this.patchLineage(update, {
      activeTripAt: update.activeTripAt ?? undefined,
      vehicleTripId: update.vehicleTripId ?? undefined,
      fsmStateAfterEvaluation: update.fsmStateAfterEvaluation ?? undefined,
    });
  }

  private async patchLineage(
    scope: {
      wakeCorrelationId: string;
      organizationId: string;
      vehicleId: string;
    },
    data: Prisma.R9ProviderWakeForensicUpdateInput,
  ): Promise<void> {
    const existing = await this.prisma.r9ProviderWakeForensic.findUnique({
      where: { wakeCorrelationId: scope.wakeCorrelationId },
    });
    if (!existing) {
      return;
    }
    assertTenantBinding(scope.wakeCorrelationId, scope, existing);
    await this.prisma.r9ProviderWakeForensic.update({
      where: { wakeCorrelationId: scope.wakeCorrelationId },
      data,
    });
  }
}
