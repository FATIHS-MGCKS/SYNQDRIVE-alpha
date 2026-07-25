import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, X, Ban, UserX, ClipboardCheck, FilePenLine } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { useRentalOrg } from '../../rental/RentalContext';
import { bookingStatusLabel, normalizeBookingStatus } from '../../rental/components/bookings/bookingStatus';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorBookingDocumentsPanel } from '../documents/OperatorBookingDocumentsPanel';
import { useOperatorBookingContext } from '../documents/useOperatorBookingContext';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import {
  getOperatorHandoverDraftHint,
  useOperatorHandoverDraftHints,
} from '../handover/useOperatorHandoverDraftHints';
import { OperatorGlassCard } from './OperatorGlassCard';

interface OperatorBookingDetailSheetProps {
  item: OperatorTodayBookingItem | null;
  onClose: () => void;
  onPickupStart: (item: OperatorTodayBookingItem) => void;
  onReturnStart: (item: OperatorTodayBookingItem) => void;
}

export function OperatorBookingDetailSheet({
  item,
  onClose,
  onPickupStart,
  onReturnStart,
}: OperatorBookingDetailSheetProps) {
  const { orgId } = useRentalOrg();
  const { openSheet, triggerRefresh } = useOperatorShell();
  const { context, loading, error } = useOperatorBookingContext(
    orgId ?? undefined,
    item?.bookingId,
    'DOCUMENT_CHECK',
  );

  const draftTargets = useMemo(
    () => (item ? [{ bookingId: item.bookingId, kind: item.kind }] : []),
    [item],
  );
  const draftHints = useOperatorHandoverDraftHints(orgId ?? undefined, draftTargets);
  const pickupDraft = item
    ? getOperatorHandoverDraftHint(draftHints, item.bookingId, 'PICKUP')
    : undefined;
  const returnDraft = item
    ? getOperatorHandoverDraftHint(draftHints, item.bookingId, 'RETURN')
    : undefined;

  if (!item) return null;

  const status = context
    ? normalizeBookingStatus(context.handover.statusEnum, context.status)
    : item.status;
  const pickupGate = context
    ? { allowed: context.canStartPickup, reason: context.canStartPickup ? undefined : 'Pickup nicht verfügbar' }
    : item.pickupGate;
  const returnGate = context
    ? { allowed: context.canStartReturn, reason: context.canStartReturn ? undefined : 'Return nicht verfügbar' }
    : item.returnGate;
  const noShowGate = context?.actions.markNoShow ?? { allowed: false, reason: 'Details nicht geladen' };

  const openBookingAction = (
    type: 'booking-edit' | 'booking-cancel' | 'booking-no-show',
  ) => {
    onClose();
    openSheet({
      type,
      bookingId: item.bookingId,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Buchung</p>
          <h2 className="truncate text-base font-bold text-foreground">
            {item.vehicleName} · {item.plate}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-4">
        <OperatorGlassCard className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info" dot>
              {bookingStatusLabel(status)}
            </StatusChip>
            <StatusChip tone="neutral">
              {!item.station ? 'Buchung' : item.kind === 'PICKUP' ? 'Abholung' : 'Rückgabe'}
            </StatusChip>
          </div>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Kunde</dt>
              <dd className="font-medium">{item.customerName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Station</dt>
              <dd>
                {(context?.pickupStation.name ?? context?.returnStation.name ?? item.station) || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Zeit</dt>
              <dd>{item.timeLabel}</dd>
            </div>
          </dl>
        </OperatorGlassCard>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-[color:var(--status-critical)]">{error}</p>}

        {context && context.health.rentalBlocked && (
          <OperatorGlassCard className="border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
            <p className="text-sm font-semibold text-[color:var(--status-critical)]">Fahrzeug blockiert</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {context.health.blockingReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </OperatorGlassCard>
        )}

        <OperatorGlassCard className="p-4">
          <OperatorBookingDocumentsPanel
            orgId={orgId}
            bookingId={item.bookingId}
            customerId={context?.customer.customerId}
            process="DOCUMENT_CHECK"
            onAiUpload={
              context
                ? () => {
                    openSheet({
                      type: 'ai-upload',
                      vehicleId: context.vehicle.vehicleId,
                      vehicleLabel: `${context.vehicle.displayName} · ${context.vehicle.licensePlate ?? ''}`,
                      bookingId: context.bookingId,
                      customerId: context.customer.customerId,
                      customerName: context.customer.displayName ?? item.customerName,
                      contextMode: 'booking',
                    });
                  }
                : undefined
            }
          />
        </OperatorGlassCard>

        {context && item.kind === 'PICKUP' && (
          <OperatorGlassCard className="p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Dokumentenprüfung
            </p>
            <button
              type="button"
              onClick={() =>
                openSheet({
                  type: 'pickup-verification',
                  customerId: context.customer.customerId,
                  bookingId: context.bookingId,
                  customerName: context.customer.displayName ?? item.customerName,
                  onSuccess: () => triggerRefresh(),
                })
              }
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border/60 px-4 text-left"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold">Prüfung beim Pickup erfassen</span>
            </button>
          </OperatorGlassCard>
        )}

        {context && (
          <OperatorGlassCard className="space-y-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Buchung verwalten
            </p>
            <button
              type="button"
              disabled={!context.actions.edit.allowed}
              title={context.actions.edit.reason ?? undefined}
              onClick={() => openBookingAction('booking-edit')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border/60 px-4 text-left disabled:opacity-45"
            >
              <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold">Bearbeiten</span>
            </button>
            <button
              type="button"
              disabled={!context.actions.cancel.allowed}
              title={context.actions.cancel.reason ?? undefined}
              onClick={() => openBookingAction('booking-cancel')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[color:var(--status-critical)]/30 px-4 text-left disabled:opacity-45"
            >
              <Ban className="h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
              <span className="text-sm font-semibold text-[color:var(--status-critical)]">
                Buchung stornieren
              </span>
            </button>
            <button
              type="button"
              disabled={!noShowGate.allowed}
              title={noShowGate.reason ?? undefined}
              onClick={() => openBookingAction('booking-no-show')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[color:var(--status-critical)]/30 px-4 text-left disabled:opacity-45"
            >
              <UserX className="h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
              <span className="text-sm font-semibold text-[color:var(--status-critical)]">
                No-Show markieren
              </span>
            </button>
          </OperatorGlassCard>
        )}

        {(pickupDraft || returnDraft) && (
          <OperatorGlassCard className="border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FilePenLine className="h-4 w-4 shrink-0" aria-hidden />
              Offener Handover-Entwurf
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {pickupDraft && <li>Pickup — Schritt {pickupDraft.stepLabel}</li>}
              {returnDraft && <li>Return — Schritt {returnDraft.stepLabel}</li>}
            </ul>
          </OperatorGlassCard>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            disabled={!pickupGate.allowed}
            title={pickupGate.reason}
            onClick={() => {
              onClose();
              onPickupStart(item);
            }}
            className="sq-3d-btn sq-3d-btn--primary min-h-[48px] font-semibold disabled:opacity-45"
          >
            {pickupDraft ? 'Pickup fortsetzen' : 'Pickup starten'}
          </button>
          <button
            type="button"
            disabled={!returnGate.allowed}
            title={returnGate.reason}
            onClick={() => {
              onClose();
              onReturnStart(item);
            }}
            className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] font-semibold disabled:opacity-45"
          >
            {returnDraft ? 'Return fortsetzen' : 'Return starten'}
          </button>
        </div>
      </div>
    </div>
  );
}
