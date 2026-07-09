import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { ManualPickupCheckDto } from '../../lib/api';

interface OperatorPickupCheckSheetProps {
  customerId: string;
  bookingId: string;
  customerName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type ChecklistState = Omit<ManualPickupCheckDto, 'customerId' | 'bookingId'>;

const INITIAL: ChecklistState = {
  idDocumentSeen: false,
  idNameMatchesBooking: false,
  idDateOfBirthChecked: false,
  minimumAgePassed: false,
  drivingLicenseSeen: false,
  licenseNameMatchesBooking: false,
  licenseClassValid: false,
  licenseNotExpired: false,
  minimumLicenseDurationPassed: true,
  notes: '',
};

const CHECKLIST_ITEMS: Array<{
  key: keyof Omit<ChecklistState, 'notes'>;
  label: string;
  optional?: boolean;
}> = [
  { key: 'idDocumentSeen', label: 'Ausweis gesehen' },
  { key: 'idNameMatchesBooking', label: 'Name stimmt mit Buchung überein' },
  { key: 'idDateOfBirthChecked', label: 'Geburtsdatum / Mindestalter geprüft' },
  { key: 'minimumAgePassed', label: 'Mindestalter erfüllt' },
  { key: 'drivingLicenseSeen', label: 'Führerschein gesehen' },
  { key: 'licenseNameMatchesBooking', label: 'Name auf Führerschein stimmt' },
  { key: 'licenseClassValid', label: 'Führerscheinklasse passt' },
  { key: 'licenseNotExpired', label: 'Führerschein nicht abgelaufen' },
  {
    key: 'minimumLicenseDurationPassed',
    label: 'Mindestführerschein-Dauer erfüllt',
    optional: true,
  },
];

export function OperatorPickupCheckSheet({
  customerId,
  bookingId,
  customerName,
  onClose,
  onSuccess,
}: OperatorPickupCheckSheetProps) {
  const [form, setForm] = useState<ChecklistState>(INITIAL);
  const [saving, setSaving] = useState(false);

  const toggle = (key: keyof Omit<ChecklistState, 'notes'>) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.customerVerification.submitManualPickupCheck({
        customerId,
        bookingId,
        ...form,
        notes: form.notes?.trim() || undefined,
      });
      toast.success('Pickup-Prüfung gespeichert');
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pickup-Prüfung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Manuelle Prüfung
          </p>
          <h2 className="truncate text-base font-bold">Prüfung beim Pickup</h2>
          <p className="text-xs text-muted-foreground truncate">{customerName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Dokumentiere die operative Prüfung vor Ort. Die Entscheidung wird serverseitig als
          manuelle Prüfung gespeichert.
        </p>

        <div className="rounded-2xl border border-border/60 bg-card/80 divide-y divide-border/40">
          {CHECKLIST_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-start gap-3 px-4 py-3 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(form[item.key])}
                onChange={() => toggle(item.key)}
              />
              <span>
                {item.label}
                {item.optional && (
                  <span className="text-[10px] text-muted-foreground ml-1">(falls Regel aktiv)</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
            Notizen
          </label>
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-xl border border-border/60 bg-card px-3 py-2 text-sm"
            placeholder="Optionale Anmerkungen zur Pickup-Prüfung…"
          />
        </div>
      </div>

      <footer className="border-t border-border/50 p-4 space-y-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="sq-3d-btn sq-3d-btn--primary min-h-[48px] w-full font-semibold disabled:opacity-50"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Speichern…
            </span>
          ) : (
            'Pickup-Prüfung speichern'
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="sq-press min-h-[44px] w-full rounded-xl border border-border/60 text-sm font-medium"
        >
          Abbrechen
        </button>
      </footer>
    </div>
  );
}
