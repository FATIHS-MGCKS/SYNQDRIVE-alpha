import { useMemo } from 'react';
import { Loader2, Mail, MoreHorizontal } from 'lucide-react';
import { DataTable, EmptyState } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Icon } from '../ui/Icon';
import type { BookingUiRow } from '../../lib/entityMappers';
import { bookingRowCanSendDocuments } from '../send-documents-email/send-documents-email.utils';
import { BookingStatusBadge } from './bookingStatus';
import { bookingRef, formatCents, rowStatus } from './bookingUtils';

interface BookingsTableViewProps {
  rows: BookingUiRow[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onEdit?: (id: string) => void;
  onCancel?: (id: string) => void;
  onSendDocuments?: (row: BookingUiRow) => void;
  canSendDocuments?: boolean;
  sendingBookingId?: string | null;
}

export function BookingsTableView({
  rows,
  loading,
  onRowClick,
  onEdit,
  onCancel,
  onSendDocuments,
  canSendDocuments = false,
  sendingBookingId = null,
}: BookingsTableViewProps) {
  const columns = useMemo(
    () => [
      {
        key: 'ref',
        header: 'Buchung',
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
        header: 'Zeitraum',
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
    [],
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
          const showEditCancel = status === 'pending' || status === 'confirmed';
          const showSend =
            canSendDocuments &&
            onSendDocuments &&
            bookingRowCanSendDocuments(b.customerEmail, b.sendableDocumentCount);
          const sending = sendingBookingId === b.id;

          if (!showEditCancel && !showSend) return null;

          return (
            <div className="flex items-center gap-1">
              {showEditCancel && onEdit && (
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
              {showEditCancel && onCancel && (
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
              {showSend && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={sending}
                      onClick={(e) => e.stopPropagation()}
                      title="Weitere Aktionen"
                    >
                      {sending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      disabled={sending}
                      onClick={() => onSendDocuments(b)}
                    >
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      Unterlagen senden
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
    </div>
  );
}
