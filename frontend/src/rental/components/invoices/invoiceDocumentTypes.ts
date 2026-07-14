export type InvoiceDocumentPanelState = 'ACTIVE' | 'EMPTY' | 'GENERATING' | 'FAILED';

export type InvoiceDocumentCapability = {
  allowed: boolean;
  reason: string | null;
};

export type InvoiceDocumentVersion = {
  id: string;
  fileName: string;
  documentType: string;
  documentTypeLabel: string;
  version: number;
  isActive: boolean;
  status: string;
  statusLabel: string;
  createdAt: string;
  createdByName: string | null;
  sizeBytes: number | null;
  sizeLabel: string | null;
  capabilities: {
    preview: InvoiceDocumentCapability;
    download: InvoiceDocumentCapability;
  };
};

export type InvoiceDeliveryHistoryItem = {
  id: string;
  recipient: string;
  channelLabel: string;
  documentVersionLabel: string;
  sentAt: string | null;
  createdAt: string;
  triggeredByName: string | null;
  status: string;
  statusLabel: string;
  errorMessage: string | null;
  capabilities: {
    retry: InvoiceDocumentCapability;
  };
};

export type InvoiceDocumentsPanel = {
  panelState: InvoiceDocumentPanelState;
  activeDocument: InvoiceDocumentVersion | null;
  versions: InvoiceDocumentVersion[];
  generation: {
    status: 'idle' | 'processing' | 'failed';
    lastAttemptAt: string | null;
    errorMessage: string | null;
  };
  capabilities: {
    preview: InvoiceDocumentCapability;
    download: InvoiceDocumentCapability;
    sendEmail: InvoiceDocumentCapability;
    generate: InvoiceDocumentCapability;
    regenerate: InvoiceDocumentCapability;
    retry: InvoiceDocumentCapability;
  };
  deliveryHistory: InvoiceDeliveryHistoryItem[];
  hasIncomingAttachment: boolean;
};

export type SendInvoiceEmailPayload = {
  toEmail: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  ccEmails?: string[];
  bccEmails?: string[];
  documentId?: string;
};
