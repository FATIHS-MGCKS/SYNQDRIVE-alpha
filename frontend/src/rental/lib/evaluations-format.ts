export function evaluationsIntlLocale(locale: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
    nl: 'nl-NL',
    es: 'es-ES',
    it: 'it-IT',
    pl: 'pl-PL',
    cs: 'cs-CZ',
  };
  return map[locale] || 'en-US';
}

export function fmtEurMinor(minor: number, intlLocale = 'de-DE'): string {
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function fmtEurCents(cents: number, intlLocale = 'de-DE'): string {
  return fmtEurMinor(cents, intlLocale);
}

export function fmtPct(value: number, digits = 1): string {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(digits)}%`;
}
