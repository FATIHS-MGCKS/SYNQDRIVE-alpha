import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import euromasterConfig from '@config/euromaster.config';
import { EuromasterIntegrationService } from './euromaster/euromaster-integration.service';
import {
  EuromasterAppointmentInput,
  EuromasterAppointmentResult,
  EuromasterBranchResult,
  EuromasterStatusResult,
} from './euromaster/euromaster.types';
import { ServiceCaseType } from '@prisma/client';

/**
 * Public-facing Euromaster service.
 * Thin facade over EuromasterIntegrationService for backward compatibility
 * with the existing controller and any other consumers.
 */

export interface EuromasterAppointmentRequest {
  vehiclePlate: string;
  vehicleVin?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  serviceType: ServiceCaseType;
  preferredDate?: string;
  preferredStationId?: string;
  mileageKm?: number;
  notes?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface EuromasterAppointmentResponse {
  externalReference: string;
  status: 'confirmed' | 'pending' | 'rejected' | 'requires_callback' | 'manual_pending';
  scheduledAt?: string;
  stationName?: string;
  stationAddress?: string;
  estimatedDurationMinutes?: number;
  mode: 'live' | 'manual';
}

export interface EuromasterStation {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  lat?: number;
  lng?: number;
  phone?: string;
  services: string[];
}

@Injectable()
export class EuromasterService {
  private readonly logger = new Logger(EuromasterService.name);

  constructor(
    @Inject(euromasterConfig.KEY) private readonly conf: ConfigType<typeof euromasterConfig>,
    private readonly integration: EuromasterIntegrationService,
  ) {}

  async isLiveApiEnabled(orgId: string): Promise<boolean> {
    const access = await this.integration.validateEuromasterAccessForTenant(orgId);
    return access.liveApiEnabled && access.assigned;
  }

  async requestAppointment(
    orgId: string,
    request: EuromasterAppointmentRequest,
  ): Promise<EuromasterAppointmentResponse> {
    const input: EuromasterAppointmentInput = {
      organizationId: orgId,
      vehiclePlate: request.vehiclePlate,
      vehicleVin: request.vehicleVin,
      vehicleMake: request.vehicleMake,
      vehicleModel: request.vehicleModel,
      mileageKm: request.mileageKm,
      serviceType: request.serviceType,
      preferredDate: request.preferredDate,
      contactName: request.contactName,
      contactPhone: request.contactPhone,
      contactEmail: request.contactEmail,
      notes: request.notes,
      branchId: request.preferredStationId,
    };

    const result = await this.integration.createAppointment(input);

    return {
      externalReference: result.externalReference,
      status: result.status,
      scheduledAt: result.scheduledAt,
      stationName: result.branchName,
      stationAddress: result.branchAddress,
      estimatedDurationMinutes: result.estimatedDurationMinutes,
      mode: result.mode,
    };
  }

  async findNearbyStations(
    orgId: string,
    lat: number,
    lng: number,
    radiusKm = 30,
  ): Promise<EuromasterStation[]> {
    const branches = await this.integration.searchNearbyBranches(orgId, lat, lng, undefined, radiusKm);
    return branches.map((b) => ({
      id: b.branchId,
      name: b.name,
      address: b.address,
      city: b.city,
      postalCode: b.postalCode,
      lat: b.latitude,
      lng: b.longitude,
      phone: b.phone,
      services: b.services,
    }));
  }

  async getAppointmentStatus(
    orgId: string,
    caseId: string,
  ): Promise<EuromasterStatusResult | null> {
    return this.integration.syncExternalStatus(orgId, caseId);
  }

  async validateAccess(orgId: string) {
    return this.integration.validateEuromasterAccessForTenant(orgId);
  }
}
