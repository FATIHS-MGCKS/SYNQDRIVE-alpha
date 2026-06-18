import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import {
  ctaLabel,
  statusLabel,
  typeLabel,
} from './operationsBuilder';
import type {
  DashboardViewModel,
  OperationCta,
  OperationEventStatus,
  OperationEventType,
  OperationTimelineItem,
  TodayOperationItem,
} from './dashboardTypes';

export type OperationRowItem = OperationTimelineItem | TodayOperationItem;

interface OperationEventRowProps {
  item: OperationRowItem;
  locale: string;
  vm: DashboardViewModel;
  compact?: boolean;
  onOpenVehicleById?: (id: string) => void;
  onOpenBookingById?: (id: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

export function runOperationCta(
  item: OperationRowItem,
  vm: DashboardViewModel,
  handlers: {
    onOpenVehicleById?: (id: string) => void;
    onOpenBookingById?: (id: string) => void;
    onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  },
) {
  switch (item.cta) {
    case 'start-pickup':
      if (item.pickupItem) vm.handleConfirmPickup(item.pickupItem);
      break;
    case 'start-return':
      if (item.returnItem) vm.handleConfirmReturn(item.returnItem);
      break;
    case 'open-vehicle':
      if (item.vehicleId) handlers.onOpenVehicleById?.(item.vehicleId);
      break;
    case 'open-booking':
      if (item.bookingId) handlers.onOpenBookingById?.(item.bookingId);
      else handlers.onOpenRentalView?.('bookings');
      break;
    case 'open-rental':
    default:
      handlers.onOpenRentalView?.('bookings');
      break;
  }
}

function typeIcon(type: OperationEventType) {
  if (type === 'return' || type === 'handover') return 'key';
  if (type === 'cleaning') return 'sparkles';
  if (type === 'maintenance') return 'wrench';
  if (type === 'booking-conflict') return 'alert-triangle';
  return 'car';
}

function statusTone(status: OperationEventStatus) {
  if (status === 'overdue' || status === 'blocked') return 'critical' as const;
  if (status === 'due-soon' || status === 'in-progress') return 'watch' as const;
  if (status === 'completed') return 'success' as const;
  return 'neutral' as const;
}

export function OperationEventRow({
  item,
  locale,
  vm,
  compact,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
}: OperationEventRowProps) {
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };
  const isCompleted = item.completed;

  return (
    <div
      className={[
        'group relative flex flex-col gap-2 rounded-xl border border-border/50 px-3 py-2.5 transition-all',
        isCompleted
          ? 'bg-muted/15 opacity-70'
          : 'bg-card/60 hover:border-border hover:bg-muted/20 hover:shadow-[var(--shadow-1)]',
        compact ? 'py-2' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={[
            'relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.03]',
            isCompleted ? 'bg-muted/50' : item.tone === 'critical' ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/50',
          ].join(' ')}
        >
          <Icon name={typeIcon(item.type)} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold tabular-nums text-foreground">{item.timeLabel}</span>
            <StatusChip tone={statusTone(item.status)} className="text-[9px] uppercase">
              {statusLabel(item.status, locale)}
            </StatusChip>
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {typeLabel(item.type, locale)}
            </span>
          </div>

          <p className={['font-semibold text-foreground', isCompleted ? 'text-[11px]' : 'text-[12px]'].join(' ')}>
            {item.vehicleLabel}
            {item.customer ? (
              <span className="font-normal text-muted-foreground"> · {item.customer}</span>
            ) : null}
          </p>

          {item.station && (
            <p className="text-[10px] text-muted-foreground">{item.station}</p>
          )}

          {item.risks.length > 0 && !isCompleted && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {item.risks.slice(0, 2).map((risk) => (
                <span
                  key={risk}
                  className="rounded-md bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--status-critical)]"
                >
                  {risk}
                </span>
              ))}
            </div>
          )}
        </div>

        {!isCompleted && (
          <button
            type="button"
            onClick={() => runOperationCta(item, vm, handlers)}
            className="sq-btn sq-btn-secondary min-h-9 shrink-0 self-end text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:self-center"
          >
            {ctaLabel(item.cta as OperationCta, locale)}
          </button>
        )}
      </div>
    </div>
  );
}

export function OperationsEmptyState({
  locale,
  variant,
  stationName,
}: {
  locale: string;
  variant: 'timeline' | 'today' | 'station' | 'pickups' | 'returns';
  stationName?: string | null;
}) {
  const de = locale === 'de';
  const messages: Record<typeof variant, { title: string; subtitle: string }> = {
    timeline: {
      title: de ? 'Keine anstehenden Ereignisse' : 'No upcoming events',
      subtitle: de ? 'Im gewählten Zeitraum ist nichts geplant.' : 'Nothing scheduled in this window.',
    },
    today: {
      title: de ? 'Keine Operationen heute' : 'No operations today',
      subtitle: de ? 'Pickups und Returns erscheinen hier automatisch.' : 'Pickups and returns will appear here automatically.',
    },
    station: {
      title: de ? 'Keine Daten für diese Station' : 'No data for this station',
      subtitle: stationName
        ? de
          ? `${stationName} hat heute keine Pickups/Returns.`
          : `${stationName} has no pickups/returns today.`
        : de
          ? 'Wähle eine andere Station oder „Alle Stationen“.'
          : 'Try another station or “All stations”.',
    },
    pickups: {
      title: de ? 'Keine Abholungen heute' : 'No pickups today',
      subtitle: de ? 'Neue Abholungen erscheinen hier.' : 'New pickups will show up here.',
    },
    returns: {
      title: de ? 'Keine Rückgaben heute' : 'No returns today',
      subtitle: de ? 'Rückgaben des Tages erscheinen hier.' : 'Today’s returns will appear here.',
    },
  };
  const msg = messages[variant];

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="sq-tone-neutral flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40">
        <Icon name="calendar" className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[12px] font-semibold text-foreground">{msg.title}</p>
      <p className="max-w-[240px] text-[11px] text-muted-foreground">{msg.subtitle}</p>
    </div>
  );
}
