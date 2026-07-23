import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { handleBookingMutationError } from '../../rental/lib/booking-version-conflict';
import type {
  HandoverDialogBookingInfo,
  HandoverDialogKind,
} from '../../rental/components/handover/HandoverProtocolDialog';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import {
  buildOperatorHandoverPayload,
  canAdvanceFromStep,
  OPERATOR_HANDOVER_STEPS,
  stepIndex,
  validateOperatorHandover,
  validateOperatorHandoverStep,
  type OperatorHandoverStepId,
} from './operatorHandoverPayload';
import { OperatorHandoverStepCondition } from './OperatorHandoverStepCondition';
import { OperatorHandoverStepDamages } from './OperatorHandoverStepDamages';
import { OperatorHandoverStepDocuments } from './OperatorHandoverStepDocuments';
import { OperatorHandoverStepReview } from './OperatorHandoverStepReview';
import { OperatorHandoverStepSignatures } from './OperatorHandoverStepSignatures';
import { OperatorHandoverStepVehicle } from './OperatorHandoverStepVehicle';
import { useOperatorHandoverForm } from './useOperatorHandoverForm';

const STEP_LABELS: Record<OperatorHandoverStepId, string> = {
  vehicle: 'Fahrzeug',
  condition: 'Zustand',
  damages: 'Schäden',
  documents: 'Dokumente',
  signatures: 'Unterschriften',
  review: 'Abschluss',
};

interface OperatorHandoverFlowProps {
  isOpen: boolean;
  onClose: () => void;
  kind: HandoverDialogKind;
  orgId: string;
  booking: HandoverDialogBookingInfo | null;
  staffOptions: { id: string; name: string }[];
  isDarkMode: boolean;
  onSuccess?: () => void;
}

export function OperatorHandoverFlow({
  isOpen,
  onClose,
  kind,
  orgId,
  booking,
  staffOptions,
  isDarkMode,
  onSuccess,
}: OperatorHandoverFlowProps) {
  const isTablet = useOperatorTabletLayout();
  const { openSheet } = useOperatorShell();
  const [step, setStep] = useState<OperatorHandoverStepId>('vehicle');
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useOperatorHandoverForm(isOpen, kind, orgId, booking);

  useEffect(() => {
    if (isOpen) {
      setStep('vehicle');
      setStepError(null);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [isOpen, booking?.id, kind]);

  const bookingRef = useMemo(() => {
    if (!booking) return null;
    return {
      id: booking.id,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      vehicleName: booking.vehicleName,
      plate: booking.plate,
      customerName: booking.customerName,
      startDate: booking.startDate,
      endDate: booking.endDate,
      pickupLocation: booking.pickupLocation,
      returnLocation: booking.returnLocation,
      pickupStationId: booking.pickupStationId,
      returnStationId: booking.returnStationId,
      handoverInstructions: booking.handoverInstructions,
      returnInstructions: booking.returnInstructions,
      pickupOdometerKm: booking.pickupOdometerKm,
      updatedAt: booking.updatedAt,
    };
  }, [booking]);

  const allIssues = useMemo(
    () => validateOperatorHandover(kind, bookingRef, form.state),
    [kind, bookingRef, form.state],
  );

  const currentStepIssues = useMemo(
    () => validateOperatorHandoverStep(step, kind, bookingRef, form.state),
    [step, kind, bookingRef, form.state],
  );

  const goNext = useCallback(() => {
    if (!canAdvanceFromStep(step, kind, bookingRef, form.state)) {
      const issues = validateOperatorHandoverStep(step, kind, bookingRef, form.state);
      setStepError(issues[0]?.message ?? 'Bitte Pflichtfelder ausfüllen');
      return;
    }
    setStepError(null);
    const idx = stepIndex(step);
    if (idx < OPERATOR_HANDOVER_STEPS.length - 1) {
      setStep(OPERATOR_HANDOVER_STEPS[idx + 1]);
    }
  }, [step, kind, bookingRef, form.state]);

  const goBack = useCallback(() => {
    setStepError(null);
    const idx = stepIndex(step);
    if (idx > 0) setStep(OPERATOR_HANDOVER_STEPS[idx - 1]);
  }, [step]);

  const handleSubmit = async () => {
    if (!booking || !bookingRef || submitting) return;
    if (allIssues.length > 0) {
      setSubmitError(allIssues[0].message);
      setStep(allIssues[0].step);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildOperatorHandoverPayload({
        kind,
        booking: bookingRef,
        state: form.state,
      });
      if (kind === 'PICKUP') {
        await api.bookings.createPickupHandover(orgId, booking.id, payload);
      } else {
        await api.bookings.createReturnHandover(orgId, booking.id, payload);
      }
      // Server generates pickup/return protocol PDFs after handover — refresh bundle (no frontend PDF).
      await form.reloadDocuments();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const handled = handleBookingMutationError(err, {
        onOtherError: (msg) => setSubmitError(msg),
      });
      if (handled) return;
      setSubmitError('Übergabe fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  const openTireMeasure = () => {
    if (!booking) return;
    const odo = form.state.odometerKm ? Number(form.state.odometerKm) : undefined;
    openSheet({
      type: 'tire-measure',
      vehicleId: booking.vehicleId,
      vehicleLabel: `${booking.vehicleName} · ${booking.plate}`,
      bookingId: booking.id,
      initialOdometerKm: Number.isFinite(odo) ? odo : undefined,
      onSuccess: () => form.markTireMeasurementCaptured(),
    });
  };

  const openAiUpload = () => {
    if (!booking) return;
    openSheet({
      type: 'ai-upload',
      vehicleId: booking.vehicleId,
      vehicleLabel: `${booking.vehicleName} · ${booking.plate}`,
      bookingId: booking.id,
      customerId: booking.customerId ?? undefined,
      customerName: booking.customerName,
      contextMode: 'booking',
      initialDocType: 'VEHICLE_CONDITION',
      onComplete: () => void form.reloadDocuments(),
    });
  };

  if (!isOpen) return null;

  const title = kind === 'PICKUP' ? 'Pickup' : 'Return';
  const progress = ((stepIndex(step) + 1) / OPERATOR_HANDOVER_STEPS.length) * 100;
  const isReview = step === 'review';

  const stepContent = !booking ? (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <>
      {step === 'vehicle' && (
        <OperatorHandoverStepVehicle kind={kind} booking={booking} form={form} />
      )}
      {step === 'condition' && (
        <OperatorHandoverStepCondition
          kind={kind}
          booking={booking}
          form={form}
          onTireMeasure={openTireMeasure}
        />
      )}
      {step === 'damages' && <OperatorHandoverStepDamages form={form} />}
      {step === 'documents' && (
        <OperatorHandoverStepDocuments booking={booking} form={form} onAiUpload={openAiUpload} />
      )}
      {step === 'signatures' && (
        <OperatorHandoverStepSignatures
          form={form}
          staffOptions={staffOptions}
          isDarkMode={isDarkMode}
          stepErrors={currentStepIssues.map((i) => i.message)}
        />
      )}
      {step === 'review' && (
        <OperatorHandoverStepReview kind={kind} booking={booking} form={form} issues={allIssues} />
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Handover · {title}
            </p>
            <h1 className="truncate font-display text-lg font-bold">
              {booking ? `${booking.vehicleName} · ${booking.plate}` : 'Laden…'}
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
          Schritt {stepIndex(step) + 1}/{OPERATOR_HANDOVER_STEPS.length}: {STEP_LABELS[step]}
        </p>
      </header>

      <div className={`flex min-h-0 flex-1 ${isTablet ? 'flex-row gap-0' : 'flex-col'}`}>
        {isTablet && (
          <nav className="hidden w-44 shrink-0 border-r border-border/50 p-3 md:block">
            <ul className="space-y-1">
              {OPERATOR_HANDOVER_STEPS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      setStepError(null);
                      setStep(s);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                      step === s
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {STEP_LABELS[s]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {stepContent}
          {stepError && (
            <p className="mt-3 text-sm text-[color:var(--status-critical)]">{stepError}</p>
          )}
          {submitError && (
            <p className="mt-3 text-sm text-[color:var(--status-critical)]">{submitError}</p>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/50 bg-background/95 p-4">
        <div className="flex gap-2">
          {stepIndex(step) > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="sq-3d-btn sq-3d-btn--neutral min-h-[52px] flex-1 font-semibold"
            >
              Zurück
            </button>
          )}
          {!isReview ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!booking}
              className="sq-3d-btn sq-3d-btn--primary min-h-[52px] flex-[2] font-semibold disabled:opacity-50"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || allIssues.length > 0}
              className="sq-3d-btn sq-3d-btn--primary flex min-h-[52px] flex-[2] items-center justify-center gap-2 font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {kind === 'PICKUP'
                ? 'Pickup bestätigen & Buchung aktivieren'
                : 'Rückgabe bestätigen & abschließen'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
