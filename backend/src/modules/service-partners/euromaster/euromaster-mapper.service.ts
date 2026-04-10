import { Injectable } from '@nestjs/common';
import { ServiceCaseType } from '@prisma/client';
import {
  EuromasterAppointmentInput,
  EuromasterAppointmentResult,
  EuromasterBranchResult,
  EmAppointmentCreateRequest,
  EmAppointmentCreateResponse,
  EmBranch,
} from './euromaster.types';
import { EuromasterMappingError } from './euromaster.errors';

const SERVICE_TYPE_MAP: Record<string, string> = {
  TIRE_SERVICE: 'TIRE_CHANGE',
  MAINTENANCE: 'GENERAL_MAINTENANCE',
  INSPECTION: 'VEHICLE_INSPECTION',
  ASSISTANCE: 'ROADSIDE',
  BREAKDOWN: 'EMERGENCY',
  OTHER: 'OTHER',
};

@Injectable()
export class EuromasterMapperService {

  /**
   * Map SynqDrive appointment input → Euromaster API request payload.
   */
  toApiRequest(
    input: EuromasterAppointmentInput,
    customerId: string,
    companyName: string,
  ): EmAppointmentCreateRequest {
    if (!input.vehiclePlate) {
      throw new EuromasterMappingError('Vehicle plate is required for Euromaster requests');
    }

    return {
      customer: {
        customerId,
        companyName,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
      },
      vehicle: {
        licensePlate: input.vehiclePlate,
        vin: input.vehicleVin,
        make: input.vehicleMake,
        model: input.vehicleModel,
        mileageKm: input.mileageKm,
      },
      service: {
        type: SERVICE_TYPE_MAP[input.serviceType] ?? 'OTHER',
        description: input.serviceDescription,
        preferredDate: input.preferredDate,
        preferredTimeSlot: input.preferredTimeSlot,
        urgency: input.urgency ?? 'normal',
      },
      branch: (input.branchId || input.postalCode || input.latitude != null) ? {
        branchId: input.branchId,
        postalCode: input.postalCode,
        latitude: input.latitude,
        longitude: input.longitude,
      } : undefined,
      notes: input.notes,
      externalReference: `SQ-${input.organizationId.slice(0, 8)}-${Date.now()}`,
    };
  }

  /**
   * Map Euromaster API response → normalized SynqDrive domain result.
   */
  fromApiResponse(response: EmAppointmentCreateResponse): EuromasterAppointmentResult {
    const statusMap: Record<string, EuromasterAppointmentResult['status']> = {
      CONFIRMED: 'confirmed',
      PENDING: 'pending',
      REJECTED: 'rejected',
      REQUIRES_CALLBACK: 'requires_callback',
    };

    return {
      externalReference: response.appointmentId,
      status: statusMap[response.status] ?? 'pending',
      scheduledAt: response.scheduledDate,
      branchName: response.branch?.name,
      branchAddress: response.branch?.address,
      estimatedDurationMinutes: response.estimatedDurationMinutes,
      estimatedCostEur: response.estimatedCostEur,
      confirmationNumber: response.confirmationNumber,
      message: response.message,
      mode: 'live',
    };
  }

  /**
   * Create a manual-mode result when live API is not enabled.
   * The case is persisted locally and can be forwarded manually.
   */
  createManualResult(input: EuromasterAppointmentInput): EuromasterAppointmentResult {
    return {
      externalReference: `EM-MAN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      status: 'manual_pending',
      scheduledAt: input.preferredDate,
      message: 'Service case created in manual mode — forward to Euromaster when ready',
      mode: 'manual',
    };
  }

  /**
   * Map Euromaster branch → normalized SynqDrive branch result.
   */
  fromBranch(b: EmBranch): EuromasterBranchResult {
    return {
      branchId: b.branchId,
      name: b.name,
      address: b.address,
      city: b.city,
      postalCode: b.postalCode,
      latitude: b.latitude,
      longitude: b.longitude,
      phone: b.phone,
      services: b.services,
      distanceKm: b.distanceKm,
    };
  }

  /**
   * Build service case metadata from the integration result.
   * Persisted on the PartnerServiceCase.metadata field.
   */
  buildCaseMetadata(
    input: EuromasterAppointmentInput,
    result: EuromasterAppointmentResult,
  ): Record<string, unknown> {
    return {
      externalReference: result.externalReference,
      confirmationNumber: result.confirmationNumber,
      mode: result.mode,
      vehiclePlate: input.vehiclePlate,
      vehicleVin: input.vehicleVin,
      mileageKm: input.mileageKm,
      branchName: result.branchName,
      estimatedCostEur: result.estimatedCostEur,
      estimatedDurationMinutes: result.estimatedDurationMinutes,
    };
  }

  mapServiceTypeToTitle(serviceType: ServiceCaseType): string {
    const labels: Record<string, string> = {
      TIRE_SERVICE: 'Tire Service',
      MAINTENANCE: 'Maintenance',
      INSPECTION: 'Inspection',
      ASSISTANCE: 'Assistance',
      BREAKDOWN: 'Breakdown',
      OTHER: 'Service',
    };
    return `Euromaster: ${labels[serviceType] ?? serviceType}`;
  }
}
