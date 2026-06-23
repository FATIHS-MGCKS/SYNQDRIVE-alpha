import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface BillingAuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class BillingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: BillingAuditInput) {
    return this.prisma.billingAuditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeJson: input.before != null ? (input.before as Prisma.InputJsonValue) : undefined,
        afterJson: input.after != null ? (input.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
