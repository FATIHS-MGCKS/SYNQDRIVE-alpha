export type MultiCurrencyDefinitionLocale = 'de' | 'en';

export interface MultiCurrencyDefinition {
  id: string;
  label: Record<MultiCurrencyDefinitionLocale, string>;
  description: Record<MultiCurrencyDefinitionLocale, string>;
}

export const MULTI_CURRENCY_DEFINITIONS: Record<string, MultiCurrencyDefinition> = {
  reportingCurrency: {
    id: 'reportingCurrency',
    label: { de: 'Organisationsbasiswährung', en: 'Organization base currency' },
    description: {
      de: 'Alle Auswertungs-KPIs werden in dieser Währung dargestellt. Fremdwährungsbelege werden umgerechnet oder ausgeschlossen.',
      en: 'All analytics KPIs are shown in this currency. Foreign-currency documents are converted or excluded.',
    },
  },
  originalAmount: {
    id: 'originalAmount',
    label: { de: 'Originalbetrag', en: 'Original amount' },
    description: {
      de: 'Betrag in der Belegwährung (Ganzzahl in Kleinsteinheiten).',
      en: 'Amount in the document currency (integer minor units).',
    },
  },
  convertedAmount: {
    id: 'convertedAmount',
    label: { de: 'Umgerechneter Betrag', en: 'Converted amount' },
    description: {
      de: 'Betrag in der Organisationsbasiswährung nach FX-Umrechnung.',
      en: 'Amount in the organization base currency after FX conversion.',
    },
  },
  exchangeRate: {
    id: 'exchangeRate',
    label: { de: 'Wechselkurs', en: 'Exchange rate' },
    description: {
      de: 'Rationaler Kurs: 1 Einheit Originalwährung = Zähler/Nenner Basiswährung.',
      en: 'Rational rate: 1 unit of original currency = numerator/denominator base currency.',
    },
  },
  conversionStatus: {
    id: 'conversionStatus',
    label: { de: 'Umrechnungsstatus', en: 'Conversion status' },
    description: {
      de: 'NATIVE = bereits Basiswährung; CONVERTED = umgerechnet; EXCLUDED_* = vom KPI ausgeschlossen.',
      en: 'NATIVE = already base currency; CONVERTED = converted; EXCLUDED_* = excluded from KPI.',
    },
  },
  forecastCurrency: {
    id: 'forecastCurrency',
    label: { de: 'Prognose-Basiswährung', en: 'Forecast base currency' },
    description: {
      de: 'Prognosen werden ausschließlich in der Organisationsbasiswährung angezeigt.',
      en: 'Forecasts are displayed only in the organization base currency.',
    },
  },
};
