import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { UploadDuplicateBlockedPayload } from '../../../lib/document-upload-duplicate';
import { formatUploadDuplicateLinks } from '../../../lib/document-upload-duplicate';
import { isAuthorizedReuploadReason } from '../../lib/document-upload-duplicate-flow';
import { useLanguage } from '../../i18n/LanguageContext';
import { resolveDocumentTypeLabel } from '../../lib/document-intake-i18n';

export interface DocumentUploadDuplicatePanelProps {
  payload: UploadDuplicateBlockedPayload;
  onCancel: () => void;
  onReupload: (reason: string) => void;
}

export function DocumentUploadDuplicatePanel({
  payload,
  onCancel,
  onReupload,
}: DocumentUploadDuplicatePanelProps) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const existing = payload.existingExtraction;
  const links = existing ? formatUploadDuplicateLinks(existing.entityLinks) : [];
  const existingType =
    existing?.effectiveDocumentType || existing?.requestedDocumentType || '—';

  return (
    <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.05] p-5">
      <div className="flex items-start gap-3">
        <Icon name="copy" className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--status-watch)]" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">{t('docUpload.duplicate.title')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('docUpload.duplicate.body')}</p>
          </div>

          {existing ? (
            <div className="rounded-lg border border-border bg-background/70 p-3 text-left">
              <p className="truncate text-[12px] font-semibold text-foreground">
                {existing.sourceFileName || t('docUpload.duplicate.existingFallback')}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('docUpload.duplicate.statusLine', {
                  status: existing.status,
                  type: resolveDocumentTypeLabel(existingType, t, existingType),
                })}
              </p>
              {links.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {links.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="sq-section-label mb-1.5 block">{t('docUpload.duplicate.reasonLabel')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('docUpload.duplicate.reasonPlaceholder')}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-[12px] text-foreground"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="sq-press rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!isAuthorizedReuploadReason(reason)}
              onClick={() => onReupload(reason.trim())}
              className="sq-press rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t('docUpload.duplicate.reupload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
