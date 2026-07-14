export type OrgInvoiceType =
  | 'OUTGOING_BOOKING'
  | 'OUTGOING_MANUAL'
  | 'OUTGOING_FINAL'
  | 'INCOMING_VENDOR'
  | 'INCOMING_UPLOADED';

export type OrgInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'SENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'CREDITED'
  | 'VOID'
  | 'UPLOADED'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'BOOKED'
  | 'REJECTED';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceNetCents?: number;
  unitPriceCents?: number;
  taxRate?: number;
  netCents?: number;
  taxCents?: number;
  grossCents?: number;
  totalCents?: number;
}

export interface InvoicePayment {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
  reference?: string | null;
  note?: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: number | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumberDisplay: string;
  type: OrgInvoiceType | string;
  customerId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  title: string;
  description: string;
  lineItems: InvoiceLineItem[] | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  currency: string;
  invoiceDate: string;
  dueDate: string | null;
  status: OrgInvoiceStatus | string;
  templateId: string | null;
  imageUrl: string | null;
  extractedData: unknown;
  documentExtractionId?: string | null;
  generatedDocumentId?: string | null;
  notes: string;
  paidAt: string | null;
  issuedAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  tasks?: { id: string; title: string; status: string }[];
  payments?: InvoicePayment[];
}

export interface InvoiceStats {
  total: number;
  outgoing: number;
  incoming: number;
  paid: number;
  unpaid: number;
  overdue?: number;
  draftCount?: number;
  reviewCount?: number;
  totalRevenueCents: number;
  finalInvoiceRevenueCents?: number;
  paidRevenueCents?: number;
  totalExpensesCents: number;
}

/** Typed read model from GET .../invoices/:id/detail (backend InvoiceDetailDto). */
export interface InvoiceDetailRelationSummary {
  id: string;
  availability: string;
  displayName: string;
  navigation?: { entityId: string; routeKey: string; label: string } | null;
}

export interface InvoiceDetailBookingSummary extends InvoiceDetailRelationSummary {
  bookingNumber: string;
  reference: string;
  startDate: string;
  endDate: string;
  status: string;
  pickupStation?: { id: string; name: string; code: string | null } | null;
  returnStation?: { id: string; name: string; code: string | null } | null;
}

export interface InvoiceDetail extends Invoice {
  activeDocumentId?: string | null;
  documentCacheMismatch?: boolean;
  documents?: unknown[];
  relations?: {
    customerDiverges: boolean;
    invoiceCustomerId: string | null;
    bookingCustomerId: string | null;
    message: string | null;
  };
  customer?: (InvoiceDetailRelationSummary & {
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    customerNumber?: string;
    email?: string | null;
  }) | null;
  booking?: InvoiceDetailBookingSummary | null;
  vehicle?: (InvoiceDetailRelationSummary & {
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    modelYear?: number | null;
    fleetName?: string | null;
  }) | null;
  capabilities?: {
    canEdit: boolean;
    canIssue: boolean;
    canSend: boolean;
    canCancel: boolean;
    canRecordPayment: boolean;
    documentGenerationStatus: string;
    sendAvailability: string;
    paymentAvailability: string;
    blockingReasons: Record<string, string[]>;
  };
  provenance?: {
    classification: 'RECORDED' | 'LEGACY';
    creationChannel: string;
    sourceType: string;
    sourceId: string | null;
    createdByUserId: string | null;
    createdByUserDisplayName?: string | null;
    triggeredByType: string;
    automationId?: string | null;
    correlationId?: string | null;
    createdAt: string;
    kind: string;
    label: string;
    documentExtractionId?: string | null;
    bookingId?: string | null;
  };
  timeline?: { id: string; action: string; description: string; createdAt: string }[];
  outboundEmails?: unknown[];
}
