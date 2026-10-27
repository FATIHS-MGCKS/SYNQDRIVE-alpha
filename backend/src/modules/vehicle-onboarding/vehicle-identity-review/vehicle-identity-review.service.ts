import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { buildVehicleSystemBaseline } from './vehicle-identity-baseline.util';
import {
  buildVehicleIdentityReviewSnapshot,
  parseZb1FromExtractionExtractedData,
} from './vehicle-identity-reconcile.util';
import { validateVehicleIdentityFieldConfirmations } from './vehicle-identity-confirm.util';
import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityManualDraftInput,
} from './vehicle-identity-review.types';

@Injectable()
export class VehicleIdentityReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get p2Enabled(): boolean {
    return this.config.get<{ enabled?: boolean }>('vehicleIdentityP2')?.enabled === true;
  }

  private get p3Enabled(): boolean {
    return this.config.get<{ enabled?: boolean }>('vehicleIdentityP3')?.enabled === true;
  }

  private get zb1UploadEnabled(): boolean {
    return (
      this.config.get<{ zb1RegistrationCertificateExtractionEnabled?: boolean }>(
        'documentExtraction',
      )?.zb1RegistrationCertificateExtractionEnabled === true
    );
  }

  private assertP2Enabled(): void {
    if (!this.p2Enabled) {
      throw new ForbiddenException({
        message: 'Vehicle identity P2 review is disabled in this environment',
        code: 'ZB1_VEHICLE_IDENTITY_P2_DISABLED',
      });
    }
  }

  private async loadVehicle(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        fuelType: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private async buildSystemBaseline(
    orgId: string,
    vehicleId: string,
    vehicle: {
      vin: string | null;
      make: string | null;
      model: string | null;
      fuelType: string | null;
    },
  ) {
    const [latestState, motionReference, dimoLink] = await Promise.all([
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { dimoTokenId: true },
      }),
      this.prisma.vehicleMotionPhysicsReference.findFirst({
        where: {
          organizationId: orgId,
          vehicleId,
          isActive: true,
          supersededById: null,
        },
        select: {
          systemMotorPowerKw: true,
          source: true,
          evidenceTier: true,
        },
      }),
      this.prisma.vehicleDataSourceLink.findFirst({
        where: {
          vehicleId,
          isActive: true,
          provider: 'DIMO',
        },
        select: { id: true },
      }),
    ]);

    const hasDimoProviderLink =
      latestState?.dimoTokenId != null || dimoLink != null;

    return buildVehicleSystemBaseline({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      fuelType: vehicle.fuelType ? String(vehicle.fuelType) : null,
      hasDimoProviderLink,
      motionReference: motionReference
        ? {
            systemMotorPowerKw: motionReference.systemMotorPowerKw,
            source: motionReference.source,
            evidenceTier: motionReference.evidenceTier,
          }
        : null,
    });
  }

  async getReviewSnapshot(
    orgId: string,
    vehicleId: string,
    query: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      vinMismatchAcknowledged?: boolean;
    },
  ) {
    this.assertP2Enabled();
    const vehicle = await this.loadVehicle(orgId, vehicleId);
    const system = await this.buildSystemBaseline(orgId, vehicleId, vehicle);
    let zb1 = null;
    let extractionId: string | null = null;

    if (query.documentExtractionId) {
      const extraction = await this.prisma.vehicleDocumentExtraction.findFirst({
        where: {
          id: query.documentExtractionId,
          vehicleId,
          organizationId: orgId,
        },
        select: {
          id: true,
          extractedData: true,
          requestedDocumentType: true,
          detectedDocumentType: true,
        },
      });
      if (!extraction) {
        throw new NotFoundException('Document extraction not found for this vehicle');
      }
      const effectiveType =
        extraction.detectedDocumentType ?? extraction.requestedDocumentType ?? null;
      if (effectiveType !== 'REGISTRATION_CERTIFICATE') {
        throw new BadRequestException('Extraction is not a REGISTRATION_CERTIFICATE document');
      }
      extractionId = extraction.id;
      zb1 = parseZb1FromExtractionExtractedData(
        extraction.extractedData as Record<string, unknown>,
      );
    }

    return buildVehicleIdentityReviewSnapshot({
      system,
      zb1,
      manual: query.manual ?? null,
      documentExtractionId: extractionId,
      vinMismatchAcknowledged: query.vinMismatchAcknowledged,
      capabilities: {
        p2Enabled: this.p2Enabled,
        p3Enabled: this.p3Enabled,
        zb1UploadEnabled: this.zb1UploadEnabled,
        documentStoragePolicyAcknowledged: false,
      },
    });
  }

  async validateConfirmations(
    orgId: string,
    vehicleId: string,
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
    },
  ) {
    this.assertP2Enabled();
    const snapshot = await this.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId: body.documentExtractionId,
      manual: body.manual ?? null,
      vinMismatchAcknowledged: body.vinMismatchAcknowledged,
    });
    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: body.confirmations ?? [],
      vinMismatchAcknowledged: body.vinMismatchAcknowledged === true,
      acceptP2AsSystemPower: body.acceptP2AsSystemPower === true,
    });
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Vehicle identity confirmation validation failed',
        code: 'VEHICLE_IDENTITY_CONFIRM_VALIDATION_FAILED',
        errors: result.errors,
      });
    }
    return {
      ok: true,
      confirmedFieldCodes: result.confirmedFieldCodes,
      persisted: false,
      note: 'P2 review-only: no vehicle or motion-physics fields were written.',
    };
  }
}
