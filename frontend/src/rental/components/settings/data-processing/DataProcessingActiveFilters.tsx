import { X } from 'lucide-react';
import { StatusChip } from '../../../../components/patterns';
import type { DataProcessingSectionFilterState } from '../../../lib/data-processing-list-state';
import { hasActiveFilters } from '../../../lib/data-processing-list-state';
import { useLanguage } from '../../../i18n/LanguageContext';

interface Props {
  filters: DataProcessingSectionFilterState;
  onClear: () => void;
}

export function DataProcessingActiveFilters({ filters, onClear }: Props) {
  const { t } = useLanguage();
  if (!hasActiveFilters(filters)) return null;

  const chips: Array<{ key: string; label: string }> = [];
  if (filters.q) chips.push({ key: 'q', label: `${t('dataProcessing.filters.search')}: ${filters.q}` });
  if (filters.kpi) chips.push({ key: 'kpi', label: t(`dataProcessing.kpi.${filters.kpi}`) });
  if (filters.status) chips.push({ key: 'status', label: filters.status });
  if (filters.riskLevel) chips.push({ key: 'risk', label: filters.riskLevel });
  if (filters.dataCategory) chips.push({ key: 'category', label: filters.dataCategory });

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-label={t('dataProcessing.filters.active')}>
      {chips.map((chip) => (
        <StatusChip key={chip.key} tone="info">
          {chip.label}
        </StatusChip>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <X className="w-3 h-3" aria-hidden />
        {t('dataProcessing.filters.clear')}
      </button>
    </div>
  );
}
