import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { AcceptedEntityLink } from './document-action.types';
import type { DocumentEntityLinkType } from './document-entity-link.types';

export type ValidateEntityLinksInput = {
  organizationId: string;
  vehicleId: string | null;
  links: AcceptedEntityLink[];
  scope: 'vehicle' | 'org';
};

export class DocumentEntityLinkValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateLinks(input: ValidateEntityLinksInput): Promise<void> {
    const seenTypes = new Set<DocumentEntityLinkType>();
    for (const link of input.links) {
      const entityType = link.entityType as DocumentEntityLinkType;
      if (seenTypes.has(entityType)) {
        throw new BadRequestException(`Duplicate entity link type: ${entityType}`);
      }
      seenTypes.add(entityType);
      await this.validateSingleLink(input, link);
    }
  }

  private async validateSingleLink(
    input: ValidateEntityLinksInput,
    link: AcceptedEntityLink,
  ): Promise<void> {
    switch (link.entityType) {
      case 'vehicle':
        await this.validateVehicle(input, link.entityId);
        return;
      case 'booking':
        await this.validateBooking(input, link.entityId);
        return;
      case 'customer':
        await this.validateCustomer(input.organizationId, link.entityId);
        return;
      case 'driver':
        await this.validateDriver(input.organizationId, link.entityId);
        return;
      case 'vendor':
        await this.validateVendor(input.organizationId, link.entityId);
        return;
      default:
        throw new BadRequestException(`Unsupported entity link type: ${link.entityType}`);
    }
  }

  private async validateVehicle(input: ValidateEntityLinksInput, entityId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: entityId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new BadRequestException('Confirmed vehicle link is invalid for this organization');
    }
    if (input.scope === 'vehicle' && input.vehicleId && input.vehicleId !== entityId) {
      throw new BadRequestException(
        'Vehicle entity link must match the scoped vehicle for vehicle-bound extractions',
      );
    }
  }

  private async validateBooking(input: ValidateEntityLinksInput, entityId: string): Promise<void> {
    const vehicleLink = input.links.find((row) => row.entityType === 'vehicle');
    const effectiveVehicleId = input.vehicleId ?? vehicleLink?.entityId ?? null;
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: entityId,
        organizationId: input.organizationId,
        ...(effectiveVehicleId ? { vehicleId: effectiveVehicleId } : {}),
      },
      select: { id: true },
    });
    if (!booking) {
      throw new BadRequestException(
        'Confirmed booking link is invalid for this organization/vehicle context',
      );
    }
  }

  private async validateCustomer(organizationId: string, entityId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true },
    });
    if (!customer) {
      throw new BadRequestException('Confirmed customer link is invalid for this organization');
    }
  }

  private async validateDriver(organizationId: string, entityId: string): Promise<void> {
    const driver = await this.prisma.customer.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true },
    });
    if (!driver) {
      throw new BadRequestException('Confirmed driver link is invalid for this organization');
    }
  }

  private async validateVendor(organizationId: string, entityId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true },
    });
    if (!vendor) {
      throw new BadRequestException('Confirmed vendor link is invalid for this organization');
    }
  }
}
