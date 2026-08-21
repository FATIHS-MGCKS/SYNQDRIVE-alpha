import { useMemo } from 'react';

import type { Station } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  INVOICE_DIRECTION_VALUES,
  INVOICE_DOCUMENT_STATUS_FILTER_VALUES,
  INVOICE_SEND_STATUS_FILTER_VALUES,
  INVOICE_SORT_VALUES,
  INVOICE_STATUS_FILTER_OPTIONS,
  INVOICE_TYPE_FILTER_VALUES,
  labelInvoiceListDirection,
  labelInvoiceListDocumentFilter,
  labelInvoiceListSendFilter,
  labelInvoiceListSortField,
  labelInvoiceListStatus,
  labelInvoiceListType,
  type InvoiceDirectionFilter,
} from '../../lib/invoice-list-i18n';
import { Icon } from '../ui/Icon';
import type { InvoiceListFilters } from './invoiceListState';
import type { InvoiceThemeClasses } from './invoiceTheme';

export interface InvoiceFiltersProps extends InvoiceThemeClasses {
  filters: InvoiceListFilters;
  onPatchFilters: (patch: Partial<InvoiceListFilters>) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  stations: Station[];
  filteredCount: number;
  totalCount: number;
  statusCount: (status: string) => number;
  directionCount: (direction: InvoiceDirectionFilter) => number;
  stationLabel: string | null;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function selectClass(isDarkMode: boolean): string {
  return `rounded-lg border px-3 py-2 text-xs font-medium outline-none transition-all ${
    isDarkMode
      ? 'bg-muted border-border text-foreground focus:border-ring'
      : 'bg-white border-gray-200 text-gray-700 focus:border-brand'
  }`;
}

export function InvoiceFilters({
  isDarkMode,
  filters,
  onPatchFilters,
  searchTerm,
  onSearchTermChange,
  stations,
  filteredCount,
  totalCount,
  statusCount,
  directionCount,
  stationLabel,
  hasActiveFilters,
  onClearFilters,
}: InvoiceFiltersProps) {
  const { locale, t } = useLanguage();

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.direction !== 'all') {
      chips.push({
        key: 'direction',
        label: labelInvoiceListDirection(locale, filters.direction),
        onClear: () => onPatchFilters({ direction: 'all' }),
      });
    }
    if (filters.status !== 'all') {
      chips.push({
        key: 'status',
        label: labelInvoiceListStatus(locale, filters.status),
        onClear: () => onPatchFilters({ status: 'all', overdue: false }),
      });
    }
    if (filters.type !== 'all') {
      chips.push({
        key: 'type',
        label: labelInvoiceListType(locale, filters.type),
        onClear: () => onPatchFilters({ type: 'all' }),
      });
    }
    if (filters.documentStatus !== 'all') {
      chips.push({
        key: 'documentStatus',
        label: labelInvoiceListDocumentFilter(locale, filters.documentStatus),
        onClear: () => onPatchFilters({ documentStatus: 'all' }),
      });
    }
    if (filters.sendStatus !== 'all') {
      chips.push({
        key: 'sendStatus',
        label: labelInvoiceListSendFilter(locale, filters.sendStatus),
        onClear: () => onPatchFilters({ sendStatus: 'all' }),
      });
    }
    if (filters.stationId) {
      chips.push({
        key: 'station',
        label: stationLabel ?? t('invoices.list.filters.stationFallback'),
        onClear: () => onPatchFilters({ stationId: '' }),
      });
    }
    if (filters.dateFrom || filters.dateTo) {
      chips.push({
        key: 'period',
        label: t('invoices.list.filters.chip.period', {
          from: filters.dateFrom || '…',
          to: filters.dateTo || '…',
        }),
        onClear: () => onPatchFilters({ dateFrom: '', dateTo: '' }),
      });
    }
    if (filters.overdue) {
      chips.push({
        key: 'overdue',
        label: t('invoices.list.filters.chip.overdue'),
        onClear: () => onPatchFilters({ overdue: false, status: 'all' }),
      });
    }
    if (searchTerm.trim()) {
      chips.push({
        key: 'search',
        label: t('invoices.list.filters.chip.search', { term: searchTerm.trim() }),
        onClear: () => onSearchTermChange(''),
      });
    }
    return chips;
  }, [filters, locale, onPatchFilters, onSearchTermChange, searchTerm, stationLabel, t]);

  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
              {t('invoices.list.filters.title')}
            </h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t('invoices.list.filters.showing', { visible: filteredCount, total: totalCount })}
            </p>
          </div>
        </div>
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
            {t('invoices.list.filters.clear')}
          </button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label={t('invoices.list.filters.activeAria')}>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold sq-tone-brand"
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative lg:col-span-1">
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            aria-label={t('invoices.list.filters.searchAria')}
            placeholder={t('invoices.list.filters.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-xs outline-none transition-all ${
              isDarkMode
                ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-ring'
                : 'bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-brand'
            }`}
          />
        </div>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.direction')}
          <select
            aria-label={t('invoices.list.filters.directionAria')}
            value={filters.direction}
            onChange={(e) => onPatchFilters({ direction: e.target.value as InvoiceDirectionFilter })}
            className={selectClass(isDarkMode)}
          >
            {INVOICE_DIRECTION_VALUES.map((value) => (
              <option key={value} value={value}>
                {labelInvoiceListDirection(locale, value)} ({directionCount(value)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.status')}
          <select
            aria-label={t('invoices.list.filters.statusAria')}
            value={filters.status}
            onChange={(e) =>
              onPatchFilters({
                status: e.target.value,
                overdue: e.target.value === 'OVERDUE',
              })
            }
            className={selectClass(isDarkMode)}
          >
            {INVOICE_STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'all'
                  ? t('invoices.list.filters.allStatuses')
                  : labelInvoiceListStatus(locale, status)}{' '}
                ({statusCount(status)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.type')}
          <select
            aria-label={t('invoices.list.filters.typeAria')}
            value={filters.type}
            onChange={(e) => onPatchFilters({ type: e.target.value })}
            className={selectClass(isDarkMode)}
          >
            {INVOICE_TYPE_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? t('invoices.list.filters.allTypes')
                  : labelInvoiceListType(locale, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.sort')}
          <div className="flex gap-1.5">
            <select
              aria-label={t('invoices.list.filters.sortAria')}
              value={filters.sortBy}
              onChange={(e) =>
                onPatchFilters({
                  sortBy: e.target.value as InvoiceListFilters['sortBy'],
                })
              }
              className={selectClass(isDarkMode)}
            >
              {INVOICE_SORT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {labelInvoiceListSortField(locale, value)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('invoices.list.filters.sortOrderAria')}
              value={filters.sortOrder}
              onChange={(e) =>
                onPatchFilters({
                  sortOrder: e.target.value as InvoiceListFilters['sortOrder'],
                })
              }
              className={selectClass(isDarkMode)}
            >
              <option value="desc">{t('invoices.list.filters.sortDesc')}</option>
              <option value="asc">{t('invoices.list.filters.sortAsc')}</option>
            </select>
          </div>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.document')}
          <select
            aria-label={t('invoices.list.filters.documentAria')}
            value={filters.documentStatus}
            onChange={(e) =>
              onPatchFilters({
                documentStatus: e.target.value as InvoiceListFilters['documentStatus'],
              })
            }
            className={selectClass(isDarkMode)}
          >
            {INVOICE_DOCUMENT_STATUS_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {labelInvoiceListDocumentFilter(locale, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.send')}
          <select
            aria-label={t('invoices.list.filters.sendAria')}
            value={filters.sendStatus}
            onChange={(e) =>
              onPatchFilters({
                sendStatus: e.target.value as InvoiceListFilters['sendStatus'],
              })
            }
            className={selectClass(isDarkMode)}
          >
            {INVOICE_SEND_STATUS_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {labelInvoiceListSendFilter(locale, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.station')}
          <select
            aria-label={t('invoices.list.filters.stationAria')}
            value={filters.stationId}
            onChange={(e) => onPatchFilters({ stationId: e.target.value })}
            className={selectClass(isDarkMode)}
          >
            <option value="">{t('invoices.list.filters.stationAll')}</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.dateFrom')}
          <input
            type="date"
            aria-label={t('invoices.list.filters.dateFromAria')}
            value={filters.dateFrom}
            onChange={(e) => onPatchFilters({ dateFrom: e.target.value })}
            className={selectClass(isDarkMode)}
          />
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          {t('invoices.list.filters.dateTo')}
          <input
            type="date"
            aria-label={t('invoices.list.filters.dateToAria')}
            value={filters.dateTo}
            onChange={(e) => onPatchFilters({ dateTo: e.target.value })}
            className={selectClass(isDarkMode)}
          />
        </label>
      </div>
    </div>
  );
}
