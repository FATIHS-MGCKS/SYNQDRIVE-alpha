/** Map Resend API error text to operator-facing messages (German). */
export function mapResendOperatorError(message?: string | null): string {
  const raw = message?.trim();
  if (!raw) return 'Resend-Anfrage fehlgeschlagen';

  const lower = raw.toLowerCase();
  if (lower.includes('restricted to only send')) {
    return (
      'Der Resend API-Key hat nur Versand-Berechtigung (Sending access). ' +
      'Im Resend-Dashboard einen API-Key mit vollem Zugriff (Full access) erstellen ' +
      'und RESEND_API_KEY auf dem Server aktualisieren.'
    );
  }

  return raw;
}
