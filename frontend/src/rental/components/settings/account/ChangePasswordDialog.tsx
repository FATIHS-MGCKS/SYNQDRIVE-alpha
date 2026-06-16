import { Loader2, X } from 'lucide-react';
import { useState } from 'react';

interface ChangePasswordDialogProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    revokeOtherSessions: boolean;
  }) => Promise<unknown>;
}

const EMPTY_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  revokeOtherSessions: true,
};

export function ChangePasswordDialog({ open, saving, onClose, onSubmit }: ChangePasswordDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setLocalError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const { currentPassword, newPassword, confirmPassword, revokeOtherSessions } = form;
    if (!currentPassword.trim()) {
      setLocalError('Aktuelles Passwort ist erforderlich');
      return;
    }
    if (newPassword.length < 6) {
      setLocalError('Neues Passwort muss mindestens 6 Zeichen haben');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Die neuen Passwörter stimmen nicht überein');
      return;
    }
    try {
      await onSubmit({
        currentPassword,
        newPassword,
        confirmPassword,
        revokeOtherSessions,
      });
      setForm(EMPTY_FORM);
      setLocalError(null);
      onClose();
    } catch {
      /* toast handled in hook */
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Dialog schließen"
        onClick={() => !saving && resetAndClose()}
      />
      <div
        className="relative w-full max-w-md sq-card rounded-2xl shadow-[var(--shadow-3)] p-5 animate-fade-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="change-password-title" className="text-sm font-semibold text-foreground">
            Passwort ändern
          </h3>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-muted-foreground">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-muted-foreground">
              Neues Passwort
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-muted-foreground">
              Neues Passwort bestätigen
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={form.revokeOtherSessions}
              onChange={(e) => setForm((f) => ({ ...f, revokeOtherSessions: e.target.checked }))}
              className="rounded border-border"
            />
            Alle anderen Sitzungen abmelden
          </label>
          {localError && (
            <p className="text-xs text-[color:var(--status-critical)]">{localError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={saving}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Passwort aktualisieren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
