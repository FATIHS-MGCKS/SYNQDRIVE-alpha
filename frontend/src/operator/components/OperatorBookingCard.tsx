import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import {
  bookingStatusTone,
  type BookingUiStatus,
} from '../../rental/components/bookings/bookingStatus';
import type { OperatorHandoverKind, OperatorTodayBookingItem } from '../lib/operatorData';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorStatusChip } from './OperatorStatusChip';
import { pickupDueBadge, returnDueBadge } from '../lib/operatorStatus';

interface OperatorBookingCardProps {
  item: OperatorTodayBookingItem;
  onPickupStart?: () => void;
  onReturnStart?: () => void;
  onDetails?: () => void;
}

export function OperatorBookingCard({
  item,
  onPickupStart,
  onReturnStart,
  onDetails,
}: OperatorBookingCardProps) {
  const kind: OperatorHandoverKind = item.kind;
  const primaryAction =
    kind === 'PICKUP'
      ? { label: 'Pickup starten', gate: item.pickupGate, onClick: onPickupStart }
      : { label: 'Return starten', gate: item.returnGate, onClick: onReturnStart };

  const dueBadge = kind === 'PICKUP' ? pickupDueBadge() : returnDueBadge();

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        className="sq-press flex w-full items-start gap-3 border-b border-border/40 px-4 py-3.5 text-left"
        onClick={onDetails}
      >
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            kind === 'PICKUP'
              ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {kind === 'PICKUP' ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownLeft className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {item.vehicleName}
              {item.plate ? ` · ${item.plate}` : ''}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {item.timeLabel}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.customerName}</span>
          {item.station && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">{item.station}</span>
          )}
          <span className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip tone={bookingStatusTone(item.status as BookingUiStatus)} dot>
              {item.statusLabel}
            </StatusChip>
            {!item.isDone && <OperatorStatusChip badge={dueBadge} />}
            {item.isOverdue && !item.isDone && (
              <OperatorStatusChip badge={{ kind: 'blocked', label: 'Überfällig', tone: 'critical' }} />
            )}
            {item.isDone && (
              <OperatorStatusChip badge={{ kind: 'ready', label: 'Erledigt', tone: 'success' }} />
            )}
          </span>
        </span>
        {onDetails && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {!item.isDone && (
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <button
            type="button"
            disabled={!primaryAction.gate.allowed}
            title={primaryAction.gate.reason}
            onClick={primaryAction.onClick}
            className="sq-press min-h-[48px] flex-1 rounded-xl bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {primaryAction.label}
          </button>
          {onDetails && (
            <button
              type="button"
              onClick={onDetails}
              className="sq-press min-h-[48px] rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground sm:max-w-[120px]"
            >
              Details
            </button>
          )}
        </div>
      )}
      {!item.isDone && !primaryAction.gate.allowed && primaryAction.gate.reason && (
        <p className="border-t border-border/30 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
          {primaryAction.gate.reason}
        </p>
      )}
    </OperatorGlassCard>
  );
}
