import { useMemo } from 'react';
import { DataTable, EmptyState } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { BookingUiRow } from '../../lib/entityMappers';
import type { BookingTableSortBy, BookingTableSortOrder } from './bookingTypes';
import { BookingStatusBadge } from './bookingStatus';
import { bookingRef, formatCents, rowStatus } from './bookingUtils';

interface BookingsTableViewProps {
  rows: BookingUiRow[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onEdit?: (id: string) => void;
  onCancel?: (id: string) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  hasNextPage?: boolean;
  onPageChange?: (page: number) => void;
  sortBy?: BookingTableSortBy;
  sortOrder?: BookingTableSortOrder;
  onSortChange?: (sortBy: BookingTableSortBy) => void;
}

function sortAria(
  column: BookingTableSortBy,
  sortBy?: BookingTableSortBy,
  sortOrder?: BookingTableSortOrder,
): 'ascending' | 'descending' | 'none' {
  if (sortBy !== column) return 'none';
  return sortOrder === 'asc' ? 'ascending' : 'descending';
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSortChange,
}: {
  label: string;
  column: BookingTableSortBy;
  sortBy?: BookingTableSortBy;
  sortOrder?: BookingTableSortOrder;
  onSortChange?: (sortBy: BookingTableSortBy) => void;
}) {
  if (!onSortChange) return label;
  const active = sortBy === column;
  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className={`inline-flex items-center gap-1 font-semibold ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
      {active && (
        <Icon
          name={sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'}
          className="w-3 h-3"
          aria-hidden
        />
      )}
    </button>
  );
}

export function BookingsTableView({
  rows,
  loading,
  onRowClick,
  onEdit,
  onCancel,
  page = 1,
  pageSize = 50,
  total,
  hasNextPage = false,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}: BookingsTableViewProps) {
  const columns = useMemo(
    () => [
      {
        key: 'ref',
        header: (
          <SortableHeader
            label="Buchung"
            column="createdAt"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={onSortChange}
          />
        ),
        ariaSort: sortAria('createdAt', sortBy, sortOrder),
        cell: (b: BookingUiRow) => (
          <div>
            <div className="font-mono text-[11px] font-semibold">{bookingRef(b.id)}</div>
            <div className="text-[10px] text-muted-foreground">{b.customer}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (b: BookingUiRow) => <BookingStatusBadge status={rowStatus(b)} />,
      },
      {
        key: 'vehicle',
        header: 'Fahrzeug',
        cell: (b: BookingUiRow) => (
          <div className="text-xs">
            <div className="font-medium">{b.vehicle}</div>
            <div className="text-muted-foreground font-mono">{b.plate}</div>
          </div>
        ),
      },
      {
        key: 'period',
        header: (
          <SortableHeader
            label="Zeitraum"
            column="startDate"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={onSortChange}
          />
        ),
        ariaSort: sortAria('startDate', sortBy, sortOrder),
        cell: (b: BookingUiRow) => (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {b.startDate} – {b.endDate}
          </span>
        ),
      },
      {
        key: 'stations',
        header: 'Station',
        cell: (b: BookingUiRow) => (
          <span className="text-[10px] text-muted-foreground">{b.pickupLocation || '—'}</span>
        ),
      },
      {
        key: 'payment',
        header: 'Betrag',
        align: 'right' as const,
        numeric: true,
        cell: (b: BookingUiRow) => (
          <span className="text-[11px] font-semibold tabular-nums">
            {formatCents(b.totalPriceCents, String(b._raw && typeof b._raw === 'object' && 'currency' in b._raw ? (b._raw as { currency?: string }).currency : 'EUR'))}
          </span>
        ),
      },
      {
        key: 'handover',
        header: 'Übergabe',
        cell: (b: BookingUiRow) => (
          <span className="text-[10px] text-muted-foreground">
            {b.pickupProtocol ? 'Pickup ✓' : '—'}
            {b.returnProtocol ? ' · Return ✓' : ''}
          </span>
        ),
      },
    ],
    [onSortChange, sortBy, sortOrder],
  );

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] space-y-3">
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        loading={loading}
        dense
        card={false}
        onRowClick={(b) => onRowClick(b.id)}
        rowActions={(b) => {
          const status = rowStatus(b);
          if (status !== 'pending' && status !== 'confirmed') return null;
          return (
            <div className="flex gap-1">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(b.id);
                  }}
                  className="p-1 rounded-lg sq-tone-brand text-[10px]"
                  title="Bearbeiten"
                >
                  <Icon name="pencil" className="w-3 h-3" />
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(b.id);
                  }}
                  className="p-1 rounded-lg sq-tone-critical text-[10px]"
                  title="Stornieren"
                >
                  <Icon name="trash-2" className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        }}
        empty={
          <EmptyState
            compact
            icon={<Icon name="calendar" className="w-5 h-5" />}
            title="Keine Buchungen für die aktuellen Filter"
          />
        }
      />
      {onPageChange && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
          <span>
            {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} von {total ?? rows.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="px-2 py-1 rounded border border-border disabled:opacity-40"
            >
              Zurück
            </button>
            <button
              type="button"
              disabled={!hasNextPage || loading}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 rounded border border-border disabled:opacity-40"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
