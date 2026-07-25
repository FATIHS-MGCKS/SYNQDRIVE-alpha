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

export type OperatorDamageCaptureSource =
  | 'pickup'
  | 'return'
  | 'operator_inspection'
  | 'manual'
  | 'ai_suggestion';

export interface OperatorDamageListItemDto {
  id: string;
  vehicleId: string;
  damageType: string;
  severity: string;
  status: string;
  source: string;
  operatorSource: OperatorDamageCaptureSource | null;
  description: string | null;
  locationView: string;
  locationLabel: string | null;
  rentalImpact: string;
  liabilityStatus: string;
  evidenceStatus: string;
  bookingId: string | null;
  customerId: string | null;
  handoverProtocolId: string | null;
  reportedBy: string | null;
  isFinal: boolean;
  isEditable: boolean;
  isKnownDamage: boolean;
  isAiSuggestion: boolean;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorDamageCaptureResultDto {
  damage: OperatorDamageListItemDto;
  deduplicated: boolean;
  idempotentReplay: boolean;
}

export interface OperatorDocumentPreviewGrantDto {
  previewPath: string;
  expiresAt: string;
  audited: true;
}
