import { Icon } from '../ui/Icon';
import {
  INVOICE_DIRECTION_OPTIONS,
  INVOICE_STATUS_FILTER_OPTIONS,
  type InvoiceDirectionFilter,
} from './invoiceConstants';
import { STATUS_MAP } from './invoiceFormatters';
import type { InvoiceThemeClasses } from './invoiceTheme';

export interface InvoiceFiltersProps extends InvoiceThemeClasses {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  directionFilter: InvoiceDirectionFilter;
  onDirectionFilterChange: (value: InvoiceDirectionFilter) => void;
  isDirectionOpen: boolean;
  onDirectionOpenChange: (open: boolean) => void;
  isStatusOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  filteredCount: number;
  totalCount: number;
  statusCount: (status: string) => number;
  directionCount: (direction: InvoiceDirectionFilter) => number;
  activeDirectionLabel: string;
  activeStatusLabel: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function InvoiceFilters({
  isDarkMode,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  directionFilter,
  onDirectionFilterChange,
  isDirectionOpen,
  onDirectionOpenChange,
  isStatusOpen,
  onStatusOpenChange,
  filteredCount,
  totalCount,
  statusCount,
  directionCount,
  activeDirectionLabel,
  activeStatusLabel,
  hasActiveFilters,
  onClearFilters,
}: InvoiceFiltersProps) {
  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Showing {filteredCount} of {totalCount} invoices
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {directionFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onDirectionFilterChange('all')}
              className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand"
            >
              {activeDirectionLabel} active ×
            </button>
          )}
          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onStatusFilterChange('all')}
              className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-warning"
            >
              {activeStatusLabel} active ×
            </button>
          )}
          {searchTerm && (
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
              Search active
            </span>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                isDarkMode
                  ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50'
                  : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              }`}
            >
              <Icon name="x" className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Rechnung, Nummer oder Lieferant suchen..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-xs outline-none transition-all ${
              isDarkMode
                ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-ring'
                : 'bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-brand'
            }`}
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              onDirectionOpenChange(!isDirectionOpen);
              onStatusOpenChange(false);
            }}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
              directionFilter !== 'all'
                ? isDarkMode
                  ? 'bg-brand-soft border-brand/25 text-brand'
                  : 'bg-status-info-soft border-status-info/25 text-status-info'
                : isDarkMode
                  ? 'bg-muted border-border text-foreground/90 hover:bg-muted/80'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{activeDirectionLabel}</span>
            <Icon
              name="chevron-down"
              className={`h-3.5 w-3.5 transition-transform ${isDirectionOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isDirectionOpen && (
            <div
              className={`absolute left-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border shadow-xl ${
                isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'
              }`}
            >
              {INVOICE_DIRECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onDirectionFilterChange(option.value);
                    onDirectionOpenChange(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    option.value === directionFilter
                      ? isDarkMode
                        ? 'bg-brand-soft text-brand'
                        : 'bg-status-info-soft text-status-info'
                      : isDarkMode
                        ? 'text-foreground/90 hover:bg-muted'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                    {directionCount(option.value)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              onStatusOpenChange(!isStatusOpen);
              onDirectionOpenChange(false);
            }}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
              statusFilter !== 'all'
                ? isDarkMode
                  ? 'bg-brand-soft border-brand/25 text-brand'
                  : 'bg-status-info-soft border-status-info/25 text-status-info'
                : isDarkMode
                  ? 'bg-muted border-border text-foreground/90 hover:bg-muted/80'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{activeStatusLabel}</span>
            <Icon
              name="chevron-down"
              className={`h-3.5 w-3.5 transition-transform ${isStatusOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isStatusOpen && (
            <div
              className={`absolute right-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'
              }`}
            >
              {INVOICE_STATUS_FILTER_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    onStatusFilterChange(status);
                    onStatusOpenChange(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    status === statusFilter
                      ? isDarkMode
                        ? 'bg-brand-soft text-brand'
                        : 'bg-status-info-soft text-status-info'
                      : isDarkMode
                        ? 'text-foreground/90 hover:bg-muted'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{status === 'all' ? 'Alle Status' : STATUS_MAP[status]?.label || status}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                    {statusCount(status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
