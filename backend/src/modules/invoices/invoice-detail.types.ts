import type { InvoiceDocumentSummaryDto } from './invoice-document-read.types';
import type { InvoiceProvenanceDto } from './invoice-provenance.util';

export type InvoiceDirection = 'OUTGOING' | 'INCOMING';

export type InvoiceDocumentGenerationAggregateStatus =
  | 'NOT_STARTED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PARTIAL';

export interface InvoiceDetailInvoiceDto {
  id: string;
  invoiceNumber: string;
  legacyInvoiceNumber: number | null;
  sequenceYear: number | null;
  sequenceNumber: number | null;
  direction: InvoiceDirection;
  type: string;
  status: string;
  title: string;
  description: string;
  currency: string;
  invoiceDate: string;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  voidedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
  generatedDocumentId: string | null;
  activeDocumentId: string | null;
  documentCacheMismatch: boolean;
  documentExtractionId: string | null;
  imageUrl: string | null;
}

export interface InvoiceDetailAmountsDto {
  subtotalNetCents: number;
  taxTotalCents: number;
  totalGrossCents: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
  creditAmountCents: number | null;
}

export type RelationAvailability = 'AVAILABLE' | 'ARCHIVED' | 'DELETED' | 'MISSING';

export interface InvoiceEntityNavigationDto {
  entityId: string;
  routeKey: 'customer-detail' | 'bookings' | 'fleet';
  label: string;
}

export interface InvoiceRelationSnapshotsDto {
  customerDisplayName?: string | null;
  companyName?: string | null;
  vehicleDisplayName?: string | null;
  licensePlate?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}

export interface InvoiceCustomerSummaryDto {
  id: string;
  availability: RelationAvailability;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  customerNumber: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  navigation: InvoiceEntityNavigationDto | null;
}

export interface InvoiceBookingStationSummaryDto {
  id: string;
  name: string;
  code: string | null;
}

export interface InvoiceBookingSummaryDto {
  id: string;
  availability: RelationAvailability;
  bookingNumber: string;
  reference: string;
  startDate: string;
  endDate: string;
  status: string;
  pickupStation: InvoiceBookingStationSummaryDto | null;
  returnStation: InvoiceBookingStationSummaryDto | null;
  bookingCustomerId: string | null;
  navigation: InvoiceEntityNavigationDto | null;
  unavailableLabel: string | null;
}

export interface InvoiceVehicleSummaryDto {
  id: string;
  availability: RelationAvailability;
  displayName: string;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  licensePlate: string | null;
  fleetName: string | null;
  vin: string | null;
  status: string | null;
  navigation: InvoiceEntityNavigationDto | null;
  unavailableLabel: string | null;
}

export interface InvoiceRelationDivergenceDto {
  customerDiverges: boolean;
  invoiceCustomerId: string | null;
  bookingCustomerId: string | null;
  message: string | null;
}

export interface InvoiceSupplierSummaryDto {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface InvoiceDetailLineItemDto {
  description: string;
  quantity: number;
  unitPriceNetCents: number;
  taxRate: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
}

export interface InvoiceDetailPaymentDto {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
}

export interface InvoiceOutboundEmailSummaryDto {
  id: string;
  status: string;
  toEmail: string;
  subject: string;
  sentAt: string | null;
  createdAt: string;
  attachmentDocumentIds: string[];
}

export interface InvoiceLinkedTaskDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  dueAt: string | null;
}

export type {
  InvoiceProvenanceClassification,
  InvoiceProvenanceChannelValue,
  InvoiceProvenanceTriggeredByValue,
  InvoiceProvenanceSourceTypeValue,
  InvoiceProvenanceLegacyKind,
  InvoiceProvenanceDto,
  InvoiceProvenanceWriteInput,
} from './invoice-provenance.util';

export interface InvoiceTimelineEventDto {
  id: string;
  action: string;
  description: string;
  createdAt: string;
}

export interface InvoiceDetailCapabilitiesDto {
  canEdit: boolean;
  canIssue: boolean;
  canSend: boolean;
  canCancel: boolean;
  canRecordPayment: boolean;
  documentGenerationStatus: InvoiceDocumentGenerationAggregateStatus;
  sendAvailability: 'AVAILABLE' | 'UNAVAILABLE';
  paymentAvailability: 'AVAILABLE' | 'UNAVAILABLE' | 'SETTLED';
  blockingReasons: {
    edit: string[];
    issue: string[];
    send: string[];
    cancel: string[];
    recordPayment: string[];
  };
}

export interface InvoiceDetailDto {
  invoice: InvoiceDetailInvoiceDto;
  amounts: InvoiceDetailAmountsDto;
  customer: InvoiceCustomerSummaryDto | null;
  supplier: InvoiceSupplierSummaryDto | null;
  booking: InvoiceBookingSummaryDto | null;
  vehicle: InvoiceVehicleSummaryDto | null;
  relations: InvoiceRelationDivergenceDto;
  lineItems: InvoiceDetailLineItemDto[];
  payments: InvoiceDetailPaymentDto[];
  documents: InvoiceDocumentSummaryDto[];
  outboundEmails: InvoiceOutboundEmailSummaryDto[];
  linkedTasks: InvoiceLinkedTaskDto[];
  notes: string;
  provenance: InvoiceProvenanceDto;
  timeline: InvoiceTimelineEventDto[];
  capabilities: InvoiceDetailCapabilitiesDto;
}
