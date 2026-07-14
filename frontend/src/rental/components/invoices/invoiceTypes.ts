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
  unit?: string | null;
  unitLabel?: string | null;
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
  createdByUserId?: string | null;
  createdByName?: string | null;
  statusKind?: 'recorded' | 'provider_confirmed';
  statusLabel?: string;
  isProviderBacked?: boolean;
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
  creditedAt?: string | null;
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
