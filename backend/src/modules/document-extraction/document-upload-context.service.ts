import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENT_UPLOAD_CONTEXT_TYPE_VALUES,
  type DocumentUploadContextType,
  type ResolvedDocumentUploadTarget,
} from './document-upload-context.types';

@Injectable()
export class DocumentUploadContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUploadTarget(params: {
    organizationId: string;
    vehicleId?: string | null;
    optionalContextType?: string | null;
    optionalContextId?: string | null;
  }): Promise<ResolvedDocumentUploadTarget> {
    const organizationId = params.organizationId;

    if (params.vehicleId) {
      await this.assertVehicleInOrganization(organizationId, params.vehicleId);
      return {
        organizationId,
        vehicleId: params.vehicleId,
        uploadContextType: 'VEHICLE',
        uploadContextId: params.vehicleId,
      };
    }

    const contextType = params.optionalContextType?.trim().toUpperCase() || null;
    const contextId = params.optionalContextId?.trim() || null;

    if (!contextType && !contextId) {
      return {
        organizationId,
        vehicleId: null,
        uploadContextType: null,
        uploadContextId: null,
      };
    }

    if (!contextType || !contextId) {
      throw new BadRequestException({
        message: 'optionalContextType and optionalContextId must be provided together',
        errorCode: 'DOCUMENT_UPLOAD_CONTEXT_INCOMPLETE',
      });
    }

    if (!DOCUMENT_UPLOAD_CONTEXT_TYPE_VALUES.includes(contextType as DocumentUploadContextType)) {
      throw new BadRequestException({
        message: `Unsupported optionalContextType: ${contextType}`,
        errorCode: 'DOCUMENT_UPLOAD_CONTEXT_UNSUPPORTED',
      });
    }

    if (contextType === 'VEHICLE') {
      await this.assertVehicleInOrganization(organizationId, contextId);
      return {
        organizationId,
        vehicleId: contextId,
        uploadContextType: 'VEHICLE',
        uploadContextId: contextId,
      };
    }

    throw new BadRequestException({
      message: `Unsupported optionalContextType: ${contextType}`,
      errorCode: 'DOCUMENT_UPLOAD_CONTEXT_UNSUPPORTED',
    });
  }

  async assertVehicleInOrganization(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }
}
