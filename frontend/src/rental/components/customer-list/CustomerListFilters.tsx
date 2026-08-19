import { memo, useMemo } from 'react';

import { useLanguage } from '../../../i18n/LanguageContext';
import { Button } from '../../../components/ui/button';
import {
  customerRiskUiLabel,
  customerStatusUiLabel,
} from '../../lib/entityMappers';
import { Icon } from '../ui/Icon';

export interface CustomerFilterOption {
  value: string;
  label: string;
}

interface DropdownFilterProps {
  label: string;
  value: string;
  options: CustomerFilterOption[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}

const DropdownFilter = memo(function DropdownFilter({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
}: DropdownFilterProps) {
  const activeLabel = value === 'all' ? label : options.find((o) => o.value === value)?.label;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
          value !== 'all'
            ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
            : 'border-border surface-premium text-foreground hover:bg-muted'
        }`}
      >
        <span>{activeLabel}</span>
        <Icon
          name="chevron-down"
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen ? (
        <div className="sq-overlay absolute left-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onSelect(o.value);
                onToggle();
              }}
              className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                o.value === value
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export interface CustomerListFiltersProps {
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  statusFilter: string;
  riskFilter: string;
  typeFilter: string;
  cardFilter: string;
  filteredCount: number;
  totalCount: number;
  isStatusOpen: boolean;
  isRiskOpen: boolean;
  isTypeOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  onRiskOpenChange: (open: boolean) => void;
  onTypeOpenChange: (open: boolean) => void;
  onStatusFilterChange: (value: string) => void;
  onRiskFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onClearCardFilter: () => void;
  onResetFilters: () => void;
}

export const CustomerListFilters = memo(function CustomerListFilters({
  searchDraft,
  onSearchDraftChange,
  statusFilter,
  riskFilter,
  typeFilter,
  cardFilter,
  filteredCount,
  totalCount,
  isStatusOpen,
  isRiskOpen,
  isTypeOpen,
  onStatusOpenChange,
  onRiskOpenChange,
  onTypeOpenChange,
  onStatusFilterChange,
  onRiskFilterChange,
  onTypeFilterChange,
  onClearCardFilter,
  onResetFilters,
}: CustomerListFiltersProps) {
  const { t, locale } = useLanguage();

  const statusOptions = useMemo<CustomerFilterOption[]>(
    () => [
      { value: 'all', label: t('customers.filter.allStatus') },
      { value: 'Active', label: customerStatusUiLabel('Active', locale) },
      { value: 'Under Review', label: customerStatusUiLabel('Under Review', locale) },
      { value: 'Suspended', label: customerStatusUiLabel('Suspended', locale) },
      { value: 'Blocked', label: customerStatusUiLabel('Blocked', locale) },
    ],
    [t, locale],
  );

  const riskOptions = useMemo<CustomerFilterOption[]>(
    () => [
      { value: 'all', label: t('customers.filter.allRisk') },
      { value: 'Not Assessed', label: customerRiskUiLabel('Not Assessed', locale) },
      { value: 'Low Risk', label: customerRiskUiLabel('Low Risk', locale) },
      { value: 'Medium Risk', label: customerRiskUiLabel('Medium Risk', locale) },
      { value: 'High Risk', label: customerRiskUiLabel('High Risk', locale) },
    ],
    [t, locale],
  );

  const typeOptions = useMemo<CustomerFilterOption[]>(
    () => [
      { value: 'all', label: t('customers.filter.allTypes') },
      { value: 'Individual', label: t('customers.type.individual') },
      { value: 'Corporate', label: t('customers.type.corporate') },
    ],
    [t],
  );

  const hasActiveFilters =
    statusFilter !== 'all' ||
    riskFilter !== 'all' ||
    typeFilter !== 'all' ||
    searchDraft.trim().length > 0;

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold text-foreground">{t('customers.filter.title')}</h2>
          <p className="text-[11px] text-muted-foreground">
            {t('customers.filter.count', { filtered: filteredCount, total: totalCount })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {cardFilter !== 'all' ? (
            <Button type="button" size="sm" variant="outline" onClick={onClearCardFilter}>
              {t('customers.filter.segmentClear')}
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}>
              <Icon name="x" className="size-3.5" />
              {t('common.reset')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder={t('customers.filter.searchPlaceholder')}
            value={searchDraft}
            onChange={(e) => onSearchDraftChange(e.target.value)}
            aria-label={t('customers.filter.searchAria')}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)]"
          />
        </div>
        <DropdownFilter
          label={t('common.status')}
          value={statusFilter}
          isOpen={isStatusOpen}
          onToggle={() => {
            onStatusOpenChange(!isStatusOpen);
            onRiskOpenChange(false);
            onTypeOpenChange(false);
          }}
          onSelect={onStatusFilterChange}
          options={statusOptions}
        />
        <DropdownFilter
          label={t('customers.filter.riskLabel')}
          value={riskFilter}
          isOpen={isRiskOpen}
          onToggle={() => {
            onRiskOpenChange(!isRiskOpen);
            onStatusOpenChange(false);
            onTypeOpenChange(false);
          }}
          onSelect={onRiskFilterChange}
          options={riskOptions}
        />
        <DropdownFilter
          label={t('customers.filter.typeLabel')}
          value={typeFilter}
          isOpen={isTypeOpen}
          onToggle={() => {
            onTypeOpenChange(!isTypeOpen);
            onStatusOpenChange(false);
            onRiskOpenChange(false);
          }}
          onSelect={onTypeFilterChange}
          options={typeOptions}
        />
      </div>
    </div>
  );
});
