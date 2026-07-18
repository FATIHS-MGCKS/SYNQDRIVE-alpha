import { useMemo, useState } from 'react';
import { Mail, CheckCircle2, XCircle } from 'lucide-react';

import type { PublicDocumentFollowUpSuggestion } from '../../lib/document-extraction.types';
import { isContactPrepareSuggestionType } from '../../lib/document-follow-up-contact';
import type { TranslationKey } from '../../i18n/translations/en';
import { DocumentFollowUpContactPrepareModal } from './DocumentFollowUpContactPrepareModal';

export interface DocumentFollowUpSuggestionsPanelProps {
  orgId: string;
  vehicleId: string | null;
  extractionId: string | null;
  suggestions: PublicDocumentFollowUpSuggestion[];
  loading?: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onRefresh?: () => void;
}

export function DocumentFollowUpSuggestionsPanel({
  orgId,
  vehicleId,
  extractionId,
  suggestions,
  loading = false,
  t,
  onRefresh,
}: DocumentFollowUpSuggestionsPanelProps) {
  const [contactSuggestionId, setContactSuggestionId] = useState<string | null>(null);

  const actionable = useMemo(
    () =>
      suggestions.filter(
        (row) => row.status === 'SUGGESTED' && row.type !== 'NO_FOLLOW_UP',
      ),
    [suggestions],
  );

  if (!extractionId || (actionable.length === 0 && !loading)) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-3">
      <div>
        <p className="sq-section-label">{t('docUpload.followUp.title')}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{t('docUpload.followUp.subtitle')}</p>
      </div>

      {loading ? (
        <p className="text-[10px] text-muted-foreground">{t('docUpload.followUp.loading')}</p>
      ) : null}

      <div className="space-y-1.5">
        {actionable.map((row) => {
          const contactPrepare = isContactPrepareSuggestionType(row.type);
          return (
            <div
              key={row.suggestionId}
              className="rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">{row.title}</p>
                  <p className="text-[10px] text-muted-foreground">{row.rationale}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                  {t(`docUpload.followUp.status.${row.status}` as TranslationKey)}
                </span>
              </div>
              {contactPrepare ? (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline"
                  onClick={() => setContactSuggestionId(row.suggestionId)}
                >
                  <Mail className="w-3.5 h-3.5" />
                  {t('docUpload.followUp.prepareContact')}
                </button>
              ) : null}
              {row.status === 'ACCEPTED' ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-[color:var(--status-success)]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('docUpload.followUp.accepted')}
                </p>
              ) : null}
              {row.status === 'DISMISSED' ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <XCircle className="w-3.5 h-3.5" />
                  {t('docUpload.followUp.dismissed')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {contactSuggestionId && extractionId ? (
        <DocumentFollowUpContactPrepareModal
          open
          onOpenChange={(open) => {
            if (!open) setContactSuggestionId(null);
          }}
          orgId={orgId}
          vehicleId={vehicleId}
          extractionId={extractionId}
          suggestionId={contactSuggestionId}
          t={t}
          onSent={onRefresh}
        />
      ) : null}
    </div>
  );
}
