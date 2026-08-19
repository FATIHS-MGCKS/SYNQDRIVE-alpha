import { st } from '../../tasks-settings/settings-i18n';

/** Keep in sync with backend `account.service.ts` assertPasswordPolicy. */
export const ACCOUNT_PASSWORD_MIN_LENGTH = 10;

export function getAccountPasswordRequirements(locale: string): string[] {
  return [
    st(locale, 'settings.account.password.requirement.minLength', {
      min: ACCOUNT_PASSWORD_MIN_LENGTH,
    }),
    st(locale, 'settings.account.password.requirement.different'),
    st(locale, 'settings.account.password.requirement.confirmMatch'),
  ];
}

export function validateAccountPasswordChange(
  locale: string,
  input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
): string | null {
  if (!input.currentPassword.trim()) {
    return st(locale, 'settings.account.password.validation.currentRequired');
  }
  if (input.newPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
    return st(locale, 'settings.account.password.validation.minLength', {
      min: ACCOUNT_PASSWORD_MIN_LENGTH,
    });
  }
  if (input.newPassword === input.currentPassword) {
    return st(locale, 'settings.account.password.validation.mustDiffer');
  }
  if (input.newPassword !== input.confirmPassword) {
    return st(locale, 'settings.account.password.validation.mismatch');
  }
  return null;
}
