export interface UseDocumentExtractionFlowOptions {
  vehicleId: string;
  initialDocType?: string;
  locale?: string;
  /** Form field `source` on multipart upload (e.g. operator_app, documents_tab). */
  uploadSource?: string;
  sourceSurface?: string;
  onComplete?: () => void;
}
