export type OperatorProcess =
  | 'PICKUP'
  | 'RETURN'
  | 'DAMAGE'
  | 'DOCUMENT_CHECK'
  | 'TASK'
  | 'BOOKING_FORM';

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

export interface OperatorBookingContextDto {
  process: OperatorProcess;
  bookingId: string;
  bookingNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  customer: {
    customerId: string;
    customerRef: string;
    displayName: string | null;
    identityStatus: string | null;
    licenseStatus: string | null;
    emailMasked: string | null;
    phoneMasked: string | null;
  };
  vehicle: {
    vehicleId: string;
    displayName: string;
    licensePlate: string;
    odometerKm: number | null;
    fuelPercent: number | null;
  };
  pickupStation: { stationId: string | null; name: string | null };
  returnStation: { stationId: string | null; name: string | null };
  canStartPickup: boolean;
  canStartReturn: boolean;
  documentsAcknowledgedRequired: boolean;
  bookingDocumentSlots: Array<{
    documentType: string;
    status: string;
    available: boolean;
    documentId: string | null;
    label: string | null;
  }>;
  customerDocumentSlots: Array<{
    id: string;
    type: string;
    status: string;
    uploadedAt: string;
    expiresAt: string | null;
    canViewFull: boolean;
  }>;
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
