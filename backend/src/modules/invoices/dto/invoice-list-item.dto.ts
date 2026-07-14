import { OrgInvoiceStatus, OrgInvoiceType, OutboundEmailStatus } from '@prisma/client';

export type InvoiceListDirection = 'outgoing' | 'incoming';

export type InvoiceListDocumentFilter = 'present' | 'missing' | 'failed';

export type InvoiceListSourceType =
  | 'BOOKING'
  | 'MANUAL'
  | 'AI_UPLOAD'
  | 'VENDOR'
  | 'LEGACY';

export interface InvoiceListItemDto {
  id: string;
  invoiceNumber: string;
  type: OrgInvoiceType;
  direction: InvoiceListDirection;
  status: OrgInvoiceStatus;
  title: string;
  customerDisplayName: string | null;
  customerId: string | null;
  supplierDisplayName: string | null;
  supplierId: string | null;
  bookingNumber: string | null;
  bookingId: string | null;
  vehicleDisplayName: string | null;
  licensePlate: string | null;
  invoiceDate: string;
  dueDate: string | null;
  totalGross: number;
  paidAmount: number;
  outstandingAmount: number;
  currency: string;
  documentStatus: string | null;
  activeDocumentId: string | null;
  lastSendStatus: OutboundEmailStatus | null;
  lastSentAt: string | null;
  isOverdue: boolean;
  sourceType: InvoiceListSourceType | null;
  creationChannel: string | null;
  openTaskCount: number;
  hasOpenTask: boolean;
}
