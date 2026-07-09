import { useState } from 'react';
import { Icon } from '../ui/Icon';

interface CustomerNoteModalProps {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (note: string, title?: string) => void;
}

export function CustomerNoteModal({ open, saving, onClose, onConfirm }: CustomerNoteModalProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border surface-premium shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Notiz hinzufügen</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Titel (optional)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border surface-premium"
            placeholder="z. B. Telefonat mit Kunde"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Notiz (Pflicht)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border surface-premium resize-none"
            placeholder="Inhalt der Notiz…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-border"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={saving || !note.trim()}
            onClick={() => {
              onConfirm(note.trim(), title.trim() || undefined);
              setNote('');
              setTitle('');
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg sq-tone-brand disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Notiz speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CustomerRejectDocumentModalProps {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function CustomerRejectDocumentModal({
  open,
  saving,
  onClose,
  onConfirm,
}: CustomerRejectDocumentModalProps) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border surface-premium shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Dokument ablehnen</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full text-xs px-3 py-2 rounded-lg border border-border surface-premium resize-none"
          placeholder="Ablehnungsgrund (Pflicht)…"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold rounded-lg border border-border">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={saving || !reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason('');
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg sq-tone-critical disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Ablehnen'}
          </button>
        </div>
      </div>
    </div>
  );
}
