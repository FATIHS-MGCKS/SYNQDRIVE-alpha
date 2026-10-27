import type { SupportedLocale } from '../../i18n/locales';
import { tireWearV3Cs } from '../../i18n/translations/tire.wearV3.cs';
import { tireWearV3De } from '../../i18n/translations/tire.wearV3.de';
import { tireWearV3En } from '../../i18n/translations/tire.wearV3.en';
import { tireWearV3Es } from '../../i18n/translations/tire.wearV3.es';
import { tireWearV3Fr } from '../../i18n/translations/tire.wearV3.fr';
import { tireWearV3It } from '../../i18n/translations/tire.wearV3.it';
import { tireWearV3Nl } from '../../i18n/translations/tire.wearV3.nl';
import { tireWearV3Pl } from '../../i18n/translations/tire.wearV3.pl';
import { tireWearV3Tr } from '../../i18n/translations/tire.wearV3.tr';

const PACKS: Record<SupportedLocale, Record<string, string>> = {
  de: tireWearV3De,
  en: tireWearV3En,
  pl: tireWearV3Pl,
  fr: tireWearV3Fr,
  cs: tireWearV3Cs,
  nl: tireWearV3Nl,
  es: tireWearV3Es,
  tr: tireWearV3Tr,
  it: tireWearV3It,
};

export function tireWearV3Copy(
  locale: SupportedLocale,
  key: keyof typeof tireWearV3En,
  vars?: Record<string, string | number>,
): string {
  const template = PACKS[locale]?.[key] ?? PACKS.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
    template,
  );
}
