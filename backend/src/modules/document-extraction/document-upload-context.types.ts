export const DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES = {
  VEHICLE: 'VEHICLE',
  BOOKING: 'BOOKING',
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  FINE: 'FINE',
  INVOICE: 'INVOICE',
  NONE: 'NONE',
} as const;

export type DocumentUploadContextEntityType =
  (typeof DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES)[keyof typeof DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES];

/** Entity types that may be supplied as optional upload context (excludes NONE). */
export type DocumentUploadContextInputEntityType = Exclude<
  DocumentUploadContextEntityType,
  'NONE'
>;

export const DOCUMENT_UPLOAD_CONTEXT_INPUT_ENTITY_TYPES = [
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.VEHICLE,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.BOOKING,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.CUSTOMER,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.DRIVER,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.FINE,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.INVOICE,
] as const satisfies readonly DocumentUploadContextInputEntityType[];

export const DOCUMENT_UPLOAD_CONTEXT_CONFIRMATION_STATUS = {
  CANDIDATE: 'CANDIDATE',
} as const;

export type DocumentUploadContextConfirmationStatus =
  (typeof DOCUMENT_UPLOAD_CONTEXT_CONFIRMATION_STATUS)[keyof typeof DOCUMENT_UPLOAD_CONTEXT_CONFIRMATION_STATUS];

export const DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS = {
  PENDING: 'PENDING',
  ALIGNED: 'ALIGNED',
  CONFLICT: 'CONFLICT',
  NO_SIGNAL: 'NO_SIGNAL',
} as const;

export type DocumentUploadContextResolverStatus =
  (typeof DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS)[keyof typeof DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS];

export interface DocumentUploadContextCandidate {
  entityType: DocumentUploadContextInputEntityType;
  entityId: string;
  sourceSurface: string;
  providedAt: string;
  providedByUserId: string | null;
  confirmationStatus: DocumentUploadContextConfirmationStatus;
}

export interface DocumentUploadContextConflict {
  field: string;
  contextValue: string | null;
  resolvedValue: string | null;
  severity: 'INFO' | 'WARNING';
  message: string;
}

export interface DocumentUploadContextSearchScope {
  entityType: DocumentUploadContextInputEntityType;
  entityId: string;
  /** Context may narrow entity search — never invent entities. */
  narrowsSearch: true;
}

export interface DocumentUploadContextResolverState {
  status: DocumentUploadContextResolverStatus;
  evaluatedAt?: string | null;
  conflicts?: DocumentUploadContextConflict[];
}

export interface DocumentUploadContextPipelineState {
  candidate: DocumentUploadContextCandidate | null;
  searchScope?: DocumentUploadContextSearchScope | null;
  resolver?: DocumentUploadContextResolverState | null;
}

export interface ResolvedDocumentUploadTarget {
  organizationId: string;
  vehicleId: string | null;
  contextCandidate: DocumentUploadContextCandidate | null;
  searchScope: DocumentUploadContextSearchScope | null;
  /** Legacy DB columns — synced from candidate when present. */
  uploadContextType: DocumentUploadContextInputEntityType | null;
  uploadContextId: string | null;
}

export interface DocumentUploadResolverHints {
  licensePlate?: string | null;
  vin?: string | null;
  invoiceNumber?: string | null;
  reportNumber?: string | null;
  bookingReference?: string | null;
  customerName?: string | null;
}

export interface DocumentUploadContextEntitySnapshot {
  licensePlate?: string | null;
  vin?: string | null;
  invoiceNumber?: string | null;
  reportNumber?: string | null;
  bookingReference?: string | null;
  customerName?: string | null;
}
