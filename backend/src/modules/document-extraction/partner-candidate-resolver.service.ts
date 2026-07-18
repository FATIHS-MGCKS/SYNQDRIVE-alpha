import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeEmail, normalizeIdNumber } from '@modules/customers/utils/customer-normalizer.util';
import {
  buildNewPartnerSuggestion,
  buildPartnerResolverHints,
  buildPartnerResolverPrivateHints,
  extractHistoricalSignalsFromInvoiceData,
  normalizeIban,
  normalizePartnerName,
  resolveExpectedPartnerKind,
  scorePartnerCandidates,
} from './partner-candidate-matching.util';
import {
  PARTNER_CANDIDATE_RESOLVER_DOCUMENT_TYPES,
  type PartnerCandidatePipelineState,
  type PartnerCandidateResolverInput,
  type PartnerCandidateSearchRecord,
  type PartnerHistoricalSignals,
  type PartnerRelationshipContext,
  type PartnerResolverPrivateHints,
} from './partner-candidate-resolver.types';

const VENDOR_SELECT = {
  id: true,
  name: true,
  category: true,
  email: true,
  contactEmail: true,
  street: true,
  city: true,
  postalCode: true,
} satisfies Prisma.VendorSelect;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PartnerCandidateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  supportsDocumentType(documentType: string): boolean {
    return (PARTNER_CANDIDATE_RESOLVER_DOCUMENT_TYPES as readonly string[]).includes(
      documentType,
    );
  }

  async resolve(input: PartnerCandidateResolverInput): Promise<PartnerCandidatePipelineState> {
    const expectedPartnerKind = resolveExpectedPartnerKind(input.documentType);
    const privateHints = buildPartnerResolverPrivateHints(input);
    const hints = buildPartnerResolverHints(privateHints, expectedPartnerKind);
    const relationships = await this.loadRelationshipContext(input);
    const vendors = await this.loadVendorsForHints({
      organizationId: input.organizationId,
      privateHints,
      relationships,
    });

    const candidates = scorePartnerCandidates({
      vendors,
      privateHints,
      expectedPartnerKind,
      relationships,
    });

    const newPartnerSuggestion = buildNewPartnerSuggestion({
      privateHints,
      expectedPartnerKind,
      documentType: input.documentType,
      candidates,
    });

    const plausible = candidates.filter((candidate) => candidate.confidence >= 0.55);

    return {
      evaluatedAt: new Date().toISOString(),
      hints,
      candidates,
      newPartnerSuggestion,
      ambiguousPartnerMatch: plausible.length > 1,
      autoConfirmEligible: false,
    };
  }

  private async loadRelationshipContext(
    input: PartnerCandidateResolverInput,
  ): Promise<PartnerRelationshipContext> {
    const invoiceWhere: Prisma.OrgInvoiceWhereInput = {
      organizationId: input.organizationId,
      vendorId: { not: null },
    };
    if (input.resolvedVehicleId) {
      invoiceWhere.vehicleId = input.resolvedVehicleId;
    }

    const [invoices, serviceCases] = await Promise.all([
      this.prisma.orgInvoice.findMany({
        where: invoiceWhere,
        select: { vendorId: true, extractedData: true },
        orderBy: { invoiceDate: 'desc' },
        take: 100,
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId: input.organizationId,
          vendorId: { not: null },
          ...(input.resolvedVehicleId ? { vehicleId: input.resolvedVehicleId } : {}),
        },
        select: { vendorId: true },
        orderBy: { openedAt: 'desc' },
        take: 50,
      }),
    ]);

    const invoiceVendorIds = new Set(
      invoices.map((row) => row.vendorId).filter((id): id is string => Boolean(id)),
    );
    const serviceVendorIds = new Set(
      serviceCases.map((row) => row.vendorId).filter((id): id is string => Boolean(id)),
    );

    const historicalByVendor = new Map<string, PartnerHistoricalSignals>();
    for (const invoice of invoices) {
      if (!invoice.vendorId) continue;
      const signals = extractHistoricalSignalsFromInvoiceData(invoice.extractedData);
      const existing = historicalByVendor.get(invoice.vendorId) ?? {
        vendorId: invoice.vendorId,
        ibans: new Set<string>(),
        vatIds: new Set<string>(),
        taxIds: new Set<string>(),
      };
      if (signals.iban) existing.ibans.add(signals.iban);
      if (signals.vatId) existing.vatIds.add(signals.vatId);
      if (signals.taxId) existing.taxIds.add(signals.taxId);
      historicalByVendor.set(invoice.vendorId, existing);
    }

    return { invoiceVendorIds, serviceVendorIds, historicalByVendor };
  }

  private async loadVendorsForHints(input: {
    organizationId: string;
    privateHints: PartnerResolverPrivateHints;
    relationships: PartnerRelationshipContext;
  }): Promise<PartnerCandidateSearchRecord[]> {
    const { organizationId, privateHints, relationships } = input;
    const whereOr: Prisma.VendorWhereInput[] = [];

    if (privateHints.vendorId && UUID_RE.test(privateHints.vendorId)) {
      whereOr.push({ id: privateHints.vendorId });
    }

    const email = privateHints.email ? normalizeEmail(privateHints.email) : null;
    if (email) {
      whereOr.push({ email: { equals: privateHints.email, mode: 'insensitive' } });
      whereOr.push({ contactEmail: { equals: privateHints.email, mode: 'insensitive' } });
    }

    if (privateHints.organizationName) {
      whereOr.push({
        name: { equals: privateHints.organizationName, mode: 'insensitive' },
      });
      const normalized = normalizePartnerName(privateHints.organizationName);
      if (normalized.length >= 4) {
        whereOr.push({ name: { contains: privateHints.organizationName, mode: 'insensitive' } });
      }
    }

    if (privateHints.addressLine) {
      whereOr.push({ street: { equals: privateHints.addressLine, mode: 'insensitive' } });
    }
    if (privateHints.city && privateHints.postalCode) {
      whereOr.push({
        AND: [
          { city: { equals: privateHints.city, mode: 'insensitive' } },
          { postalCode: { equals: privateHints.postalCode, mode: 'insensitive' } },
        ],
      });
    }

    for (const vendorId of relationships.invoiceVendorIds) {
      whereOr.push({ id: vendorId });
    }
    for (const vendorId of relationships.serviceVendorIds) {
      whereOr.push({ id: vendorId });
    }
    for (const vendorId of relationships.historicalByVendor.keys()) {
      whereOr.push({ id: vendorId });
    }

    if (whereOr.length === 0) {
      return [];
    }

    const rows = await this.prisma.vendor.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: whereOr,
      },
      select: VENDOR_SELECT,
      take: 25,
    });

    const iban = privateHints.iban ? normalizeIban(privateHints.iban) : null;
    const vatId = privateHints.vatId ? normalizeIdNumber(privateHints.vatId) : null;
    const taxId = privateHints.taxId ? normalizeIdNumber(privateHints.taxId) : null;

    const byId = new Map(rows.map((row) => [row.id, row]));

    if (iban || vatId || taxId) {
      for (const [vendorId, historical] of relationships.historicalByVendor.entries()) {
        const matchesHistorical =
          (iban && historical.ibans.has(iban)) ||
          (vatId && historical.vatIds.has(vatId)) ||
          (taxId && historical.taxIds.has(taxId));
        if (!matchesHistorical || byId.has(vendorId)) continue;
        const vendor = await this.prisma.vendor.findFirst({
          where: { id: vendorId, organizationId, isActive: true },
          select: VENDOR_SELECT,
        });
        if (vendor) byId.set(vendor.id, vendor);
      }
    }

    return [...byId.values()];
  }
}
