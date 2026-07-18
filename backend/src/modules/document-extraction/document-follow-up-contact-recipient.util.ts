import type { VendorCategory } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import type {
  DocumentFollowUpContactRecipientDto,
  DocumentFollowUpContactTarget,
} from './document-follow-up-contact.types';

type ResolveRecipientInput = {
  orgId: string;
  contactTarget: DocumentFollowUpContactTarget;
  confirmedData: Record<string, unknown>;
  prisma: PrismaService;
};

function emptyRecipient(
  entityType: string,
  emailSource: DocumentFollowUpContactRecipientDto['emailSource'],
): DocumentFollowUpContactRecipientDto {
  return {
    entityType,
    entityId: null,
    displayName: null,
    email: null,
    emailSource,
  };
}

async function resolveCustomerRecipient(
  prisma: PrismaService,
  orgId: string,
  entityId: string,
): Promise<DocumentFollowUpContactRecipientDto> {
  const customer = await prisma.customer.findFirst({
    where: { id: entityId, organizationId: orgId },
    select: { id: true, firstName: true, lastName: true, company: true, email: true },
  });
  if (!customer) {
    return {
      entityType: 'customer',
      entityId,
      displayName: null,
      email: null,
      emailSource: 'entity_link',
    };
  }
  const displayName =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() ||
    null;
  return {
    entityType: 'customer',
    entityId: customer.id,
    displayName,
    email: customer.email?.trim() || null,
    emailSource: customer.email ? 'customer_record' : 'entity_link',
  };
}

async function resolveVendorRecipient(
  prisma: PrismaService,
  orgId: string,
  entityId: string,
  preferInsurance: boolean,
): Promise<DocumentFollowUpContactRecipientDto> {
  const vendor = await prisma.vendor.findFirst({
    where: { id: entityId, organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      contactEmail: true,
      category: true,
    },
  });
  if (!vendor) {
    return {
      entityType: 'vendor',
      entityId,
      displayName: null,
      email: null,
      emailSource: 'entity_link',
    };
  }
  const email = vendor.contactEmail?.trim() || vendor.email?.trim() || null;
  const isInsurance = vendor.category === ('INSURANCE' as VendorCategory);
  return {
    entityType: preferInsurance || isInsurance ? 'insurance' : 'vendor',
    entityId: vendor.id,
    displayName: vendor.name,
    email,
    emailSource: email ? 'vendor_record' : 'entity_link',
  };
}

async function resolveInsurancePartnerRecipient(
  prisma: PrismaService,
  orgId: string,
): Promise<DocumentFollowUpContactRecipientDto> {
  const access = await prisma.insurancePartnerOrgAccess.findFirst({
    where: { organizationId: orgId, isEnabled: true },
    include: {
      partner: {
        include: {
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const primary = access?.partner.contacts[0];
  if (!primary?.email?.trim()) {
    return emptyRecipient('insurance', 'manual_required');
  }
  return {
    entityType: 'insurance',
    entityId: access?.partner.id ?? null,
    displayName: access?.partner.displayName ?? primary.fullName ?? null,
    email: primary.email.trim(),
    emailSource: 'insurance_partner',
  };
}

export async function resolveContactRecipient(
  input: ResolveRecipientInput,
): Promise<DocumentFollowUpContactRecipientDto> {
  const links = readAcceptedEntityLinks(input.confirmedData);
  const byType = new Map(links.map((link) => [link.entityType, link.entityId]));

  switch (input.contactTarget) {
    case 'CUSTOMER': {
      const customerId = byType.get('customer');
      if (!customerId) return emptyRecipient('customer', 'manual_required');
      return resolveCustomerRecipient(input.prisma, input.orgId, customerId);
    }
    case 'DRIVER': {
      const driverId = byType.get('driver') ?? byType.get('driver_customer');
      if (!driverId) return emptyRecipient('driver', 'manual_required');
      return resolveCustomerRecipient(input.prisma, input.orgId, driverId);
    }
    case 'VENDOR': {
      const vendorId = byType.get('vendor') ?? byType.get('partner');
      if (!vendorId) return emptyRecipient('vendor', 'manual_required');
      return resolveVendorRecipient(input.prisma, input.orgId, vendorId, false);
    }
    case 'INSURANCE': {
      const vendorId = byType.get('vendor') ?? byType.get('partner');
      if (vendorId) {
        const vendorRecipient = await resolveVendorRecipient(
          input.prisma,
          input.orgId,
          vendorId,
          true,
        );
        if (vendorRecipient.email) return vendorRecipient;
      }
      return resolveInsurancePartnerRecipient(input.prisma, input.orgId);
    }
    default:
      return emptyRecipient('unknown', 'manual_required');
  }
}
