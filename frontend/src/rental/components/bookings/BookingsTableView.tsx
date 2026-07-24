import { useMemo } from 'react';
import { DataTable, EmptyState } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BookingUiRow } from '../../lib/entityMappers';
import { BookingStatusBadge } from './bookingStatus';
import { bookingRef, formatCents, rowStatus } from './bookingUtils';

interface BookingsTableViewProps {
  rows: BookingUiRow[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onEdit?: (id: string) => void;
  onCancel?: (id: string) => void;
}

export function BookingsTableView({
  rows,
  loading,
  onRowClick,
  onEdit,
  onCancel,
}: BookingsTableViewProps) {
  const { t } = useLanguage();

  const columns = useMemo(
    () => [
      {
        key: 'ref',
        header: t('bookings.table.booking'),
        cell: (b: BookingUiRow) => (
          <div>
            <div className="font-mono text-[11px] font-semibold">{bookingRef(b.id)}</div>
            <div className="text-[10px] text-muted-foreground">{b.customer}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: t('bookings.status'),
        cell: (b: BookingUiRow) => <BookingStatusBadge status={rowStatus(b)} />,
      },
      {
        key: 'vehicle',
        header: t('bookings.vehicle'),
        cell: (b: BookingUiRow) => (
          <div className="text-xs">
            <div className="font-medium">{b.vehicle}</div>
            <div className="text-muted-foreground font-mono">{b.plate}</div>
          </div>
        ),
      },
      {
        key: 'period',
        header: t('bookings.period'),
        cell: (b: BookingUiRow) => (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {b.startDate} – {b.endDate}
          </span>
        ),
      },
      {
        key: 'stations',
        header: t('bookings.station'),
        cell: (b: BookingUiRow) => (
          <span className="text-[10px] text-muted-foreground">{b.pickupLocation || '—'}</span>
        ),
      },
      {
        key: 'payment',
        header: t('bookings.amount'),
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
        header: t('bookings.handover'),
        cell: (b: BookingUiRow) => (
          <span className="text-[10px] text-muted-foreground">
            {b.pickupProtocol ? t('bookings.handover.pickupDone') : '—'}
            {b.returnProtocol ? ` · ${t('bookings.handover.returnDone')}` : ''}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)]">
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
          const ref = bookingRef(b.id);
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
                  title={t('bookings.editAction', { ref })}
                  aria-label={t('bookings.editAction', { ref })}
                >
                  <Icon name="pencil" className="w-3 h-3" aria-hidden />
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
                  title={t('bookings.cancelAction', { ref })}
                  aria-label={t('bookings.cancelAction', { ref })}
                >
                  <Icon name="trash-2" className="w-3 h-3" aria-hidden />
                </button>
              )}
            </div>
          );
        }}
        empty={
          <EmptyState
            compact
            icon={<Icon name="calendar" className="w-5 h-5" />}
            title={t('bookings.table.empty')}
          />
        }
      />
    </div>
  );
}
