import { useState } from 'react';

import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceNotesProps extends InvoiceThemeClasses {
  invoice: Invoice;
  onSave: (notes: string) => Promise<boolean>;
}

export function InvoiceNotes({ invoice, onSave, card, tp, ts, inputCls, isDarkMode }: InvoiceNotesProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(invoice.notes || '');

  const handleSave = async () => {
    const ok = await onSave(notes);
    if (ok) setEditingNotes(false);
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>Notizen</h3>
        {!editingNotes && (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className={`text-[11px] font-medium ${isDarkMode ? 'text-brand' : 'text-brand'}`}
          >
            Bearbeiten
          </button>
        )}
      </div>
      {editingNotes ? (
        <div className="space-y-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Interne Notizen..."
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
      ) : (
        <p className={`text-xs ${invoice.notes ? tp : ts}`}>{invoice.notes || 'Keine Notizen vorhanden.'}</p>
      )}
    </div>
  );
}
