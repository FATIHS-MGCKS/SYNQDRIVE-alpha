import { useEffect, useState } from 'react';

import { useLanguage } from '../../../i18n/LanguageContext';
import { rids } from '../../lib/rental-invoice-detail-secondary-i18n';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceNotesProps extends InvoiceThemeClasses {
  invoice: Invoice;
  onSave: (notes: string) => Promise<boolean>;
  canEdit?: boolean;
  editBlockedReason?: string | null;
  embedded?: boolean;
}

export function InvoiceNotes({
  invoice,
  onSave,
  canEdit = true,
  editBlockedReason,
  embedded = false,
  tp,
  ts,
  inputCls,
}: InvoiceNotesProps) {
  const { locale, t } = useLanguage();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(invoice.notes || '');

  useEffect(() => {
    if (!editingNotes) setNotes(invoice.notes || '');
  }, [invoice.notes, editingNotes]);

  const hasNotes = Boolean(invoice.notes?.trim());
  const showEmptyHint = !hasNotes && !editingNotes && canEdit;

  if (!embedded && !hasNotes && !canEdit && !editingNotes) {
    return null;
  }

  if (embedded && !hasNotes && !canEdit && !editingNotes) {
    return null;
  }

  const handleSave = async () => {
    const ok = await onSave(notes);
    if (ok) setEditingNotes(false);
  };

  const notesHeading = rids(locale, 'rental.invoice.detail.secondary.notes.heading');
  const notesAria = rids(locale, 'rental.invoice.detail.secondary.notes.aria');

  return (
    <section aria-labelledby="invoice-internal-notes-heading" className={embedded ? '' : 'p-5'}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div>
          <h4 id="invoice-internal-notes-heading" className={`text-[10px] font-semibold uppercase tracking-wider ${ts}`}>
            {notesHeading}
          </h4>
          <p className={`text-[10px] ${ts}`}>{rids(locale, 'rental.invoice.detail.secondary.notes.hint')}</p>
        </div>
        {!editingNotes && canEdit ? (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="text-[11px] font-medium text-brand shrink-0"
          >
            {t('common.edit')}
          </button>
        ) : null}
        {!editingNotes && !canEdit && editBlockedReason ? (
          <span className={`text-[10px] ${ts} text-right`} title={editBlockedReason}>
            {rids(locale, 'rental.invoice.detail.secondary.notes.readOnly')}
          </span>
        ) : null}
      </div>

      {editingNotes ? (
        <div className="space-y-2 mt-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputCls} resize-y min-h-[72px]`}
            placeholder={rids(locale, 'rental.invoice.detail.secondary.notes.placeholder')}
            aria-label={notesAria}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingNotes(false);
                setNotes(invoice.notes || '');
              }}
              className="sq-3d-btn sq-3d-btn--neutral px-3 py-1.5 text-xs font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="sq-3d-btn sq-3d-btn--primary px-3 py-1.5 text-xs font-semibold"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : hasNotes ? (
        <p className={`mt-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap ${tp}`}>{invoice.notes}</p>
      ) : showEmptyHint ? (
        <p className={`mt-1 text-[11px] ${ts}`}>{rids(locale, 'rental.invoice.detail.secondary.notes.empty')}</p>
      ) : null}
    </section>
  );
}
