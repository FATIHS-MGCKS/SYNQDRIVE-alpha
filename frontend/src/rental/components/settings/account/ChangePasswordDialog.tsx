import { Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  getAccountPasswordRequirements,
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
  const { t, locale } = useLanguage();
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState<string | null>(null);
  const requirements = useMemo(() => getAccountPasswordRequirements(locale), [locale]);

  if (!open) return null;

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setLocalError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const validationError = validateAccountPasswordChange(locale, {
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
        aria-label={t('settings.account.password.closeDialog')}
        onClick={() => !saving && resetAndClose()}
      />
      <div
        className="relative w-full max-w-md animate-fade-up rounded-2xl surface-premium p-5 shadow-[var(--shadow-3)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="change-password-title" className="text-sm font-semibold text-foreground">
            {t('settings.account.password.title')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={resetAndClose}
            disabled={saving}
            aria-label={t('common.close')}
          >
            <X />
          </Button>
        </div>

        <p className="mb-4 text-[11px] text-muted-foreground">
          {t('settings.account.password.description')}
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
          <div>
            <label className={accountFieldLabelClass} htmlFor="account-current-password">
              {t('settings.account.password.current')}
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
              {t('settings.account.password.new')}
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
              {t('settings.account.password.confirm')}
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
            <p className="text-[11px] font-medium text-foreground">
              {t('settings.account.password.requirements')}
            </p>
            <ul className="mt-1.5 space-y-1">
              {requirements.map((requirement) => (
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
            {t('settings.account.password.revokeOthers')}
          </label>

          {localError ? (
            <p className="text-xs text-[color:var(--status-critical)]" role="alert">
              {localError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={resetAndClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t('settings.account.password.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
