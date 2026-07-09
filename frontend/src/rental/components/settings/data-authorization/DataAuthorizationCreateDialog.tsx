import { Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CreateDataAuthorizationPayload } from '../../../../lib/api';
import {
  DATA_CATEGORY_OPTIONS,
  PURPOSE_OPTIONS,
  SCOPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
} from './data-authorization.constants';

interface DataAuthorizationCreateDialogProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateDataAuthorizationPayload) => void;
}

export function DataAuthorizationCreateDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: DataAuthorizationCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('PARTNER_ACCESS');
  const [processorName, setProcessorName] = useState('');
  const [moduleOrigin, setModuleOrigin] = useState('Partner');
  const [purposes, setPurposes] = useState<string[]>(['PARTNER_SERVICE']);
  const [scope, setScope] = useState('ORGANIZATION');
  const [destination, setDestination] = useState('SynqDrive Platform');
  const [dataCategories, setDataCategories] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      purposes.length > 0 &&
      dataCategories.length > 0 &&
      destination.trim().length > 0,
    [title, purposes, dataCategories, destination],
  );

  const toggleCategory = (value: string) => {
    setDataCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  };

  const togglePurpose = (value: string) => {
    setPurposes((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      requestingEntity: title.trim(),
      sourceType,
      processorType: sourceType === 'PARTNER_ACCESS' ? 'EXTERNAL_PARTNER' : 'SYNQDRIVE',
      processorName: processorName.trim() || undefined,
      moduleOrigin,
      purposes,
      scope,
      dataCategories,
      destination: destination.trim(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
      accessPattern: 'ONGOING',
    });
  };

  if (!open) return null;

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-soft)]';

  return (
    <div
      className="overlay-scrim fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div>
            <h3 className="text-base font-bold text-foreground">Neue Datenfreigabe</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Wird mit Status <strong>Ausstehend</strong> erstellt — Genehmigung erforderlich.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Titel *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="z. B. Partner Analytics Zugriff" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Verarbeiter / Partner</label>
              <input value={processorName} onChange={(e) => setProcessorName(e.target.value)} className={inputClass} placeholder="Name des Empfängers" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Beschreibung</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Quelle</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={inputClass}>
                {SOURCE_TYPE_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Modul</label>
              <input value={moduleOrigin} onChange={(e) => setModuleOrigin(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
                {SCOPE_OPTIONS.filter((o) => o.value !== 'all' && o.value !== 'CONNECTED_VEHICLES').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Zweck(e) *</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PURPOSE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePurpose(p.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    purposes.includes(p.value)
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:border-[var(--brand)]/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Datenkategorien *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {DATA_CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => toggleCategory(cat.value)}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-medium border text-left transition-colors ${
                    dataCategories.includes(cat.value)
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:border-[var(--brand)]/40'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Ziel / Destination *</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Ablaufdatum (optional)</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Notizen</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t border-border bg-card">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-medium border border-border hover:bg-muted">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
            className="sq-3d-btn sq-3d-btn--primary px-5 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Freigabe anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
