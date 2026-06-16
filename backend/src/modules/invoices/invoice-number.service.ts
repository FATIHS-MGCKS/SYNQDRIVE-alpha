import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class InvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically allocates the next invoice sequence for org+year and returns
   * display string e.g. FSM-2026-0001.
   */
  async allocate(orgId: string, year: number): Promise<{
    sequenceYear: number;
    sequenceNumber: number;
    invoiceNumberDisplay: string;
  }> {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { shortCode: true, companyName: true },
    });
    const prefix = (org?.shortCode || org?.companyName?.slice(0, 3) || 'INV')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.orgInvoiceSequence.findUnique({
        where: { organizationId_sequenceYear: { organizationId: orgId, sequenceYear: year } },
      });
      const next = (existing?.lastNumber ?? 0) + 1;
      if (existing) {
        await tx.orgInvoiceSequence.update({
          where: { id: existing.id },
          data: { lastNumber: next },
        });
      } else {
        await tx.orgInvoiceSequence.create({
          data: { organizationId: orgId, sequenceYear: year, lastNumber: next },
        });
      }
      return next;
    });

    const padded = String(result).padStart(4, '0');
    return {
      sequenceYear: year,
      sequenceNumber: result,
      invoiceNumberDisplay: `${prefix}-${year}-${padded}`,
    };
  }
}
