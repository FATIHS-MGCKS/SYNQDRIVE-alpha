import { Injectable } from '@nestjs/common';
import { BillingEmailSuppressionReason } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BillingEmailSuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuppressed(organizationId: string, email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return true;
    const row = await this.prisma.billingEmailSuppression.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email: normalized,
        },
      },
    });
    return !!row;
  }

  async suppress(input: {
    organizationId: string;
    email: string;
    reason: BillingEmailSuppressionReason;
    outboundEmailId?: string | null;
  }) {
    const normalized = input.email.trim().toLowerCase();
    if (!normalized) return null;
    return this.prisma.billingEmailSuppression.upsert({
      where: {
        organizationId_email: {
          organizationId: input.organizationId,
          email: normalized,
        },
      },
      create: {
        organizationId: input.organizationId,
        email: normalized,
        reason: input.reason,
        outboundEmailId: input.outboundEmailId ?? null,
      },
      update: {
        reason: input.reason,
        outboundEmailId: input.outboundEmailId ?? null,
        suppressedAt: new Date(),
      },
    });
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.billingEmailSuppression.findMany({
      where: { organizationId },
      orderBy: { suppressedAt: 'desc' },
    });
  }
}
