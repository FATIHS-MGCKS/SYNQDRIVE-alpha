import { Injectable } from '@nestjs/common';
import { Prisma, TaskAutomationOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TaskAutomationOutboxMeta } from './task-automation-outbox.types';
import { sanitizeAutomationError } from './task-automation-outbox-error.util';

export interface EnqueueTaskAutomationOutboxInput extends TaskAutomationOutboxMeta {
  lastError?: string;
  availableAt?: Date;
}

@Injectable()
export class TaskAutomationOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, organizationId?: string) {
    return this.prisma.taskAutomationOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.taskAutomationOutbox.findUnique({
      where: { idempotencyKey },
    });
  }

  findPendingBatch(limit: number, now: Date = new Date()) {
    return this.prisma.taskAutomationOutbox.findMany({
      where: {
        status: TaskAutomationOutboxStatus.PENDING,
        availableAt: { lte: now },
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
  }

  countBacklog() {
    return this.prisma.taskAutomationOutbox.count({
      where: {
        status: {
          in: [TaskAutomationOutboxStatus.PENDING, TaskAutomationOutboxStatus.DEAD_LETTER],
        },
      },
    });
  }

  async enqueueOrRefresh(input: EnqueueTaskAutomationOutboxInput) {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!existing) {
      return this.prisma.taskAutomationOutbox.create({
        data: {
          organizationId: input.organizationId,
          ruleId: input.ruleId,
          ruleVersion: input.ruleVersion,
          entityType: input.entityType,
          entityId: input.entityId,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          status: TaskAutomationOutboxStatus.PENDING,
          availableAt: input.availableAt ?? new Date(),
          lastError: input.lastError ? sanitizeAutomationError(input.lastError) : null,
        },
      });
    }

    if (existing.status === TaskAutomationOutboxStatus.PROCESSING) {
      return existing;
    }

    return this.prisma.taskAutomationOutbox.update({
      where: { id: existing.id },
      data: {
        status: TaskAutomationOutboxStatus.PENDING,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        lastError: input.lastError ? sanitizeAutomationError(input.lastError) : existing.lastError,
        availableAt: input.availableAt ?? new Date(),
        processedAt: null,
        attempts:
          existing.status === TaskAutomationOutboxStatus.DEAD_LETTER ? 0 : existing.attempts,
      },
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.taskAutomationOutbox.updateMany({
      where: {
        id,
        status: TaskAutomationOutboxStatus.PENDING,
      },
      data: {
        status: TaskAutomationOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markCompleted(id: string) {
    return this.prisma.taskAutomationOutbox.update({
      where: { id },
      data: {
        status: TaskAutomationOutboxStatus.COMPLETED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  markRetry(id: string, error: string, retryAt: Date) {
    return this.prisma.taskAutomationOutbox.update({
      where: { id },
      data: {
        status: TaskAutomationOutboxStatus.PENDING,
        lastError: sanitizeAutomationError(error),
        availableAt: retryAt,
      },
    });
  }

  markDeadLetter(id: string, error: string) {
    return this.prisma.taskAutomationOutbox.update({
      where: { id },
      data: {
        status: TaskAutomationOutboxStatus.DEAD_LETTER,
        processedAt: new Date(),
        lastError: sanitizeAutomationError(error),
      },
    });
  }
}
