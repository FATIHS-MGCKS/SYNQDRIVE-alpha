/** Keep in sync with backend `account.service.ts` assertPasswordPolicy. */
export const ACCOUNT_PASSWORD_MIN_LENGTH = 10;

export const ACCOUNT_PASSWORD_REQUIREMENTS = [
  `Mindestens ${ACCOUNT_PASSWORD_MIN_LENGTH} Zeichen`,
  'Darf nicht mit dem aktuellen Passwort identisch sein',
  'Bestätigung muss übereinstimmen',
] as const;

export function validateAccountPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): string | null {
  if (!input.currentPassword.trim()) {
    return 'Aktuelles Passwort ist erforderlich';
  }
  if (input.newPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
    return `Neues Passwort muss mindestens ${ACCOUNT_PASSWORD_MIN_LENGTH} Zeichen haben`;
  }
  if (input.newPassword === input.currentPassword) {
    return 'Das neue Passwort muss sich vom aktuellen unterscheiden';
  }
  if (input.newPassword !== input.confirmPassword) {
    return 'Die neuen Passwörter stimmen nicht überein';
  }
  return null;
}
