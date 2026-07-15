import { Injectable } from '@nestjs/common';
import { BillingCommandStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BillingCommandOrchestratorService {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingExternalSyncs(limit = 50) {
    return this.prisma.billingDomainEventOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
  }

  async getCommandSyncStatus(commandId: string) {
    const command = await this.prisma.billingCommand.findUnique({
      where: { id: commandId },
      select: {
        id: true,
        status: true,
        commandType: true,
        resultReference: true,
        completedAt: true,
        failedAt: true,
        errorCode: true,
        errorMessage: true,
      },
    });
    if (!command) return null;

    const outbox = await this.prisma.billingDomainEventOutbox.findMany({
      where: {
        idempotencyKey: { startsWith: `billing-command:${commandId}:` },
      },
      select: {
        id: true,
        eventType: true,
        status: true,
        publishedAt: true,
        retryCount: true,
        lastError: true,
      },
    });

    return { command, outbox };
  }

  async markOutboxPublished(
    outboxId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.billingDomainEventOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  async markOutboxFailed(outboxId: string, error: string) {
    return this.prisma.billingDomainEventOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        lastError: error.slice(0, 500),
      },
    });
  }

  isCommandTerminal(status: BillingCommandStatus) {
    return status === BillingCommandStatus.COMPLETED || status === BillingCommandStatus.FAILED;
  }
}
