export function parseTotpSecretFromOtpAuthUrl(otpauthUrl: string): string | null {
  try {
    return new URL(otpauthUrl).searchParams.get('secret');
  } catch {
    return null;
  }
}

export function formatRecoveryCodesForExport(codes: string[]): string {
  return [
    'SynqDrive Wiederherstellungscodes',
    'Bewahren Sie diese Codes sicher auf. Jeder Code kann nur einmal verwendet werden.',
    '',
    ...codes,
    '',
    `Erstellt: ${new Date().toLocaleString('de-DE')}`,
  ].join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadRecoveryCodes(codes: string[], filename = 'synqdrive-recovery-codes.txt'): void {
  const content = formatRecoveryCodesForExport(codes);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function mapAuthErrorMessage(message: string, locale: 'de' | 'en' = 'de'): string {
  const lower = message.toLowerCase();
  if (lower.includes('too many') || lower.includes('rate limit') || lower.includes('429')) {
    return locale === 'de'
      ? 'Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.'
      : 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('invalid or expired mfa challenge')) {
    return locale === 'de'
      ? 'Die Anmeldeprüfung ist abgelaufen. Bitte melden Sie sich erneut an.'
      : 'The sign-in verification expired. Please sign in again.';
  }
  if (lower.includes('invalid mfa code') || lower.includes('invalid totp')) {
    return locale === 'de' ? 'Ungültiger Sicherheitscode.' : 'Invalid security code.';
  }
  return message;
}
