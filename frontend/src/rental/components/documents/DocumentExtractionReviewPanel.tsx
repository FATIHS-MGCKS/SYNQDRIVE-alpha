import type { ReactNode } from 'react';
import type { PublicDocumentExtraction } from '../../lib/document-extraction.types';
import { buildDocumentActionPreview } from '../../lib/document-extraction-action-preview';
import {
  DOC_TYPE_LABELS,
  type Plausibility,
  type PlausibilityStatus,
  type ReviewField,
} from './document-extraction.shared';

function plausClass(status: PlausibilityStatus): string {
  if (status === 'BLOCKER') return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]';
  if (status === 'WARNING') return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]';
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] text-[color:var(--status-success)]';
}

export interface DocumentExtractionReviewPanelProps {
  confirmedDocType: string;
  editedFields: ReviewField[];
  plausibility: Plausibility | null;
  record?: PublicDocumentExtraction | null;
  editingFields: boolean;
  readOnly?: boolean;
  canEdit?: boolean;
  onToggleEdit?: () => void;
  onFieldChange: (index: number, value: string) => void;
  fieldsTitle?: string;
  plausibilityTitle?: string;
  showActionPreview?: boolean;
  showEntityResolution?: boolean;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
  isDarkMode?: boolean;
}

function EntityResolutionSection({ record }: { record: PublicDocumentExtraction }) {
  const groups = [
    { label: 'Fahrzeug', items: record.vehicleCandidates },
    { label: 'Buchung', items: record.bookingCandidates },
    { label: 'Kunde', items: record.customerCandidates },
    { label: 'Fahrer', items: record.driverCandidates },
    { label: 'Partner', items: record.partnerCandidates },
  ].filter((group) => Array.isArray(group.items) && group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="sq-section-label">Entity-Vorschläge (nur Vorschau)</p>
      {groups.map((group) => (
        <div key={group.label} className="rounded-lg border border-border bg-muted/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">{group.label}</p>
          <ul className="mt-1 space-y-1">
            {(group.items as Array<{ rank?: number; confidence?: number; displayLabel?: string; bookingId?: string; vehicleId?: string }>).slice(0, 3).map((item, index) => (
              <li key={index} className="text-[11px] text-foreground">
                #{item.rank ?? index + 1} · {Math.round((item.confidence ?? 0) * 100)}% ·{' '}
                {item.displayLabel || item.bookingId || item.vehicleId || 'Kandidat'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocumentExtractionReviewPanel({
  confirmedDocType,
  editedFields,
  plausibility,
  record = null,
  editingFields,
  readOnly = false,
  canEdit = true,
  onToggleEdit,
  onFieldChange,
  fieldsTitle = 'Erkannte Felder',
  plausibilityTitle = 'Plausibilität',
  showActionPreview = true,
  showEntityResolution = true,
  headerSlot,
  footerSlot,
  isDarkMode = false,
}: DocumentExtractionReviewPanelProps) {
  const actionPreview = showActionPreview
    ? buildDocumentActionPreview(record, { blockerPresent: plausibility?.overallStatus === 'BLOCKER' })
    : [];

  return (
    <div className="space-y-3">
      {headerSlot}

      {plausibility ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="sq-section-label">{plausibilityTitle}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${plausClass(plausibility.overallStatus)}`}>
              {plausibility.overallStatus}
            </span>
          </div>
          {plausibility.checks.length === 0 ? (
            <div className={`rounded-lg border px-3 py-2 text-[11px] ${plausClass('OK')}`}>Keine Auffälligkeiten</div>
          ) : (
            <div className="space-y-1.5">
              {plausibility.checks.map((check, index) => (
                <div key={`${check.code}-${index}`} className={`rounded-lg border px-3 py-2 text-[11px] ${plausClass(check.status)}`}>
                  {check.message}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showEntityResolution && record ? <EntityResolutionSection record={record} /> : null}

      {showActionPreview && actionPreview.length > 0 ? (
        <div>
          <p className="sq-section-label mb-1.5">Geplante Aktionen (Vorschau)</p>
          <div className="space-y-1.5">
            {actionPreview.map((action) => (
              <div key={action.semanticAction} className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{action.semanticAction}</span>
                  <span className="text-muted-foreground">· {action.requirement}</span>
                  <span className="text-muted-foreground">· {action.targetModule}</span>
                </div>
                {action.note ? <p className="mt-0.5 text-muted-foreground">{action.note}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="sq-section-label">{fieldsTitle}</span>
          {canEdit && !readOnly && onToggleEdit ? (
            <button type="button" onClick={onToggleEdit} className="text-[10px] font-semibold text-primary">
              {editingFields ? 'Fertig' : 'Bearbeiten'}
            </button>
          ) : null}
        </div>
        <div className={`overflow-hidden rounded-xl border ${isDarkMode ? 'border-neutral-800' : 'border-border'}`}>
          {editedFields.map((field, index) => (
            <div
              key={field.key}
              className={`flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 px-3 py-2.5 min-w-0 ${index > 0 ? 'border-t border-border' : ''} bg-muted/10`}
            >
              <span className={`sm:w-44 shrink-0 text-[10px] font-medium text-muted-foreground`}>{field.label}</span>
              {editingFields && !readOnly ? (
                field.fieldType === 'multiline' ? (
                  <textarea
                    value={field.value}
                    rows={3}
                    onChange={(e) => onFieldChange(index, e.target.value)}
                    className="w-full min-w-0 sm:flex-1 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
                  />
                ) : (
                  <input
                    value={field.value}
                    onChange={(e) => onFieldChange(index, e.target.value)}
                    className="w-full min-w-0 sm:flex-1 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
                  />
                )
              ) : (
                <span className="w-full min-w-0 break-words text-[11px] font-medium text-foreground whitespace-pre-wrap">{field.value || '—'}</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {DOC_TYPE_LABELS[confirmedDocType] || confirmedDocType}
        </p>
      </div>

      {footerSlot}
    </div>
  );
}
