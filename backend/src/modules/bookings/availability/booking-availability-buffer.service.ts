import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DEFAULT_POLICY } from '@modules/business-insights/insight.types';

/**
 * Resolves turnaround/handover buffer minutes for vehicle availability.
 * Source: tenant insight policy (`handoverBufferMin`) — same field used by tight-handover insights.
 */
@Injectable()
export class BookingAvailabilityBufferService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTurnaroundBufferMinutes(organizationId: string): Promise<number> {
    const row = await this.prisma.tenantInsightPolicy.findUnique({
      where: { organizationId },
      select: { policyOverrides: true },
    });
    const overrides = (row?.policyOverrides ?? {}) as Record<string, unknown>;
    const raw = overrides.handoverBufferMin;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return Math.floor(raw);
    }
    return DEFAULT_POLICY.handoverBufferMin;
  }
}
