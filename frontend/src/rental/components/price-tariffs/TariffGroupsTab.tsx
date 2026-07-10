import { CalendarClock, ChevronRight } from 'lucide-react';
import type { PriceTariffCatalog, PriceTariffGroup } from '../../pricing/pricingTypes';
import { buildTariffGroupRowView } from '../../pricing/tariff-catalog-metrics';
import { STATUS_BADGE } from '../../pricing/pricingUtils';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';

interface TariffGroupsTabProps {
  isDarkMode: boolean;
  catalog: PriceTariffCatalog;
  onSelectGroup: (group: PriceTariffGroup) => void;
}

function RateLine({
  prefix,
  summary,
  perDaySuffix,
  variant,
}: {
  prefix: string;
  summary: { dailyGrossLabel: string; depositLabel: string; includedKmPerDay: number | null };
  perDaySuffix: string;
  variant: 'live' | 'draft' | 'scheduled';
}) {
  const km =
    summary.includedKmPerDay != null ? `${summary.includedKmPerDay} km` : null;
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-[11px]',
        variant === 'live' && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.04]',
        variant === 'draft' && 'border-dashed border-border/60 bg-muted/15',
        variant === 'scheduled' && 'border-[color:var(--status-info)]/25 bg-[color:var(--status-info)]/[0.04]',
      )}
    >
      <p
        className={cn(
          'text-[10px] font-bold uppercase tracking-wider',
          variant === 'live' && 'text-[color:var(--status-positive)]',
          variant === 'draft' && 'text-muted-foreground',
          variant === 'scheduled' && 'text-[color:var(--status-info)]',
        )}
      >
        {prefix}
      </p>
      <p className="mt-1 font-medium text-foreground">
        {summary.dailyGrossLabel}
        {perDaySuffix}
        <span className="text-muted-foreground"> · </span>
        {summary.depositLabel}
        {km ? (
          <>
            <span className="text-muted-foreground"> · </span>
            {km}
          </>
        ) : null}
      </p>
    </div>
  );
}

export function TariffGroupsTab({ catalog, onSelectGroup }: TariffGroupsTabProps) {
  const { t, locale } = useLanguage();
  const perDaySuffix = t('priceTariffs.perDay');
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-GB';

  const rows = catalog.groups.map((group) => buildTariffGroupRowView(group, catalog));

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const badge = STATUS_BADGE[row.status];
        return (
          <button
            key={row.group.id}
            type="button"
            onClick={() => onSelectGroup(row.group)}
            aria-label={`${t('priceTariffs.configureTariff')}: ${row.group.name}`}
            className="group w-full rounded-2xl border border-border/50 surface-premium p-4 text-left shadow-[var(--shadow-1)] transition-colors hover:border-border hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">{row.group.name}</h3>
                  <span
                    className={cn(
                      'inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold',
                      badge.className,
                    )}
                  >
                    {t(badge.labelKey as never)}
                  </span>
                  {row.currency ? (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {row.currency}
                    </span>
                  ) : null}
                </div>
                {row.group.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.group.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>
                    {t('priceTariffs.row.vehicles')}:{' '}
                    <span className="font-semibold tabular-nums text-foreground">{row.vehicleCount}</span>
                  </span>
                  {row.live?.validFrom ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {t('priceTariffs.row.validFrom')}:{' '}
                      {new Date(row.live.validFrom).toLocaleDateString(dateLocale)}
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {row.hasPublishedLive && row.live ? (
                <RateLine
                  prefix={t('priceTariffs.row.live')}
                  summary={row.live}
                  perDaySuffix={perDaySuffix}
                  variant="live"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wider">
                    {t('priceTariffs.row.live')}
                  </p>
                  <p className="mt-1 font-medium">{t('priceTariffs.row.notPublished')}</p>
                </div>
              )}

              {row.draft ? (
                <RateLine
                  prefix={t('priceTariffs.row.draft')}
                  summary={row.draft}
                  perDaySuffix={perDaySuffix}
                  variant="draft"
                />
              ) : (
                <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wider">
                    {t('priceTariffs.row.draft')}
                  </p>
                  <p className="mt-1">{t('priceTariffs.row.noDraft')}</p>
                </div>
              )}
            </div>

            {row.scheduled.length > 0 ? (
              <div className="mt-2 space-y-2">
                {row.scheduled.map((scheduled) => (
                  <div key={`${row.group.id}-v${scheduled.versionNumber}`}>
                    <RateLine
                      prefix={t('priceTariffs.row.scheduled', { version: scheduled.versionNumber })}
                      summary={scheduled}
                      perDaySuffix={perDaySuffix}
                      variant="scheduled"
                    />
                    {scheduled.validFrom ? (
                      <p className="mt-1 pl-1 text-[10px] text-muted-foreground">
                        {t('priceTariffs.row.validFrom')}:{' '}
                        {new Date(scheduled.validFrom).toLocaleDateString(dateLocale)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
