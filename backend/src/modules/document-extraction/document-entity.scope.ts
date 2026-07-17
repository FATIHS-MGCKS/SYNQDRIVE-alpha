import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DocumentEntityType } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export async function assertDocumentEntityInOrganization(
  prisma: PrismaService,
  organizationId: string,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<void> {
  if (!entityId?.trim()) {
    throw new BadRequestException('Entity id is required for link confirmation');
  }

  switch (entityType) {
    case 'VEHICLE': {
      const row = await prisma.vehicle.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('Vehicle not found for organization');
      return;
    }
    case 'BOOKING': {
      const row = await prisma.booking.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('Booking not found for organization');
      return;
    }
    case 'CUSTOMER':
    case 'DRIVER': {
      const row = await prisma.customer.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('Customer not found for organization');
      return;
    }
    case 'VENDOR': {
      const row = await prisma.vendor.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('Vendor not found for organization');
      return;
    }
    case 'ORGANIZATION': {
      if (entityId !== organizationId) {
        throw new NotFoundException('Organization entity id must match tenant scope');
      }
      return;
    }
    default: {
      const exhaustive: never = entityType;
      throw new BadRequestException(`Unsupported entity type: ${exhaustive}`);
    }
  }
}

export async function assertExtractionInOrganization(
  prisma: PrismaService,
  organizationId: string,
  extractionId: string,
): Promise<{ id: string; organizationId: string | null }> {
  const extraction = await prisma.vehicleDocumentExtraction.findFirst({
    where: {
      id: extractionId,
      OR: [{ organizationId }, { vehicle: { organizationId } }],
    },
    select: { id: true, organizationId: true },
  });
  if (!extraction) {
    throw new NotFoundException('Document extraction not found for organization');
  }
  return extraction;
}
