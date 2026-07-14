import { useMemo } from 'react';

import type { Station } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  INVOICE_DIRECTION_OPTIONS,
  INVOICE_DOCUMENT_STATUS_FILTER_OPTIONS,
  INVOICE_SEND_STATUS_FILTER_OPTIONS,
  INVOICE_SORT_OPTIONS,
  INVOICE_STATUS_FILTER_OPTIONS,
  INVOICE_TYPE_FILTER_OPTIONS,
  type InvoiceDirectionFilter,
} from './invoiceConstants';
import { STATUS_MAP } from './invoiceFormatters';
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
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.direction !== 'all') {
      chips.push({
        key: 'direction',
        label: INVOICE_DIRECTION_OPTIONS.find((o) => o.value === filters.direction)?.label ?? filters.direction,
        onClear: () => onPatchFilters({ direction: 'all' }),
      });
    }
    if (filters.status !== 'all') {
      chips.push({
        key: 'status',
        label: STATUS_MAP[filters.status]?.label ?? filters.status,
        onClear: () => onPatchFilters({ status: 'all', overdue: false }),
      });
    }
    if (filters.type !== 'all') {
      chips.push({
        key: 'type',
        label: INVOICE_TYPE_FILTER_OPTIONS.find((o) => o.value === filters.type)?.label ?? filters.type,
        onClear: () => onPatchFilters({ type: 'all' }),
      });
    }
    if (filters.documentStatus !== 'all') {
      chips.push({
        key: 'documentStatus',
        label:
          INVOICE_DOCUMENT_STATUS_FILTER_OPTIONS.find((o) => o.value === filters.documentStatus)?.label ??
          filters.documentStatus,
        onClear: () => onPatchFilters({ documentStatus: 'all' }),
      });
    }
    if (filters.sendStatus !== 'all') {
      chips.push({
        key: 'sendStatus',
        label:
          INVOICE_SEND_STATUS_FILTER_OPTIONS.find((o) => o.value === filters.sendStatus)?.label ??
          filters.sendStatus,
        onClear: () => onPatchFilters({ sendStatus: 'all' }),
      });
    }
    if (filters.stationId) {
      chips.push({
        key: 'station',
        label: stationLabel ?? 'Station',
        onClear: () => onPatchFilters({ stationId: '' }),
      });
    }
    if (filters.dateFrom || filters.dateTo) {
      chips.push({
        key: 'period',
        label: `Zeitraum ${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`,
        onClear: () => onPatchFilters({ dateFrom: '', dateTo: '' }),
      });
    }
    if (filters.overdue) {
      chips.push({
        key: 'overdue',
        label: 'Überfällig',
        onClear: () => onPatchFilters({ overdue: false, status: 'all' }),
      });
    }
    if (searchTerm.trim()) {
      chips.push({
        key: 'search',
        label: `Suche: ${searchTerm.trim()}`,
        onClear: () => onSearchTermChange(''),
      });
    }
    return chips;
  }, [filters, onPatchFilters, onSearchTermChange, searchTerm, stationLabel]);

  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filter</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {filteredCount} von {totalCount} Rechnungen
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
            Filter zurücksetzen
          </button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Aktive Filter">
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
            aria-label="Rechnungen durchsuchen"
            placeholder="Nr., Kunde, Buchung, Kennzeichen…"
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
          Richtung
          <select
            aria-label="Richtung filtern"
            value={filters.direction}
            onChange={(e) => onPatchFilters({ direction: e.target.value as InvoiceDirectionFilter })}
            className={selectClass(isDarkMode)}
          >
            {INVOICE_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({directionCount(option.value)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Status
          <select
            aria-label="Status filtern"
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
                {status === 'all' ? 'Alle Status' : STATUS_MAP[status]?.label || status} (
                {statusCount(status)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Rechnungstyp
          <select
            aria-label="Rechnungstyp filtern"
            value={filters.type}
            onChange={(e) => onPatchFilters({ type: e.target.value })}
            className={selectClass(isDarkMode)}
          >
            {INVOICE_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Sortierung
          <div className="flex gap-1.5">
            <select
              aria-label="Sortierung"
              value={filters.sortBy}
              onChange={(e) =>
                onPatchFilters({
                  sortBy: e.target.value as InvoiceListFilters['sortBy'],
                })
              }
              className={selectClass(isDarkMode)}
            >
              {INVOICE_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sortierrichtung"
              value={filters.sortOrder}
              onChange={(e) =>
                onPatchFilters({
                  sortOrder: e.target.value as InvoiceListFilters['sortOrder'],
                })
              }
              className={selectClass(isDarkMode)}
            >
              <option value="desc">Absteigend</option>
              <option value="asc">Aufsteigend</option>
            </select>
          </div>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Dokument
          <select
            aria-label="Dokumentstatus filtern"
            value={filters.documentStatus}
            onChange={(e) =>
              onPatchFilters({
                documentStatus: e.target.value as InvoiceListFilters['documentStatus'],
              })
            }
            className={selectClass(isDarkMode)}
          >
            {INVOICE_DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Versand
          <select
            aria-label="Versandstatus filtern"
            value={filters.sendStatus}
            onChange={(e) =>
              onPatchFilters({
                sendStatus: e.target.value as InvoiceListFilters['sendStatus'],
              })
            }
            className={selectClass(isDarkMode)}
          >
            {INVOICE_SEND_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Station
          <select
            aria-label="Station filtern"
            value={filters.stationId}
            onChange={(e) => onPatchFilters({ stationId: e.target.value })}
            className={selectClass(isDarkMode)}
          >
            <option value="">Alle Stationen</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Von
          <input
            type="date"
            aria-label="Rechnungsdatum von"
            value={filters.dateFrom}
            onChange={(e) => onPatchFilters({ dateFrom: e.target.value })}
            className={selectClass(isDarkMode)}
          />
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Bis
          <input
            type="date"
            aria-label="Rechnungsdatum bis"
            value={filters.dateTo}
            onChange={(e) => onPatchFilters({ dateTo: e.target.value })}
            className={selectClass(isDarkMode)}
          />
        </label>
      </div>
    </div>
  );
}
