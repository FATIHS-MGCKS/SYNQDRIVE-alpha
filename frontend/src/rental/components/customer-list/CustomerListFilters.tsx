import { memo } from 'react';

import { Button } from '../../../components/ui/button';
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

const STATUS_OPTIONS: CustomerFilterOption[] = [
  { value: 'all', label: 'Alle Status' },
  { value: 'Active', label: 'Aktiv' },
  { value: 'Under Review', label: 'In Prüfung' },
  { value: 'Suspended', label: 'Suspendiert' },
  { value: 'Blocked', label: 'Gesperrt' },
];

const RISK_OPTIONS: CustomerFilterOption[] = [
  { value: 'all', label: 'Alle Risikostufen' },
  { value: 'Not Assessed', label: 'Keine Risikobewertung' },
  { value: 'Low Risk', label: 'Niedrig' },
  { value: 'Medium Risk', label: 'Mittel' },
  { value: 'High Risk', label: 'Hoch' },
];

const TYPE_OPTIONS: CustomerFilterOption[] = [
  { value: 'all', label: 'Alle Typen' },
  { value: 'Individual', label: 'Privat' },
  { value: 'Corporate', label: 'Firma' },
];

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
  const hasActiveFilters =
    statusFilter !== 'all' ||
    riskFilter !== 'all' ||
    typeFilter !== 'all' ||
    searchDraft.trim().length > 0;

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold text-foreground">Filter</h2>
          <p className="text-[11px] text-muted-foreground">
            {filteredCount} von {totalCount} Kunden
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {cardFilter !== 'all' ? (
            <Button type="button" size="sm" variant="outline" onClick={onClearCardFilter}>
              Segment ×
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}>
              <Icon name="x" className="size-3.5" />
              Zurücksetzen
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
            placeholder="Name, E-Mail, Telefon oder Firma…"
            value={searchDraft}
            onChange={(e) => onSearchDraftChange(e.target.value)}
            aria-label="Kunden suchen"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)]"
          />
        </div>
        <DropdownFilter
          label="Status"
          value={statusFilter}
          isOpen={isStatusOpen}
          onToggle={() => {
            onStatusOpenChange(!isStatusOpen);
            onRiskOpenChange(false);
            onTypeOpenChange(false);
          }}
          onSelect={onStatusFilterChange}
          options={STATUS_OPTIONS}
        />
        <DropdownFilter
          label="Risiko"
          value={riskFilter}
          isOpen={isRiskOpen}
          onToggle={() => {
            onRiskOpenChange(!isRiskOpen);
            onStatusOpenChange(false);
            onTypeOpenChange(false);
          }}
          onSelect={onRiskFilterChange}
          options={RISK_OPTIONS}
        />
        <DropdownFilter
          label="Typ"
          value={typeFilter}
          isOpen={isTypeOpen}
          onToggle={() => {
            onTypeOpenChange(!isTypeOpen);
            onStatusOpenChange(false);
            onRiskOpenChange(false);
          }}
          onSelect={onTypeFilterChange}
          options={TYPE_OPTIONS}
        />
      </div>
    </div>
  );
});
