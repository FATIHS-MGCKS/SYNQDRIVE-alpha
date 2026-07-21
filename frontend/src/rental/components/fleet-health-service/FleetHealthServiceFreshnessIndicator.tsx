import { Info } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { useFleetHealthServiceFreshness } from './useFleetHealthServiceFreshness';
import { fhs } from './fleet-health-service-shell';

export function FleetHealthServiceFreshnessIndicator({
  className,
}: {
  className?: string;
}) {
  const { locale } = useLanguage();
  const { compactLabel, compactLabelDe, detailRowsDe, detailRowsEn } =
    useFleetHealthServiceFreshness();
  const label = locale === 'de' ? compactLabelDe : compactLabel;
  const detailRows = locale === 'de' ? detailRowsDe : detailRowsEn;

  if (!label) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex max-w-full items-center gap-1 text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground ${className ?? ''}`}
        >
          <span className="truncate">{label}</span>
          <Info className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className={fhs.sectionLabel}>
          {locale === 'de' ? 'Datenaktualität' : 'Data freshness'}
        </p>
        <dl className="mt-2 space-y-1.5">
          {detailRows.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
