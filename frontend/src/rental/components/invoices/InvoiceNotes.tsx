import { useEffect, useState } from 'react';

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

  return (
    <section aria-labelledby="invoice-internal-notes-heading" className={embedded ? '' : 'p-5'}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div>
          <h4 id="invoice-internal-notes-heading" className={`text-[10px] font-semibold uppercase tracking-wider ${ts}`}>
            Interne Notizen
          </h4>
          <p className={`text-[10px] ${ts}`}>Nur intern — nicht auf der Kundenrechnung.</p>
        </div>
        {!editingNotes && canEdit ? (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="text-[11px] font-medium text-brand shrink-0"
          >
            Bearbeiten
          </button>
        ) : null}
        {!editingNotes && !canEdit && editBlockedReason ? (
          <span className={`text-[10px] ${ts} text-right`} title={editBlockedReason}>
            Nur-Lesen
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
            placeholder="Interne Notizen zur Rechnung…"
            aria-label="Interne Notizen"
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
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="sq-3d-btn sq-3d-btn--primary px-3 py-1.5 text-xs font-semibold"
            >
              Speichern
            </button>
          </div>
        </div>
      ) : hasNotes ? (
        <p className={`mt-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap ${tp}`}>{invoice.notes}</p>
      ) : showEmptyHint ? (
        <p className={`mt-1 text-[11px] ${ts}`}>Noch keine internen Notizen.</p>
      ) : null}
    </section>
  );
}
