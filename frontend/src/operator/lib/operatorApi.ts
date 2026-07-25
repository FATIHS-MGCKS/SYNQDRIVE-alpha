import type {
  OperatorBookingContextDto,
  OperatorCustomerSearchItemDto,
  OperatorDocumentPreviewGrantDto,
  OperatorProcess,
} from './operatorData.types';
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

export const operatorApi = {
  getBookingContext(orgId: string, bookingId: string, process: OperatorProcess) {
    return operatorSensitiveJson<OperatorBookingContextDto>(
      `/organizations/${orgId}/operator/bookings/${bookingId}/context?process=${encodeURIComponent(process)}`,
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
};
