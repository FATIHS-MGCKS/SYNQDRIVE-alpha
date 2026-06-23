import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
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
        'group relative flex flex-col gap-1.5 rounded-lg border border-border/35 px-2.5 py-1.5 transition-colors',
        isCompleted
          ? 'bg-muted/10 opacity-70'
          : 'bg-card/35 hover:border-border/60 hover:bg-muted/20',
        compact ? 'py-1.5' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div
          className={[
            'relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-[1.03]',
            isCompleted ? 'bg-muted/45' : item.tone === 'critical' ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/45',
          ].join(' ')}
        >
          <Icon name={typeIcon(item.type)} className="h-3 w-3" />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[10.5px] font-bold tabular-nums text-foreground">{item.timeLabel}</span>
            <StatusChip tone={statusTone(item.status)} className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">
              {statusLabel(item.status, locale)}
            </StatusChip>
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {typeLabel(item.type, locale)}
            </span>
          </div>

          <p
            className={cn(
              'text-[11px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty',
              isCompleted && 'text-[10.5px]',
            )}
          >
            {item.vehicleLabel}
            {item.customer ? (
              <span className="font-normal text-muted-foreground"> · {item.customer}</span>
            ) : null}
          </p>

          {item.station && (
            <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground">{item.station}</p>
          )}

          {item.risks.length > 0 && !isCompleted && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {item.risks.slice(0, 2).map((risk) => (
                <span
                  key={risk}
                  className="rounded-md bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-1.5 py-0.5 text-[9.5px] font-medium text-[color:var(--status-critical)]"
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
            className="sq-press inline-flex min-h-9 w-full shrink-0 items-center justify-center rounded-md px-1.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:w-[116px] sm:self-center"
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
    <div className="flex flex-col items-center gap-1.5 px-4 py-5 text-center">
      <div className="sq-tone-neutral flex h-7 w-7 items-center justify-center rounded-lg bg-muted/35">
        <Icon name="calendar" className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="text-[11px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
        {msg.title}
      </p>
      <p className="max-w-[230px] text-[10.5px] leading-snug text-muted-foreground text-pretty">
        {msg.subtitle}
      </p>
    </div>
  );
}
