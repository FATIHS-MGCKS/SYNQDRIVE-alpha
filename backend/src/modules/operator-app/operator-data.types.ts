export type OperatorProcess =
  | 'PICKUP'
  | 'RETURN'
  | 'DAMAGE'
  | 'DOCUMENT_CHECK'
  | 'TASK'
  | 'BOOKING_FORM';

export interface OperatorMinCustomerDto {
  customerId: string;
  customerRef: string;
  displayName: string | null;
  identityStatus: string | null;
  licenseStatus: string | null;
  /** Masked contact — only on BOOKING_FORM when needed for disambiguation */
  emailMasked: string | null;
  phoneMasked: string | null;
}

export interface OperatorMinVehicleDto {
  vehicleId: string;
  displayName: string;
  licensePlate: string;
  odometerKm: number | null;
  fuelPercent: number | null;
}

export interface OperatorMinStationDto {
  stationId: string | null;
  name: string | null;
}

export interface OperatorDocumentSlotStatusDto {
  documentType: string;
  status: string;
  available: boolean;
  documentId: string | null;
  /** Omitted for workers without view_full */
  label: string | null;
}

export interface OperatorCustomerDocumentStatusDto {
  id: string;
  type: string;
  status: string;
  uploadedAt: string;
  expiresAt: string | null;
  canViewFull: boolean;
}

export interface OperatorBookingContextDto {
  process: OperatorProcess;
  bookingId: string;
  bookingNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  customer: OperatorMinCustomerDto;
  vehicle: OperatorMinVehicleDto;
  pickupStation: OperatorMinStationDto;
  returnStation: OperatorMinStationDto;
  canStartPickup: boolean;
  canStartReturn: boolean;
  documentsAcknowledgedRequired: boolean;
  bookingDocumentSlots: OperatorDocumentSlotStatusDto[];
  customerDocumentSlots: OperatorCustomerDocumentStatusDto[];
  health: OperatorBookingHealthDto;
  actions: OperatorBookingActionsDto;
  handover: OperatorHandoverContextDto;
}

export interface OperatorCustomerSearchItemDto {
  customerId: string;
  customerRef: string;
  displayName: string | null;
  emailMasked: string | null;
  phoneMasked: string | null;
  identityStatus: string | null;
  licenseStatus: string | null;
}

export interface OperatorDocumentPreviewGrantDto {
  previewPath: string;
  expiresAt: string;
  audited: true;
}

export interface OperatorBookingActionGateDto {
  allowed: boolean;
  reason: string | null;
}

export interface OperatorBookingActionsDto {
  edit: OperatorBookingActionGateDto;
  cancel: OperatorBookingActionGateDto;
  markNoShow: OperatorBookingActionGateDto;
}

export interface OperatorBookingHealthDto {
  rentalBlocked: boolean;
  blockingReasons: string[];
}

export interface OperatorHandoverContextDto {
  statusEnum: string;
  kmIncluded: number | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  pickupOdometerKm: number | null;
  hasPickupProtocol: boolean;
  hasReturnProtocol: boolean;
}
