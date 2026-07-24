import { Injectable } from '@nestjs/common';
import { DpaAuditEventType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class DpaAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      agreementId: string;
      eventType: DpaAuditEventType;
      actorUserId?: string | null;
      summary: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.dataProcessingAgreementAuditEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        agreementId: input.agreementId,
        eventType: input.eventType,
        actorUserId: input.actorUserId ?? null,
        summary: input.summary,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
