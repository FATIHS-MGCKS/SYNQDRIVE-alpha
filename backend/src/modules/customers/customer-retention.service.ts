import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * Placeholder for future PII retention / anonymization workflows.
 * No automatic deletion is performed yet.
 */
@Injectable()
export class CustomerRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getRetentionState(orgId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: {
        piiAnonymizedAt: true,
        piiAnonymizedByUserId: true,
        retentionUntil: true,
      },
    });
    return customer;
  }
}
