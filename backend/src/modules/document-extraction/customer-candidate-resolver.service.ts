import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  normalizeEmail,
  normalizeIdNumber,
  normalizePhone,
} from '@modules/customers/utils/customer-normalizer.util';
import {
  buildCustomerResolverHints,
  buildCustomerResolverPrivateHints,
  scoreCustomerCandidates,
} from './customer-candidate-matching.util';
import {
  CUSTOMER_CANDIDATE_RESOLVER_DOCUMENT_TYPES,
  type CustomerCandidatePipelineState,
  type CustomerCandidateResolverInput,
  type CustomerCandidateSearchRecord,
  type CustomerResolverPrivateHints,
} from './customer-candidate-resolver.types';

const CUSTOMER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  emailNormalized: true,
  phoneNormalized: true,
  fullNameNormalized: true,
  address: true,
  city: true,
  zip: true,
  taxId: true,
  idNumberNormalized: true,
} satisfies Prisma.CustomerSelect;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CustomerCandidateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  supportsDocumentType(documentType: string): boolean {
    return (CUSTOMER_CANDIDATE_RESOLVER_DOCUMENT_TYPES as readonly string[]).includes(
      documentType,
    );
  }

  async resolve(input: CustomerCandidateResolverInput): Promise<CustomerCandidatePipelineState> {
    let bookingLinkCustomerId = input.bookingLinkCustomerId ?? null;
    if (!bookingLinkCustomerId && input.linkedBookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: input.linkedBookingId, organizationId: input.organizationId },
        select: { customerId: true },
      });
      bookingLinkCustomerId = booking?.customerId ?? null;
    }

    const privateHints = buildCustomerResolverPrivateHints({
      ...input,
      bookingLinkCustomerId,
    });
    const hints = buildCustomerResolverHints(privateHints, input.linkedBookingId);

    const customers = await this.loadCustomersForHints(input.organizationId, privateHints);
    const candidates = scoreCustomerCandidates({ customers, privateHints });
    const ambiguousNameMatch = candidates.filter((candidate) =>
      candidate.conflicts.some((conflict) => conflict.code === 'DUPLICATE_NAME'),
    ).length > 1;

    return {
      evaluatedAt: new Date().toISOString(),
      hints,
      candidates,
      ambiguousNameMatch,
      autoConfirmEligible: false,
    };
  }

  private async loadCustomersForHints(
    organizationId: string,
    privateHints: CustomerResolverPrivateHints,
  ): Promise<CustomerCandidateSearchRecord[]> {
    const baseWhere: Prisma.CustomerWhereInput = {
      organizationId,
      archivedAt: null,
      status: 'ACTIVE',
    };
    const whereOr: Prisma.CustomerWhereInput[] = [];

    if (privateHints.documentContextCustomerId) {
      whereOr.push({ id: privateHints.documentContextCustomerId });
    }
    if (privateHints.bookingLinkCustomerId) {
      whereOr.push({ id: privateHints.bookingLinkCustomerId });
    }

    const customerNumber = privateHints.customerNumber?.trim();
    if (customerNumber && UUID_RE.test(customerNumber)) {
      whereOr.push({ id: customerNumber });
    } else if (customerNumber) {
      const normalizedNumber = normalizeIdNumber(customerNumber);
      if (normalizedNumber) {
        whereOr.push({ taxId: { equals: customerNumber, mode: 'insensitive' } });
        whereOr.push({ idNumberNormalized: normalizedNumber });
      }
    }

    const email = privateHints.email ? normalizeEmail(privateHints.email) : null;
    if (email) {
      whereOr.push({ emailNormalized: email });
    }

    const phone = privateHints.phone ? normalizePhone(privateHints.phone) : null;
    if (phone && phone.length >= 6) {
      whereOr.push({ phoneNormalized: phone });
    }

    if (privateHints.customerName) {
      const normalizedName = privateHints.customerName.trim().toLowerCase().replace(/\s+/g, ' ');
      whereOr.push({ fullNameNormalized: normalizedName });
      whereOr.push({ company: { equals: privateHints.customerName, mode: 'insensitive' } });
    }

    if (privateHints.addressLine) {
      whereOr.push({ address: { equals: privateHints.addressLine, mode: 'insensitive' } });
    }
    if (privateHints.city && privateHints.zip) {
      whereOr.push({
        AND: [
          { city: { equals: privateHints.city, mode: 'insensitive' } },
          { zip: { equals: privateHints.zip, mode: 'insensitive' } },
        ],
      });
    }

    if (whereOr.length === 0) {
      return [];
    }

    const rows = await this.prisma.customer.findMany({
      where: {
        ...baseWhere,
        OR: whereOr,
      },
      select: CUSTOMER_SELECT,
      take: 25,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return [...byId.values()];
  }
}
