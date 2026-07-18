import { DocumentExtractionReviewPanel } from '../../rental/components/documents/DocumentExtractionReviewPanel';
import type { Plausibility, ReviewField } from '../../rental/components/documents/document-extraction.shared';
import {
  DOC_TYPE_TARGET_MODULE,
  docTypeLabel,
  isCriticalReviewField,
} from './operatorAiUpload.config';

interface Props {
  confirmedDocType: string;
  uploadedFileName: string;
  editedFields: ReviewField[];
  plausibility: Plausibility | null;
  editing: boolean;
  onToggleEdit: () => void;
  onFieldChange: (index: number, value: string) => void;
  readOnly?: boolean;
}

export function OperatorAiUploadReview({
  confirmedDocType,
  uploadedFileName,
  editedFields,
  plausibility,
  editing,
  onToggleEdit,
  onFieldChange,
  readOnly,
}: Props) {
  const targetModule = DOC_TYPE_TARGET_MODULE[confirmedDocType] ?? 'Fahrzeugakte';

  return (
    <DocumentExtractionReviewPanel
      confirmedDocType={confirmedDocType}
      editedFields={editedFields}
      plausibility={plausibility}
      editingFields={editing}
      readOnly={readOnly}
      canEdit={!readOnly}
      onToggleEdit={onToggleEdit}
      onFieldChange={onFieldChange}
      showEntityResolution={false}
      headerSlot={
        <div className="space-y-3">
          <div className="rounded-2xl border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/40 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Bestätigung erforderlich
            </p>
            <p className="mt-1 text-sm text-foreground">
              Daten werden erst nach deiner Bestätigung über die bestehende Apply-Pipeline importiert.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Zielmodul: <span className="font-semibold text-foreground">{targetModule}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border surface-premium px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{uploadedFileName || 'Dokument'}</span>
            <span className="text-xs font-semibold text-primary">{docTypeLabel(confirmedDocType)}</span>
          </div>
        </div>
      }
      footerSlot={
        <p className="text-[10px] text-muted-foreground">
          Kritische Felder:{' '}
          {editedFields
            .filter((field) => isCriticalReviewField(field.key))
            .map((field) => field.label)
            .join(', ') || '—'}
        </p>
      }
    />
  );
}
