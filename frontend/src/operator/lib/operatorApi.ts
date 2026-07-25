import type {
  OperatorBookingContextDto,
  OperatorCustomerSearchItemDto,
  OperatorDamageCaptureResultDto,
  OperatorDamageCaptureSource,
  OperatorDamageListItemDto,
  OperatorDocumentPreviewGrantDto,
  OperatorHandoverSessionResumeDto,
  OperatorProcess,
  OperatorTireMeasurementCaptureResultDto,
  OperatorVehicleResumeDto,
} from './operatorData.types';
import type { DamageResponse, DamageSeverity, DamageSource } from '../../rental/lib/damage.types';
import type { HandoverDialogBookingInfo, HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import { openOperatorPreviewPath, operatorSensitiveJson } from './operatorSensitiveFetch';

export function mapOperatorContextToHandoverBooking(
  ctx: OperatorBookingContextDto,
  kind: HandoverDialogKind,
): HandoverDialogBookingInfo {
  return {
    id: ctx.bookingId,
    vehicleId: ctx.vehicle.vehicleId,
    customerId: ctx.customer.customerId,
    vehicleName: ctx.vehicle.displayName,
    plate: ctx.vehicle.licensePlate,
    customerName: ctx.customer.displayName ?? '',
    startDate: ctx.startDate,
    endDate: ctx.endDate,
    pickupLocation: ctx.pickupStation.name ?? '',
    returnLocation: ctx.returnStation.name ?? '',
    pickupStationId: ctx.handover.pickupStationId,
    returnStationId: ctx.handover.returnStationId,
    handoverInstructions: ctx.handover.handoverInstructions,
    returnInstructions: ctx.handover.returnInstructions,
    status: ctx.status,
    includedKm: ctx.handover.kmIncluded ?? undefined,
    pickupOdometerKm: kind === 'RETURN' ? ctx.handover.pickupOdometerKm : null,
  };
}

export function operatorDamageToDamageResponse(item: OperatorDamageListItemDto): DamageResponse {
  return {
    id: item.id,
    vehicleId: item.vehicleId,
    damageType: item.damageType,
    severity: item.severity as DamageSeverity,
    status: item.status as DamageResponse['status'],
    description: item.description,
    locationView: item.locationView as DamageResponse['locationView'],
    locationX: null,
    locationY: null,
    locationLabel: item.locationLabel,
    estimatedCostCents: null,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: item.source as DamageSource,
    rentalImpact: item.rentalImpact as DamageResponse['rentalImpact'],
    evidenceStatus: item.evidenceStatus as DamageResponse['evidenceStatus'],
    liabilityStatus: item.liabilityStatus as DamageResponse['liabilityStatus'],
    liabilityNote: null,
    reportedBy: item.reportedBy,
    reportedAt: item.createdAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    repairStartedAt: null,
    repairedAt: null,
    bookingId: item.bookingId,
    customerId: item.customerId,
    handoverProtocolId: item.handoverProtocolId,
    taskId: null,
    images: [],
  };
}

export const operatorApi = {
  getBookingContext(orgId: string, bookingId: string, process: OperatorProcess) {
    return operatorSensitiveJson<OperatorBookingContextDto>(
      `/organizations/${orgId}/operator/bookings/${bookingId}/context?process=${encodeURIComponent(process)}`,
    );
  },

  getHandoverSessionResume(orgId: string, sessionId: string) {
    return operatorSensitiveJson<OperatorHandoverSessionResumeDto>(
      `/organizations/${orgId}/operator/handover-sessions/${sessionId}/resume`,
    );
  },

  getVehicleResume(orgId: string, vehicleId: string) {
    return operatorSensitiveJson<OperatorVehicleResumeDto>(
      `/organizations/${orgId}/operator/vehicles/${vehicleId}/resume`,
    );
  },

  searchCustomers(orgId: string, query: string, limit = 10) {
    const q = encodeURIComponent(query);
    return operatorSensitiveJson<OperatorCustomerSearchItemDto[]>(
      `/organizations/${orgId}/operator/customers/search?q=${q}&limit=${limit}`,
    );
  },

  getCustomerSummary(orgId: string, customerId: string) {
    return operatorSensitiveJson<OperatorCustomerSearchItemDto>(
      `/organizations/${orgId}/operator/customers/${customerId}/summary`,
    );
  },

  async grantCustomerDocumentPreview(
    orgId: string,
    customerId: string,
    documentId: string,
    process?: OperatorProcess,
  ): Promise<void> {
    const suffix = process ? `?process=${encodeURIComponent(process)}` : '';
    const grant = await operatorSensitiveJson<OperatorDocumentPreviewGrantDto>(
      `/organizations/${orgId}/operator/customers/${customerId}/documents/${documentId}/preview-grant${suffix}`,
      { method: 'POST' },
    );
    await openOperatorPreviewPath(grant.previewPath);
  },

  async grantBookingDocumentPreview(
    orgId: string,
    bookingId: string,
    documentId: string,
    process?: OperatorProcess,
  ): Promise<void> {
    const suffix = process ? `?process=${encodeURIComponent(process)}` : '';
    const grant = await operatorSensitiveJson<OperatorDocumentPreviewGrantDto>(
      `/organizations/${orgId}/operator/bookings/${bookingId}/documents/${documentId}/preview-grant${suffix}`,
      { method: 'POST' },
    );
    await openOperatorPreviewPath(grant.previewPath);
  },

  listActiveDamages(orgId: string, vehicleId: string, bookingId?: string) {
    const suffix = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : '';
    return operatorSensitiveJson<OperatorDamageListItemDto[]>(
      `/organizations/${orgId}/operator/vehicles/${vehicleId}/damages/active${suffix}`,
    );
  },

  captureDamage(
    orgId: string,
    vehicleId: string,
    body: {
      captureKey: string;
      source: OperatorDamageCaptureSource;
      damageType: string;
      severity: string;
      rentalImpact?: string;
      description?: string;
      locationView?: string;
      locationLabel?: string;
      bookingId?: string;
      customerId?: string;
      stationId?: string;
      reportedBy?: string;
      images?: { imageData: string; caption?: string }[];
    },
  ) {
    return operatorSensitiveJson<OperatorDamageCaptureResultDto>(
      `/organizations/${orgId}/operator/vehicles/${vehicleId}/damages/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  },

  captureTireMeasurement(
    orgId: string,
    vehicleId: string,
    body: {
      captureKey: string;
      confirmed: boolean;
      tireSetupId?: string;
      frontLeftMm?: number;
      frontRightMm?: number;
      rearLeftMm?: number;
      rearRightMm?: number;
      measuredAt?: string;
      odometerKm?: number;
      confirmOdometer?: boolean;
      source?: 'manual' | 'workshop' | 'ai_confirmed';
      workshopName?: string;
      note?: string;
      bookingId?: string;
      handoverSessionId?: string;
      stationId?: string;
    },
  ) {
    return operatorSensitiveJson<OperatorTireMeasurementCaptureResultDto>(
      `/organizations/${orgId}/operator/vehicles/${vehicleId}/tire-measurements/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  },
};
