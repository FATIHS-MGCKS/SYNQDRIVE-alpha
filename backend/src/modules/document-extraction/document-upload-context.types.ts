export const DOCUMENT_UPLOAD_CONTEXT_TYPES = {
  VEHICLE: 'VEHICLE',
} as const;

export type DocumentUploadContextType =
  (typeof DOCUMENT_UPLOAD_CONTEXT_TYPES)[keyof typeof DOCUMENT_UPLOAD_CONTEXT_TYPES];

export const DOCUMENT_UPLOAD_CONTEXT_TYPE_VALUES = Object.values(
  DOCUMENT_UPLOAD_CONTEXT_TYPES,
) as DocumentUploadContextType[];

export interface ResolvedDocumentUploadTarget {
  organizationId: string;
  vehicleId: string | null;
  uploadContextType: DocumentUploadContextType | null;
  uploadContextId: string | null;
}
