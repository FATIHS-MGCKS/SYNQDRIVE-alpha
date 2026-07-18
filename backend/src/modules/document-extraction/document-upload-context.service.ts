import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES,
  type DocumentUploadContextCandidate,
  type DocumentUploadContextEntitySnapshot,
  type DocumentUploadContextInputEntityType,
  type ResolvedDocumentUploadTarget,
} from './document-upload-context.types';
import {
  buildUploadContextCandidate,
  buildUploadContextSearchScope,
  isUploadContextInputEntityType,
  parseUploadContextEntityType,
} from './document-upload-context.util';

@Injectable()
export class DocumentUploadContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUploadTarget(params: {
    organizationId: string;
    vehicleId?: string | null;
    optionalContextType?: string | null;
    optionalContextId?: string | null;
    sourceSurface?: string | null;
    providedByUserId?: string | null;
    providedAt?: string;
  }): Promise<ResolvedDocumentUploadTarget> {
    const organizationId = params.organizationId;
    const sourceSurface = (params.sourceSurface?.trim() || 'api').slice(0, 120);

    if (params.vehicleId) {
      const snapshot = await this.loadEntitySnapshot('VEHICLE', params.vehicleId, organizationId);
      await this.assertEntityInOrganization('VEHICLE', organizationId, params.vehicleId);
      const candidate = buildUploadContextCandidate({
        entityType: 'VEHICLE',
        entityId: params.vehicleId,
        sourceSurface,
        providedByUserId: params.providedByUserId,
        providedAt: params.providedAt,
      });
      return this.buildTarget({
        organizationId,
        vehicleId: params.vehicleId,
        candidate,
      });
    }

    const parsedType = parseUploadContextEntityType(params.optionalContextType);
    const contextId = params.optionalContextId?.trim() || null;

    if (!parsedType && !contextId) {
      return this.buildTarget({ organizationId, vehicleId: null, candidate: null });
    }

    if (parsedType === DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.NONE) {
      if (contextId) {
        throw new BadRequestException({
          message: 'optionalContextId must not be set when optionalContextType is NONE',
          errorCode: 'DOCUMENT_UPLOAD_CONTEXT_NONE_WITH_ID',
        });
      }
      return this.buildTarget({ organizationId, vehicleId: null, candidate: null });
    }

    if (!parsedType || !contextId) {
      throw new BadRequestException({
        message: 'optionalContextType and optionalContextId must be provided together',
        errorCode: 'DOCUMENT_UPLOAD_CONTEXT_INCOMPLETE',
      });
    }

    if (!isUploadContextInputEntityType(parsedType)) {
      throw new BadRequestException({
        message: `Unsupported optionalContextType: ${parsedType}`,
        errorCode: 'DOCUMENT_UPLOAD_CONTEXT_UNSUPPORTED',
      });
    }

    await this.assertEntityInOrganization(parsedType, organizationId, contextId);
    const candidate = buildUploadContextCandidate({
      entityType: parsedType,
      entityId: contextId,
      sourceSurface,
      providedByUserId: params.providedByUserId,
      providedAt: params.providedAt,
    });

    const vehicleId = parsedType === 'VEHICLE' ? contextId : null;
    return this.buildTarget({ organizationId, vehicleId, candidate });
  }

  async loadEntitySnapshot(
    entityType: DocumentUploadContextInputEntityType,
    entityId: string,
    organizationId: string,
  ): Promise<DocumentUploadContextEntitySnapshot | null> {
    switch (entityType) {
      case 'VEHICLE': {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: entityId, organizationId },
          select: { licensePlate: true, vin: true },
        });
        return vehicle
          ? { licensePlate: vehicle.licensePlate, vin: vehicle.vin }
          : null;
      }
      case 'BOOKING': {
        const booking = await this.prisma.booking.findFirst({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        return booking ? { bookingReference: booking.id } : null;
      }
      case 'CUSTOMER':
      case 'DRIVER': {
        const customer = await this.prisma.customer.findFirst({
          where: { id: entityId, organizationId },
          select: { firstName: true, lastName: true },
        });
        return customer
          ? { customerName: `${customer.firstName} ${customer.lastName}`.trim() }
          : null;
      }
      case 'FINE': {
        const fine = await this.prisma.fine.findFirst({
          where: { id: entityId, organizationId },
          select: { fineNumber: true },
        });
        return fine ? { reportNumber: fine.fineNumber } : null;
      }
      case 'INVOICE': {
        const invoice = await this.prisma.orgInvoice.findFirst({
          where: { id: entityId, organizationId },
          select: { invoiceNumberDisplay: true },
        });
        return invoice ? { invoiceNumber: invoice.invoiceNumberDisplay } : null;
      }
      default:
        return null;
    }
  }

  private buildTarget(input: {
    organizationId: string;
    vehicleId: string | null;
    candidate: DocumentUploadContextCandidate | null;
  }): ResolvedDocumentUploadTarget {
    const searchScope = buildUploadContextSearchScope(input.candidate);
    return {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      contextCandidate: input.candidate,
      searchScope,
      uploadContextType: input.candidate?.entityType ?? null,
      uploadContextId: input.candidate?.entityId ?? null,
    };
  }

  async assertEntityInOrganization(
    entityType: DocumentUploadContextInputEntityType,
    organizationId: string,
    entityId: string,
  ): Promise<void> {
    let found = false;
    switch (entityType) {
      case 'VEHICLE':
        found = Boolean(
          await this.prisma.vehicle.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          }),
        );
        break;
      case 'BOOKING':
        found = Boolean(
          await this.prisma.booking.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          }),
        );
        break;
      case 'CUSTOMER':
      case 'DRIVER':
        found = Boolean(
          await this.prisma.customer.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          }),
        );
        break;
      case 'FINE':
        found = Boolean(
          await this.prisma.fine.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          }),
        );
        break;
      case 'INVOICE':
        found = Boolean(
          await this.prisma.orgInvoice.findFirst({
            where: { id: entityId, organizationId },
            select: { id: true },
          }),
        );
        break;
      default:
        break;
    }
    if (!found) {
      throw new NotFoundException(`${entityType} not found`);
    }
  }

  async assertVehicleInOrganization(organizationId: string, vehicleId: string): Promise<void> {
    await this.assertEntityInOrganization('VEHICLE', organizationId, vehicleId);
  }
}
