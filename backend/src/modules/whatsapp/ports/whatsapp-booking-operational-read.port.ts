/**
 * Core-owned port — WhatsApp Business reads booking operational facts
 * without importing Rental BookingsService.
 */
export const WHATSAPP_BOOKING_OPERATIONAL_READ_PORT = Symbol(
  'WHATSAPP_BOOKING_OPERATIONAL_READ_PORT',
);

export type WhatsAppBookingStationRead = {
  stationId: string;
  name: string;
  address: string | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
};

export type WhatsAppBookingCoreRead = {
  bookingId: string;
  bookingNumber: string;
  status: string;
  statusEnum: string;
  startDate: string;
  endDate: string;
  pickupStationName: string | null;
  returnStationName: string | null;
};

export type WhatsAppBookingVehicleRead = {
  vehicleId: string;
  displayName: string;
};

export type WhatsAppBookingFinanceRead = {
  depositStatus: string | null;
  paymentStatus: string | null;
  depositAmountCents: number | null;
  openAmountCents: number | null;
};

/** Contact fields required for proactive WhatsApp reminders only. */
export type WhatsAppBookingCustomerContactRead = {
  customerId: string;
  fullName: string;
  phone: string | null;
  openInvoiceCount: number;
};

export type WhatsAppBookingDocumentSlotRead = {
  documentType: string;
  status: string;
};

export type WhatsAppBookingDocumentsRead = {
  bundleStatus: string | null;
  legalMissing: string[];
  warnings: string[];
  slots: WhatsAppBookingDocumentSlotRead[];
};

export type WhatsAppBookingTaskItemRead = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

export type WhatsAppBookingTasksRead = {
  openCount: number;
  overdueCount: number;
  items: WhatsAppBookingTaskItemRead[];
};

export type WhatsAppBookingHandoverSideRead = {
  completedAt: string;
};

export type WhatsAppBookingHandoverRead = {
  pickup: WhatsAppBookingHandoverSideRead | null;
  return: WhatsAppBookingHandoverSideRead | null;
};

export type WhatsAppBookingOperationalRead = {
  core: WhatsAppBookingCoreRead;
  vehicle: WhatsAppBookingVehicleRead | null;
  stations: {
    pickup: WhatsAppBookingStationRead | null;
    return: WhatsAppBookingStationRead | null;
  };
  finance: WhatsAppBookingFinanceRead;
  customer: WhatsAppBookingCustomerContactRead;
  documents: WhatsAppBookingDocumentsRead;
  tasks: WhatsAppBookingTasksRead;
  handover: WhatsAppBookingHandoverRead;
};

export interface WhatsAppBookingOperationalReadPort {
  getOperationalRead(
    organizationId: string,
    bookingId: string,
  ): Promise<WhatsAppBookingOperationalRead | null>;
}