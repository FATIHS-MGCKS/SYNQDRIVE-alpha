import type { PublicDocumentExtraction } from '../lib/document-extraction.types';
import type { FlowStatus, Plausibility, ReviewField } from '../components/documents/document-extraction.shared';

export type DocumentIntakeFlowMode = 'embedded' | 'page';

export interface UseDocumentIntakeFlowOptions {
  /** Empty for org inbox upload (page mode); required for embedded vehicle flows. */
  vehicleId?: string;
  orgId?: string | null;
  /** Internal default AUTO — not shown as a required pre-upload field. */
  initialDocType?: string;
  locale?: string;
  uploadSource?: string;
  /** Optional origin context for org upload (unconfirmed hint only). */
  optionalContextType?: string;
  optionalContextId?: string;
  sourceSurface?: string;
  mode?: DocumentIntakeFlowMode;
  /** Keep polling after confirm until APPLIED / terminal failure */
  pollThroughApply?: boolean;
  /** Gate retry / reextract / confirm / cancel on allowedActions */
  respectAllowedActions?: boolean;
  onComplete?: () => void;
  onRecordApplied?: (record: PublicDocumentExtraction) => void;
}

export interface DocumentIntakeFlowState {
  flow: FlowStatus;
  record: PublicDocumentExtraction | null;
  documentType: string;
  confirmedDocType: string;
  uploadedFileName: string;
  errorMessage: string | null;
  validationError: string | null;
  editingFields: boolean;
  editedFields: ReviewField[];
  plausibility: Plausibility | null;
  uploadContext: PublicDocumentExtraction['uploadContext'];
  extractionId: string | null;
  pollNetworkWarning: boolean;
  showLongRunningHint: boolean;
}
