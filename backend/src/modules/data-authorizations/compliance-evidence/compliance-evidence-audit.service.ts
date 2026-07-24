import { Injectable } from '@nestjs/common';
import { ComplianceEvidenceAuditAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class ComplianceEvidenceAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: {
      organizationId: string;
      action: ComplianceEvidenceAuditAction;
      actorUserId?: string | null;
      reportId?: string | null;
      metadata?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.complianceEvidenceReportAuditEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        reportId: input.reportId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
