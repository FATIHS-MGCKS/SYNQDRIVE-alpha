import { Injectable } from '@nestjs/common';
import { WorkflowEventOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { sanitizeOutboxErrorSummary } from './workflow-event-outbox-error.util';

const CLAIMABLE_STATUSES: WorkflowEventOutboxStatus[] = [
  WorkflowEventOutboxStatus.PENDING,
  WorkflowEventOutboxStatus.RETRY_SCHEDULED,
];

@Injectable()
export class WorkflowEventOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, organizationId?: string) {
    return this.prisma.workflowEventOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findPendingBatch(limit: number, now: Date = new Date()) {
    return this.prisma.workflowEventOutbox.findMany({
      where: {
        status: { in: CLAIMABLE_STATUSES },
        availableAt: { lte: now },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    });
  }

  findExpiredClaimsBatch(staleBefore: Date, limit: number) {
    return this.prisma.workflowEventOutbox.findMany({
      where: {
        status: WorkflowEventOutboxStatus.CLAIMED,
        leaseExpiresAt: { lt: staleBefore },
      },
      orderBy: { leaseExpiresAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  countQueueLag() {
    return this.prisma.workflowEventOutbox.count({
      where: {
        status: {
          in: [
            WorkflowEventOutboxStatus.PENDING,
            WorkflowEventOutboxStatus.RETRY_SCHEDULED,
            WorkflowEventOutboxStatus.CLAIMED,
          ],
        },
      },
    });
  }

  countDeadLetter() {
    return this.prisma.workflowEventOutbox.count({
      where: { status: WorkflowEventOutboxStatus.DEAD_LETTER },
    });
  }

  findOldestPendingAgeMs(now: Date = new Date()): Promise<number | null> {
    return this.prisma.workflowEventOutbox
      .findFirst({
        where: { status: { in: CLAIMABLE_STATUSES } },
        orderBy: { availableAt: 'asc' },
        select: { availableAt: true },
      })
      .then((row) => (row ? Math.max(0, now.getTime() - row.availableAt.getTime()) : null));
  }

  async claimForProcessing(
    id: string,
    workerId: string,
    leaseMs: number,
    now: Date = new Date(),
  ) {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const result = await this.prisma.workflowEventOutbox.updateMany({
      where: {
        id,
        status: { in: CLAIMABLE_STATUSES },
        availableAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: WorkflowEventOutboxStatus.CLAIMED,
        claimedAt: now,
        claimedBy: workerId,
        leaseExpiresAt,
        attemptCount: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async renewLease(id: string, workerId: string, leaseMs: number, now: Date = new Date()) {
    const result = await this.prisma.workflowEventOutbox.updateMany({
      where: {
        id,
        status: WorkflowEventOutboxStatus.CLAIMED,
        claimedBy: workerId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
    });
    return result.count > 0;
  }

  async releaseExpiredClaim(id: string, now: Date = new Date()) {
    const result = await this.prisma.workflowEventOutbox.updateMany({
      where: {
        id,
        status: WorkflowEventOutboxStatus.CLAIMED,
        leaseExpiresAt: { lt: now },
      },
      data: {
        status: WorkflowEventOutboxStatus.RETRY_SCHEDULED,
        availableAt: now,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: 'lease_expired',
        lastErrorSummary: sanitizeOutboxErrorSummary('Processing lease expired before completion'),
      },
    });
    return result.count > 0;
  }

  markDispatched(id: string, workflowRunIds: string[]) {
    return this.prisma.workflowEventOutbox.update({
      where: { id },
      data: {
        status: WorkflowEventOutboxStatus.DISPATCHED,
        dispatchedAt: new Date(),
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorSummary: null,
        workflowRunId: workflowRunIds[0] ?? null,
      },
    });
  }

  markRetryScheduled(
    id: string,
    input: { errorCode: string; errorSummary: string; retryAt: Date },
  ) {
    return this.prisma.workflowEventOutbox.update({
      where: { id },
      data: {
        status: WorkflowEventOutboxStatus.RETRY_SCHEDULED,
        availableAt: input.retryAt,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: input.errorCode.slice(0, 64),
        lastErrorSummary: sanitizeOutboxErrorSummary(input.errorSummary),
      },
    });
  }

  markDeadLetter(id: string, input: { errorCode: string; errorSummary: string }) {
    return this.prisma.workflowEventOutbox.update({
      where: { id },
      data: {
        status: WorkflowEventOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: input.errorCode.slice(0, 64),
        lastErrorSummary: sanitizeOutboxErrorSummary(input.errorSummary),
      },
    });
  }

  findDeadLetterSummaries(organizationId: string, limit: number) {
    return this.prisma.workflowEventOutbox.findMany({
      where: {
        organizationId,
        status: WorkflowEventOutboxStatus.DEAD_LETTER,
      },
      orderBy: { deadLetteredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        correlationId: true,
        attemptCount: true,
        deadLetteredAt: true,
        lastErrorCode: true,
        lastErrorSummary: true,
        organizationId: true,
      },
    });
  }

  async replayDeadLetter(id: string, organizationId: string) {
    const result = await this.prisma.workflowEventOutbox.updateMany({
      where: {
        id,
        organizationId,
        status: WorkflowEventOutboxStatus.DEAD_LETTER,
      },
      data: {
        status: WorkflowEventOutboxStatus.PENDING,
        availableAt: new Date(),
        deadLetteredAt: null,
        dispatchedAt: null,
        attemptCount: 0,
        lastErrorCode: null,
        lastErrorSummary: null,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
      },
    });
    return result.count > 0;
  }

  organizationExists(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
  }
}

export type WorkflowEventOutboxRow = NonNullable<
  Awaited<ReturnType<WorkflowEventOutboxRepository['findById']>>
>;
