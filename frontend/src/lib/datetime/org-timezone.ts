/** Default IANA timezone when org profile has none — matches backend `DEFAULT_TARIFF_TIMEZONE`. */
export const DEFAULT_ORG_TIMEZONE = 'Europe/Berlin';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve org IANA timezone from profile value. */
export function resolveOrgTimezone(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_ORG_TIMEZONE;
}

/** Map org language code to BCP-47 locale for formatting. */
export function resolveOrgLocale(language: string | null | undefined): string {
  const lang = language?.trim().toLowerCase();
  if (!lang) return 'de-DE';
  if (lang === 'de' || lang.startsWith('de-')) return 'de-DE';
  if (lang === 'en' || lang.startsWith('en-')) return 'en-GB';
  return lang;
}

export function isDateOnly(value: string): boolean {
  return DATE_ONLY_RE.test(value.trim());
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
