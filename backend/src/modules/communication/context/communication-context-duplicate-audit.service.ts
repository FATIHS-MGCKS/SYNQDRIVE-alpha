import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CommunicationContextDuplicateAuditResult {
  organizationsScanned: number;
  orgsWithDuplicatePhone: number;
  orgsWithDuplicateEmail: number;
}

@Injectable()
export class CommunicationContextDuplicateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate-only duplicate identity audit — no PII in output.
   */
  async audit(options: { organizationId?: string } = {}): Promise<CommunicationContextDuplicateAuditResult> {
    const phoneDupes = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`
      SELECT organization_id
      FROM customers
      WHERE archived_at IS NULL
        AND phone_normalized IS NOT NULL
        ${options.organizationId ? Prisma.sql`AND organization_id = ${options.organizationId}` : Prisma.empty}
      GROUP BY organization_id, phone_normalized
      HAVING COUNT(*) > 1
    `;

    const emailDupes = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`
      SELECT organization_id
      FROM customers
      WHERE archived_at IS NULL
        AND email_normalized IS NOT NULL
        ${options.organizationId ? Prisma.sql`AND organization_id = ${options.organizationId}` : Prisma.empty}
      GROUP BY organization_id, email_normalized
      HAVING COUNT(*) > 1
    `;

    const orgIds = new Set<string>();
    for (const row of phoneDupes) orgIds.add(row.organization_id);
    for (const row of emailDupes) orgIds.add(row.organization_id);

    const organizationsScanned = options.organizationId
      ? 1
      : await this.prisma.organization.count();

    return {
      organizationsScanned,
      orgsWithDuplicatePhone: new Set(phoneDupes.map((r) => r.organization_id)).size,
      orgsWithDuplicateEmail: new Set(emailDupes.map((r) => r.organization_id)).size,
    };
  }
}
