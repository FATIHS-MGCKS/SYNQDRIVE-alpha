import { Injectable } from '@nestjs/common';
import { ProcessingActivityRegisterAuditAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class ProcessingActivityRegisterAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: {
      organizationId: string;
      action: ProcessingActivityRegisterAuditAction;
      actorUserId?: string | null;
      processingActivityId?: string | null;
      exportId?: string | null;
      metadata?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.processingActivityRegisterAuditEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        processingActivityId: input.processingActivityId ?? null,
        exportId: input.exportId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
