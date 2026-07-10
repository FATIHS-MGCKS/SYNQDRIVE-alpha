import type { TariffCompareField } from '../../../pricing/tariff-live-draft-compare';
import { useLanguage } from '../../../i18n/LanguageContext';
import { cn } from '../../../../components/ui/utils';

interface TariffEditorLiveDraftCompareProps {
  liveVersionNumber: number | null;
  draftVersionNumber: number | null;
  liveValidFrom: string | null;
  fields: TariffCompareField[];
}

export function TariffEditorLiveDraftCompare({
  liveVersionNumber,
  draftVersionNumber,
  liveValidFrom,
  fields,
}: TariffEditorLiveDraftCompareProps) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-GB';
  const changedCount = fields.filter((f) => f.changed).length;

  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-muted/15 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t('priceTariffs.editor.compare.title')}
        </h4>
        {changedCount > 0 ? (
          <span
            className="rounded-md bg-[color:var(--status-watch)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--status-watch)]"
            aria-live="polite"
          >
            {t('priceTariffs.editor.compare.changedCount', { count: changedCount })}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.04] p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--status-positive)]">
            {t('priceTariffs.editor.compare.liveTitle')}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-foreground">
            {liveVersionNumber != null
              ? t('priceTariffs.editor.compare.version', { version: liveVersionNumber })
              : t('priceTariffs.row.notPublished')}
          </p>
          {liveValidFrom ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t('priceTariffs.row.validFrom')}:{' '}
              {new Date(liveValidFrom).toLocaleDateString(dateLocale)}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('priceTariffs.editor.compare.draftTitle')}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-foreground">
            {draftVersionNumber != null
              ? t('priceTariffs.editor.compare.version', { version: draftVersionNumber })
              : t('priceTariffs.editor.compare.newDraft')}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {fields.map((field) => (
          <li
            key={field.key}
            className={cn(
              'rounded-md px-2 py-1.5 text-[11px] sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2',
              field.changed && 'bg-[color:var(--status-watch)]/[0.08]',
            )}
          >
            <span className="truncate text-muted-foreground">{t(field.labelKey as never)}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">→</span>
            <div className="mt-1 sm:mt-0 sm:text-right">
              <span className={cn('tabular-nums', field.changed && 'font-semibold text-foreground')}>
                {field.draftLabel}
              </span>
              {field.changed ? (
                <span className="ml-1 text-[10px] text-muted-foreground line-through">
                  {field.liveLabel}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
