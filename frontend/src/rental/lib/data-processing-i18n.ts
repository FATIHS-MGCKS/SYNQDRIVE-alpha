import type { TranslationKey } from '../i18n/translations/en';
import { useLanguage } from '../i18n/LanguageContext';

export type LooseTranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** Accept dynamic i18n keys built from wizard/lifecycle constants. */
export function looseTranslate(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): LooseTranslateFn {
  return (key, vars) => t(key as TranslationKey, vars);
}

export function useLooseLanguage() {
  const ctx = useLanguage();
  return {
    ...ctx,
    t: looseTranslate(ctx.t),
  };
}
