import { ArrowDownLeft, ArrowUpRight, ChevronRight, FilePenLine } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import {
  bookingStatusTone,
  type BookingUiStatus,
} from '../../rental/components/bookings/bookingStatus';
import { bookingRef } from '../../rental/components/bookings/bookingUtils';
import type { OperatorHandoverKind, OperatorTodayBookingItem } from '../lib/operatorData';
import type { OperatorHandoverDraftHint } from '../handover/useOperatorHandoverDraftHints';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorStatusChip } from './OperatorStatusChip';
import { pickupDueBadge, returnDueBadge } from '../lib/operatorStatus';

interface OperatorBookingCardProps {
  item: OperatorTodayBookingItem;
  draftHint?: OperatorHandoverDraftHint;
  onPickupStart?: () => void;
  onReturnStart?: () => void;
  onDetails?: () => void;
}

export function OperatorBookingCard({
  item,
  draftHint,
  onPickupStart,
  onReturnStart,
  onDetails,
}: OperatorBookingCardProps) {
  const kind: OperatorHandoverKind = item.kind;
  const hasMatchingDraft = draftHint?.kind === kind;
  const primaryAction =
    kind === 'PICKUP'
      ? {
          label: hasMatchingDraft ? 'Übergabe fortsetzen' : 'Übergabe starten',
          gate: item.pickupGate,
          onClick: onPickupStart,
        }
      : {
          label: hasMatchingDraft ? 'Rückgabe fortsetzen' : 'Rückgabe starten',
          gate: item.returnGate,
          onClick: onReturnStart,
        };

  const dueBadge = kind === 'PICKUP' ? pickupDueBadge() : returnDueBadge();

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        className="sq-press flex w-full items-start gap-3 border-b border-border/40 px-4 py-3.5 text-left"
        onClick={onDetails}
        aria-label={`Buchung ${bookingRef(item.bookingId)}: ${item.vehicleName}${item.plate ? `, ${item.plate}` : ''}, ${item.customerName}`}
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
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {item.customerName}
            <span className="text-muted-foreground/70"> · </span>
            <span className="font-mono text-[11px]">{bookingRef(item.bookingId)}</span>
          </span>
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
            {hasMatchingDraft && !item.isDone && (
              <OperatorStatusChip
                badge={{
                  kind: 'task_open',
                  label: `Entwurf · ${draftHint.stepLabel}`,
                  tone: 'info',
                }}
              />
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
            title={primaryAction.gate.reason ?? undefined}
            aria-label={
              primaryAction.gate.allowed
                ? primaryAction.label
                : `${primaryAction.label} nicht verfügbar: ${primaryAction.gate.reason ?? 'Unbekannter Grund'}`
            }
            onClick={primaryAction.onClick}
            className="sq-press min-h-[48px] flex-1 rounded-xl bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {primaryAction.label}
          </button>
          {onDetails && (
            <button
              type="button"
              onClick={onDetails}
              className="sq-press min-h-[48px] rounded-xl border border-border/70 surface-premium px-4 text-sm font-semibold text-foreground sm:max-w-[120px]"
            >
              Details
            </button>
          )}
        </div>
      )}
      {!item.isDone && hasMatchingDraft && (
        <p className="flex items-center gap-1.5 border-t border-border/30 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
          <FilePenLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Entwurf fortsetzen — Schritt {draftHint.stepLabel}
        </p>
      )}
      {!item.isDone && !primaryAction.gate.allowed && primaryAction.gate.reason && (
        <p
          className="border-t border-border/30 px-4 py-2 text-[11px] leading-snug text-[color:var(--status-watch)]"
          role="status"
        >
          Blockiert: {primaryAction.gate.reason}
        </p>
      )}
    </OperatorGlassCard>
  );
}
