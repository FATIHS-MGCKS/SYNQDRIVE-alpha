import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES } from '../locales';
import { useLanguage } from '../LanguageContext';

export type LanguageSelectorVariant = 'login-menu' | 'topbar-pill';

export type LanguageSelectorProps = {
  variant: LanguageSelectorVariant;
  className?: string;
};

export function LanguageSelector({ variant, className }: LanguageSelectorProps) {
  const { locale, setLocale, localeMetadata, t } = useLanguage();
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () =>
      SUPPORTED_LOCALES.map((entry) => ({
        code: entry.code,
        name: entry.nativeName,
        short: entry.code.toUpperCase(),
      })),
    [],
  );

  const selected = options.find((entry) => entry.code === locale) ?? options[0];
  const languageLabel = t('languageSelector.label', { language: selected.name });

  if (variant === 'topbar-pill') {
    return (
      <div className={className ?? 'relative hidden sm:block'}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center justify-center h-8 min-w-[36px] px-2 rounded-md text-[10.5px] font-semibold tracking-[0.06em] font-mono tabular transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-muted sq-press"
          aria-label={languageLabel}
          title={t('languageSelector.selectLanguage')}
          aria-expanded={open}
        >
          {selected.short}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-44 sq-overlay overflow-hidden z-[9999] animate-fade-up" role="menu" aria-label={t('languageSelector.selectLanguage')}>
            {options.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLocale(lang.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-[12.5px] hover:bg-muted ${
                  selected.code === lang.code ? 'bg-muted' : ''
                }`}
              >
                <span className="inline-flex items-center justify-center h-5 min-w-[28px] px-1.5 rounded-sm text-[10px] font-semibold tracking-[0.06em] font-mono tabular bg-muted text-muted-foreground">
                  {lang.short}
                </span>
                <span className="text-foreground">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className ?? 'relative'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="surface-frosted flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border shadow-[var(--shadow-1)] hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        aria-label={t('languageSelector.label', { language: localeMetadata.nativeName })}
        title={t('languageSelector.selectLanguage')}
        aria-expanded={open}
      >
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="inline-flex h-4 min-w-[22px] items-center justify-center rounded-sm bg-muted px-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-muted-foreground">
          {locale.toUpperCase()}
        </span>
        <span className="text-xs text-foreground font-medium">{localeMetadata.nativeName}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-2 w-52 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-[var(--shadow-2)] overflow-hidden animate-fade-up z-[9999]" role="menu" aria-label={t('languageSelector.selectLanguage')}>
            {options.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLocale(lang.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-left transition-all duration-150 ${
                  locale === lang.code
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="font-mono text-[10px] tracking-[0.08em] opacity-70">
                  {lang.short}
                </span>
                {lang.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
