import type { BookingAuditDto, BookingAuditEntryDto } from './booking-audit.dto';
import type { BookingFinanceDto, BookingPaymentSummaryDto } from './booking-finance.dto';
import type { BookingHandoverDto } from './booking-handover.dto';

export type BookingDetailDocumentSlotDto = {
  documentType: string;
  status: 'missing' | 'required' | 'generated' | 'signed' | 'void';
  required: boolean;
  available: boolean;
  generatedAt: string | null;
  signedAt: string | null;
  documentId: string | null;
  missingReason: string | null;
};

export type BookingStationContextDto = {
  stationId: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  openingHours: unknown;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  status: string;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type BookingDetailCustomerDto = {
  customerId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  customerStatus: string | null;
  identityStatus: string | null;
  licenseStatus: string | null;
  riskLevel: string | null;
  openInvoiceCount: number;
  openFineCount: number;
  noShowCount: number;
};

export type BookingDetailVehicleDto = {
  vehicleId: string;
  displayName: string;
  licensePlate: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicleStatus: string | null;
  rentalBlocked: boolean | null;
  blockingReasons: string[];
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
};

export type BookingTaskSummaryItemDto = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
};

export interface BookingDetailDto {
  core: {
    bookingId: string;
    bookingNumber: string;
    status: string;
    statusEnum: string;
    startDate: string;
    endDate: string;
    pickupStationId: string | null;
    returnStationId: string | null;
    pickupStationName: string | null;
    returnStationName: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    completedAt: string | null;
    kmIncluded: number | null;
    kmDriven: number | null;
    insuranceOptions: string[];
    extras: unknown[];
    currency: string;
    isOneWayRental: boolean;
    pickupAddressOverride: string | null;
    returnAddressOverride: string | null;
  };
  stations: {
    pickup: BookingStationContextDto | null;
    return: BookingStationContextDto | null;
    actualPickup: BookingStationContextDto | null;
    actualReturn: BookingStationContextDto | null;
    isOneWayRental: boolean;
    hasPickupDeviation: boolean;
    hasReturnDeviation: boolean;
  };
  customer: BookingDetailCustomerDto | null;
  vehicle: BookingDetailVehicleDto;
  finance: BookingFinanceDto | null;
  documents: {
    bundleStatus: string | null;
    completenessStatus: string | null;
    legalTermsAttached: boolean;
    legalWithdrawalAttached: boolean;
    legalPrivacyAttached: boolean;
    legalMissing: string[];
    warnings: string[];
    slots: BookingDetailDocumentSlotDto[];
  };
  handover: BookingHandoverDto;
  tasks: {
    openCount: number;
    overdueCount: number;
    completedCount: number;
    nextDueAt: string | null;
    items: BookingTaskSummaryItemDto[];
  };
  health: {
    rentalBlocked: boolean | null;
    blockingReasons: string[];
    overallState: string | null;
    criticalWarnings: string[];
    warningWarnings: string[];
  };
  usage: {
    drivingStressScore: number | null;
    stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
    drivingEventsCount: number | null;
    abuseDetectionCount: number | null;
    misuseCaseCount: number;
    hasAnalysis: boolean;
  };
  eligibility: {
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
    blockingReasons: string[];
    warnings: string[];
    requiredActions: string[];
  } | null;
  rentalEligibility: {
    status: string;
    allowed: boolean;
    stage: string;
    blockingReasons: string[];
    warnings: string[];
    missingFields: string[];
    engineVersion: string;
    evaluatedAt: string;
    rentalRulesStatus: string | null;
  } | null;
  audit: BookingAuditDto;
  /** @deprecated Use `audit.items` — kept for existing UI consumers. */
  activity: BookingAuditEntryDto[];
  payments: BookingPaymentSummaryDto | import('./booking-payment-card-section.dto').BookingPaymentCardSectionDto | null;
}
