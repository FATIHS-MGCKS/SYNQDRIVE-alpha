import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LEGAL_STATUS } from './documents.constants';
import { buildResolverContext } from './legal-document-resolver.context';
import { resolveLegalDocuments } from './legal-document-resolver.engine';
import type {
  LegalDocumentResolverCandidate,
  LegalDocumentResolverInput,
  LegalDocumentResolverResult,
} from './legal-document-resolver.types';
import { LEGAL_DOCUMENT_RESOLVER_ERROR_CODES } from './legal-document-resolver.constants';
import { toLegalDocumentScopeShape } from './legal-document-scope.util';
import type { LegalDocumentWithStations } from './legal-document-scope.util';

/**
 * Central legal document resolver (Prompt 8/32).
 *
 * Determines which administratively approved legal documents apply to a concrete
 * booking/process context. SynqDrive does not provide legal advice — it executes
 * configured rules deterministically.
 */
@Injectable()
export class LegalDocumentResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve required legal documents for an explicit context.
   * Does not silently fall back to German — see fallbackDecisions in the result.
   */
  async resolve(input: LegalDocumentResolverInput): Promise<LegalDocumentResolverResult> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: input.organizationId },
      select: { language: true, country: true, businessType: true },
    });

    let customer = null;
    let booking = null;
    if (input.bookingId) {
      booking = await this.prisma.booking.findFirst({
        where: { id: input.bookingId, organizationId: input.organizationId },
        select: {
          id: true,
          pickupStationId: true,
          createdAt: true,
          customer: { select: { customerType: true, country: true } },
        },
      });
      if (!booking) {
        return this.errorResult(input, {
          code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.BOOKING_NOT_FOUND,
          message: 'Booking not found for resolver context',
        });
      }
      customer = booking.customer;
    }

    const built = buildResolverContext({
      resolverInput: input,
      organization,
      customer,
      booking,
    });

    const candidates = await this.loadCandidates(input.organizationId);

    return resolveLegalDocuments({
      context: built.context,
      candidates,
      documentTypes: input.documentTypes,
      fallbackDecisions: built.fallbackDecisions,
      contextErrors: built.errors,
    });
  }

  /**
   * Convenience entrypoint: load booking relations and resolve.
   */
  async resolveForBooking(
    organizationId: string,
    bookingId: string,
    overrides: Partial<LegalDocumentResolverInput> = {},
  ): Promise<LegalDocumentResolverResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.resolve({
      organizationId,
      bookingId,
      ...overrides,
    });
  }

  /** Map DB rows to resolver candidates (tenant-scoped query, in-memory match). */
  async loadCandidates(organizationId: string): Promise<LegalDocumentResolverCandidate[]> {
    const rows = await this.prisma.organizationLegalDocument.findMany({
      where: { organizationId },
      include: { stations: { select: { stationId: true } } },
      orderBy: [{ documentType: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toCandidate(row));
  }

  toCandidate(row: LegalDocumentWithStations): LegalDocumentResolverCandidate {
    const shape = toLegalDocumentScopeShape(row);
    return {
      id: row.id,
      organizationId: row.organizationId,
      documentType: row.documentType,
      legalVariant: row.legalVariant,
      title: row.title,
      versionLabel: row.versionLabel,
      language: row.language,
      jurisdictionCountry: row.jurisdictionCountry,
      customerSegment: row.customerSegment,
      bookingChannel: row.bookingChannel,
      productScope: row.productScope,
      stationScopeMode: row.stationScopeMode,
      stationIds: shape.stationIds ?? [],
      priority: row.priority,
      isMandatory: row.isMandatory,
      noticePurpose: row.noticePurpose,
      status: row.status,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      integrityStatus: row.integrityStatus,
      integrityUnavailable: row.integrityUnavailable,
    };
  }

  private async errorResult(
    input: LegalDocumentResolverInput,
    error: { code: string; message: string },
  ): Promise<LegalDocumentResolverResult> {
    const built = buildResolverContext({ resolverInput: input });
    return resolveLegalDocuments({
      context: built.context,
      candidates: [],
      contextErrors: [
        ...built.errors,
        { code: error.code as never, message: error.message },
      ],
      fallbackDecisions: built.fallbackDecisions,
    });
  }
}

/** Exported for tests — statuses considered by the loader (all rows loaded; engine filters). */
export const RESOLVER_LOADS_ALL_STATUSES = true;
