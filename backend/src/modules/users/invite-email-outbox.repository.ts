import { Injectable } from '@nestjs/common';
import { InviteEmailOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateInviteEmailOutboxInput {
  organizationId: string;
  inviteId: string;
  idempotencyKey: string;
  tokenCiphertext: string;
  sentByUserId?: string | null;
  availableAt?: Date;
}

@Injectable()
export class InviteEmailOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEntryIdempotent(input: CreateInviteEmailOutboxInput) {
    try {
      return await this.prisma.inviteEmailOutbox.create({
        data: {
          organizationId: input.organizationId,
          inviteId: input.inviteId,
          idempotencyKey: input.idempotencyKey,
          tokenCiphertext: input.tokenCiphertext,
          sentByUserId: input.sentByUserId ?? null,
          availableAt: input.availableAt ?? new Date(),
          status: InviteEmailOutboxStatus.PENDING,
        },
      });
    } catch (err) {
      const code =
        err instanceof Prisma.PrismaClientKnownRequestError
          ? err.code
          : err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : undefined;
      if (code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  findById(id: string) {
    return this.prisma.inviteEmailOutbox.findUnique({ where: { id } });
  }

  findLatestByInviteIds(inviteIds: string[]) {
    if (inviteIds.length === 0) {
      return new Map<string, Awaited<ReturnType<typeof this.findById>>>();
    }
    return this.prisma.inviteEmailOutbox
      .findMany({
        where: { inviteId: { in: inviteIds } },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => {
        const map = new Map<string, (typeof rows)[number]>();
        for (const row of rows) {
          if (!map.has(row.inviteId)) {
            map.set(row.inviteId, row);
          }
        }
        return map;
      });
  }

  findPendingBatch(limit: number, now: Date = new Date()) {
    return this.prisma.inviteEmailOutbox.findMany({
      where: {
        status: InviteEmailOutboxStatus.PENDING,
        availableAt: { lte: now },
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.inviteEmailOutbox.updateMany({
      where: {
        id,
        status: InviteEmailOutboxStatus.PENDING,
      },
      data: {
        status: InviteEmailOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
  }

  markCompleted(id: string) {
    return this.prisma.inviteEmailOutbox.update({
      where: { id },
      data: {
        status: InviteEmailOutboxStatus.COMPLETED,
        tokenCiphertext: null,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.inviteEmailOutbox.update({
      where: { id },
      data: {
        status: InviteEmailOutboxStatus.DEAD_LETTER,
        tokenCiphertext: null,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: new Date(),
      },
    });
  }

  markRetry(id: string, errorMessage: string, availableAt: Date) {
    return this.prisma.inviteEmailOutbox.update({
      where: { id },
      data: {
        status: InviteEmailOutboxStatus.PENDING,
        errorMessage: errorMessage.slice(0, 2000),
        availableAt,
      },
    });
  }
}
