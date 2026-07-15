import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { sanitizeBillingAuditPayload } from './domain/billing-command';

export interface BillingAuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  idempotencyKey?: string | null;
  reason?: string | null;
  changedFields?: string[];
}

@Injectable()
export class BillingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: BillingAuditInput) {
    return this.createRow(this.prisma, input);
  }

  async logInTransaction(tx: Prisma.TransactionClient, input: BillingAuditInput) {
    return this.createRow(tx, input);
  }

  private createRow(
    client: Prisma.TransactionClient | PrismaService,
    input: BillingAuditInput,
  ) {
    return client.billingAuditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeJson:
          input.before != null
            ? (sanitizeBillingAuditPayload(input.before) as Prisma.InputJsonValue)
            : undefined,
        afterJson:
          input.after != null
            ? (sanitizeBillingAuditPayload(input.after) as Prisma.InputJsonValue)
            : undefined,
        requestId: input.requestId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        reason: input.reason ?? null,
        changedFieldsJson:
          input.changedFields?.length
            ? (input.changedFields as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}
