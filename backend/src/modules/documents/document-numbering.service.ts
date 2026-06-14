import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENT_NUMBER_PREFIX } from './documents.constants';

/**
 * Generates human-readable document numbers scoped per organization + type +
 * year, e.g. `RE-2026-0001` (booking invoice), `SR-2026-0001` (final invoice),
 * `KA-…` (deposit), `MV-…` (contract), `UP-…`/`RP-…` (handover protocols).
 *
 * Numbering is derived from the count of GeneratedDocument rows of the same
 * type for the org in the current year (+1, zero-padded). This is a best-effort
 * sequence: under highly concurrent generation two numbers could theoretically
 * collide, so a short random suffix is appended as a deterministic fallback when
 * a generated number is already taken. Existing OrgInvoice autoincrement numbers
 * are untouched — these are separate, document-level reference numbers.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async nextNumber(organizationId: string, documentType: string): Promise<string> {
    const prefix = DOCUMENT_NUMBER_PREFIX[documentType] ?? 'DOC';
    const year = new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const count = await this.prisma.generatedDocument.count({
      where: {
        organizationId,
        documentType,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });

    const candidate = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;

    // Defensive uniqueness check (best-effort): if a row with this number
    // already exists for the org, fall back to a short random suffix.
    const exists = await this.prisma.generatedDocument.findFirst({
      where: { organizationId, documentNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;

    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}-${suffix}`;
  }
}
