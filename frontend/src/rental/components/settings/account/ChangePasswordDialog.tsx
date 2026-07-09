import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  ACCOUNT_PASSWORD_REQUIREMENTS,
  validateAccountPasswordChange,
} from './password-policy';
import { accountFieldLabelClass, accountInputClass } from './account-ui';

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const validationError = validateAccountPasswordChange({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    });
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    try {
      await onSubmit({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
        revokeOtherSessions: form.revokeOtherSessions,
      });
      setForm(EMPTY_FORM);
      setLocalError(null);
      onClose();
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 overlay-scrim"
        aria-label="Dialog schließen"
        onClick={() => !saving && resetAndClose()}
      />
      <div
        className="relative w-full max-w-md animate-fade-up rounded-2xl sq-card p-5 shadow-[var(--shadow-3)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="change-password-title" className="text-sm font-semibold text-foreground">
            Passwort ändern
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={resetAndClose}
            disabled={saving}
            aria-label="Schließen"
          >
            <X />
          </Button>
        </div>

        <p className="mb-4 text-[11px] text-muted-foreground">
          Geben Sie Ihr aktuelles Passwort ein und wählen Sie ein neues, sicheres Passwort.
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
          <div>
            <label className={accountFieldLabelClass} htmlFor="account-current-password">
              Aktuelles Passwort
            </label>
            <input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              className={accountInputClass}
              value={form.currentPassword}
              onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
              disabled={saving}
            />
          </div>
          <div>
            <label className={accountFieldLabelClass} htmlFor="account-new-password">
              Neues Passwort
            </label>
            <input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              className={accountInputClass}
              value={form.newPassword}
              onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
              disabled={saving}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
            />
          </div>
          <div>
            <label className={accountFieldLabelClass} htmlFor="account-confirm-password">
              Neues Passwort bestätigen
            </label>
            <input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              className={accountInputClass}
              value={form.confirmPassword}
              onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              disabled={saving}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-medium text-foreground">Passwortanforderungen</p>
            <ul className="mt-1.5 space-y-1">
              {ACCOUNT_PASSWORD_REQUIREMENTS.map((requirement) => (
                <li key={requirement} className="text-[11px] text-muted-foreground">
                  · {requirement}
                </li>
              ))}
            </ul>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={form.revokeOtherSessions}
              onChange={(event) =>
                setForm((current) => ({ ...current, revokeOtherSessions: event.target.checked }))
              }
              className="rounded border-border"
              disabled={saving}
            />
            Alle anderen Sitzungen abmelden
          </label>

          {localError ? (
            <p className="text-xs text-[color:var(--status-critical)]" role="alert">
              {localError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={resetAndClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Passwort speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
