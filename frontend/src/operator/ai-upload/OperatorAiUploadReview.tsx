import { AlertTriangle } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import type { Plausibility, PlausibilityStatus, ReviewField } from '../../rental/components/documents/document-extraction.shared';
import {
  DOC_TYPE_TARGET_MODULE,
  docTypeLabel,
  isCriticalReviewField,
} from './operatorAiUpload.config';

function plausClass(status: PlausibilityStatus): string {
  if (status === 'BLOCKER') return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06]';
  if (status === 'WARNING') return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06]';
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06]';
}

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
    <div className="space-y-4">
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
        <StatusChip tone="info">{docTypeLabel(confirmedDocType)}</StatusChip>
      </div>

      {plausibility && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Plausibilität</p>
            <StatusChip tone={plausibility.overallStatus === 'BLOCKER' ? 'critical' : plausibility.overallStatus === 'WARNING' ? 'watch' : 'success'}>
              {plausibility.overallStatus}
            </StatusChip>
          </div>
          {plausibility.checks.map((c, i) => (
            <div key={`${c.code}-${i}`} className={`rounded-xl border px-3 py-2 text-xs ${plausClass(c.status)}`}>
              {c.message}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Erkannte Felder</p>
          {!readOnly && (
            <button type="button" onClick={onToggleEdit} className="text-xs font-semibold text-[color:var(--brand-ink)]">
              {editing ? 'Fertig' : 'Bearbeiten'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {editedFields.map((field, i) => {
            const critical = isCriticalReviewField(field.key);
            return (
              <div
                key={field.key}
                className={`rounded-xl border px-3 py-3 ${
                  critical ? 'border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/[0.04]' : 'border-border surface-premium'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{field.label}</p>
                  {critical && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[color:var(--status-watch)]">
                      <AlertTriangle className="h-3 w-3" />
                      Prüfen
                    </span>
                  )}
                </div>
                {editing && !readOnly ? (
                  <input
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={field.value}
                    onChange={(e) => onFieldChange(i, e.target.value)}
                  />
                ) : (
                  <p className="mt-1 text-sm font-medium text-foreground">{field.value || '—'}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
