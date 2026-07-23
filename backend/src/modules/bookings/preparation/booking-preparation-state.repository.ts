import { Injectable } from '@nestjs/common';
import {
  BookingPreparationArtifactStatus,
  BookingPreparationArtifactType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BookingPreparationStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByBooking(orgId: string, bookingId: string) {
    return this.prisma.bookingPreparationArtifactState.findMany({
      where: { organizationId: orgId, bookingId },
      orderBy: { artifactType: 'asc' },
    });
  }

  findArtifact(orgId: string, bookingId: string, artifactType: BookingPreparationArtifactType) {
    return this.prisma.bookingPreparationArtifactState.findFirst({
      where: { organizationId: orgId, bookingId, artifactType },
    });
  }

  async upsertArtifact(input: {
    organizationId: string;
    bookingId: string;
    artifactType: BookingPreparationArtifactType;
    status: BookingPreparationArtifactStatus;
    required?: boolean;
    blocksPickup?: boolean;
    blocksReturn?: boolean;
    lastError?: string | null;
    lastErrorCode?: string | null;
    lastAttemptAt?: Date | null;
    readyAt?: Date | null;
    retryCount?: number;
    nextRetryAt?: Date | null;
    sourceRef?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    const now = new Date();
    return this.prisma.bookingPreparationArtifactState.upsert({
      where: {
        bookingId_artifactType: {
          bookingId: input.bookingId,
          artifactType: input.artifactType,
        },
      },
      create: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        artifactType: input.artifactType,
        status: input.status,
        required: input.required ?? true,
        blocksPickup: input.blocksPickup ?? false,
        blocksReturn: input.blocksReturn ?? false,
        lastError: input.lastError ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        lastAttemptAt: input.lastAttemptAt ?? now,
        readyAt: input.readyAt ?? (input.status === 'READY' ? now : null),
        retryCount: input.retryCount ?? 0,
        nextRetryAt: input.nextRetryAt ?? null,
        sourceRef: input.sourceRef ?? null,
        metadata: input.metadata ?? undefined,
      },
      update: {
        status: input.status,
        required: input.required,
        blocksPickup: input.blocksPickup,
        blocksReturn: input.blocksReturn,
        lastError: input.lastError ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        lastAttemptAt: input.lastAttemptAt ?? now,
        readyAt:
          input.readyAt !== undefined
            ? input.readyAt
            : input.status === 'READY'
              ? now
              : undefined,
        retryCount: input.retryCount,
        nextRetryAt: input.nextRetryAt,
        sourceRef: input.sourceRef ?? undefined,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  countFailedByOrg(orgId: string) {
    return this.prisma.bookingPreparationArtifactState.count({
      where: { organizationId: orgId, status: 'FAILED', required: true },
    });
  }

  countPersistentlyFailed(since: Date) {
    return this.prisma.bookingPreparationArtifactState.groupBy({
      by: ['artifactType'],
      where: {
        status: 'FAILED',
        required: true,
        updatedAt: { lt: since },
      },
      _count: { _all: true },
    });
  }

  createRecoveryAttempt(input: {
    organizationId: string;
    bookingId: string;
    artifactType: BookingPreparationArtifactType;
    action: string;
    idempotencyKey: string;
    actorUserId?: string | null;
    status?: string;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    return this.prisma.bookingPreparationRecoveryAttempt.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        artifactType: input.artifactType,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId ?? null,
        status: input.status ?? 'SUCCEEDED',
        metadata: input.metadata ?? undefined,
      },
    });
  }

  findRecoveryByKey(idempotencyKey: string) {
    return this.prisma.bookingPreparationRecoveryAttempt.findUnique({
      where: { idempotencyKey },
    });
  }
}
