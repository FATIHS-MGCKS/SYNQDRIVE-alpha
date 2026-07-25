import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type {
  HandoverDialogBookingInfo,
  HandoverDialogKind,
} from '../../rental/components/handover/HandoverProtocolDialog';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import {
  buildOperatorHandoverPayload,
  canAdvanceFromStep,
  canNavigateToStep,
  firstBlockingStepIssue,
  getOperatorHandoverFinalizeLabel,
  issuesToFieldMap,
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
import { useOperatorHandoverDraft } from './useOperatorHandoverDraft';
import { OperatorHandoverSaveStatus } from './OperatorHandoverSaveStatus';
import { OperatorHandoverConflictDialog } from './OperatorHandoverConflictDialog';
import { OperatorHandoverConfirmDialog } from './OperatorHandoverConfirmDialog';
import { OperatorHandoverSuccessScreen } from './OperatorHandoverSuccessScreen';
import { useOperatorUploadQueue } from '../upload-queue/useOperatorUploadQueue';
import { OperatorUploadStatusList } from '../upload-queue/OperatorUploadStatusList';
import { dataUrlToBlob } from '../upload-queue/operatorUploadQueue.utils';
import { signatureClientUploadId } from './operatorHandoverSignatureBinding';

const STEP_LABELS: Record<OperatorHandoverStepId, string> = {
  vehicle: 'Fahrzeug',
  condition: 'Zustand',
  damages: 'Schäden',
  documents: 'Dokumente',
  signatures: 'Unterschriften',
  review: 'Abschluss',
};

type SubmitPhase = 'idle' | 'flushing' | 'uploading' | 'completing';
type ClosePrompt = 'leave' | 'discard-draft' | null;

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
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [closePrompt, setClosePrompt] = useState<ClosePrompt>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [completed, setCompleted] = useState<{ vehicleLabel: string } | null>(null);
  const [resumeStepHint, setResumeStepHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickupIdempotencyKeyRef = useRef<string | null>(null);
  const returnIdempotencyKeyRef = useRef<string | null>(null);

  const form = useOperatorHandoverForm(isOpen, kind, orgId, booking, { skipResetOnOpen: true });

  const draftSync = useOperatorHandoverDraft(
    isOpen,
    orgId,
    booking?.id,
    kind,
    step,
    form.state,
    form.patchState,
    setStep,
  );

  const uploadContext = useMemo(
    () =>
      booking
        ? {
            orgId,
            bookingId: booking.id,
            vehicleId: booking.vehicleId,
            handoverSessionId: draftSync.sessionId,
            handoverKind: kind,
          }
        : null,
    [orgId, booking, draftSync.sessionId, kind],
  );
  const uploadQueue = useOperatorUploadQueue(isOpen && !completed ? uploadContext : null);

  useEffect(() => {
    if (isOpen) {
      setStep('vehicle');
      setStepError(null);
      setSubmitError(null);
      setSubmitting(false);
      setSubmitPhase('idle');
      setClosePrompt(null);
      setCompleted(null);
      setResumeStepHint(null);
      pickupIdempotencyKeyRef.current = null;
      returnIdempotencyKeyRef.current = null;
    }
  }, [isOpen, booking?.id, kind]);

  useEffect(() => {
    if (!isOpen || draftSync.draftLoading || !draftSync.draftMeta?.currentStep) return;
    const stepId = draftSync.draftMeta.currentStep;
    if (stepId !== 'vehicle' || (draftSync.draftMeta.version ?? 0) > 1) {
      setResumeStepHint((prev) => prev ?? STEP_LABELS[stepId]);
    }
  }, [isOpen, draftSync.draftLoading, draftSync.draftMeta]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

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

  const fieldErrors = useMemo(() => issuesToFieldMap(currentStepIssues), [currentStepIssues]);

  const resumedSignaturesPending = useMemo(() => {
    const sig = draftSync.draftMeta?.draft?.signatureStatus;
    if (!sig) return false;
    const customerPending = sig.customer.captured && !form.state.customerSigData?.trim();
    const staffPending = sig.staff.captured && !form.state.staffSigData?.trim();
    return customerPending || staffPending;
  }, [draftSync.draftMeta, form.state.customerSigData, form.state.staffSigData]);

  const submitPhaseLabel = useMemo(() => {
    switch (submitPhase) {
      case 'flushing':
        return 'Entwurf wird gespeichert…';
      case 'uploading':
        return 'Pflicht-Uploads werden übertragen…';
      case 'completing':
        return kind === 'PICKUP' ? 'Übergabe wird abgeschlossen…' : 'Rückgabe wird abgeschlossen…';
      default:
        return null;
    }
  }, [submitPhase, kind]);

  const needsCloseGuard =
    draftSync.saveStatus === 'offline' ||
    draftSync.saveStatus === 'conflict' ||
    draftSync.saveStatus === 'saving' ||
    draftSync.saveStatus === 'error';

  const navigateToStep = useCallback(
    async (next: OperatorHandoverStepId): Promise<boolean> => {
      if (completed) return false;
      setStepError(null);

      const targetIdx = stepIndex(next);
      const currentIdx = stepIndex(step);

      if (targetIdx > currentIdx) {
        if (!canNavigateToStep(next, step, kind, bookingRef, form.state)) {
          const blocking = firstBlockingStepIssue(step, next, kind, bookingRef, form.state);
          if (blocking) {
            setStepError(blocking.message);
            setStep(blocking.step);
          } else {
            setStepError('Bitte Pflichtfelder ausfüllen');
          }
          return false;
        }

        for (let i = currentIdx; i < targetIdx; i += 1) {
          const stepToValidate = OPERATOR_HANDOVER_STEPS[i];
          const saved = await draftSync.flushSave({ validateStep: stepToValidate });
          if (!saved) {
            if (draftSync.stepValidationError) {
              setStepError(draftSync.stepValidationError);
            }
            return false;
          }
        }
      } else {
        await draftSync.flushSave();
      }

      setStep(next);
      return true;
    },
    [completed, step, kind, bookingRef, form.state, draftSync],
  );

  const goNext = useCallback(async () => {
    if (!canAdvanceFromStep(step, kind, bookingRef, form.state)) {
      const issues = validateOperatorHandoverStep(step, kind, bookingRef, form.state);
      setStepError(issues[0]?.message ?? 'Bitte Pflichtfelder ausfüllen');
      return;
    }
    const idx = stepIndex(step);
    if (idx < OPERATOR_HANDOVER_STEPS.length - 1) {
      await navigateToStep(OPERATOR_HANDOVER_STEPS[idx + 1]);
    }
  }, [step, kind, bookingRef, form.state, navigateToStep]);

  const goBack = useCallback(async () => {
    const idx = stepIndex(step);
    if (idx > 0) await navigateToStep(OPERATOR_HANDOVER_STEPS[idx - 1]);
  }, [step, navigateToStep]);

  const finishClose = useCallback(() => {
    setClosePrompt(null);
    onClose();
  }, [onClose]);

  const handleCloseRequest = useCallback(() => {
    if (submitting || completed) return;
    if (needsCloseGuard) {
      setClosePrompt('leave');
      return;
    }
    void draftSync.flushSave().finally(finishClose);
  }, [submitting, completed, needsCloseGuard, draftSync, finishClose]);

  const handleConfirmLeave = useCallback(async () => {
    setCloseBusy(true);
    try {
      await draftSync.flushSave();
      finishClose();
    } finally {
      setCloseBusy(false);
    }
  }, [draftSync, finishClose]);

  const handleConfirmDiscardDraft = useCallback(async () => {
    setCloseBusy(true);
    try {
      const ok = await draftSync.cancelDraft();
      if (ok) finishClose();
    } finally {
      setCloseBusy(false);
    }
  }, [draftSync, finishClose]);

  const handleSubmit = async () => {
    if (!booking || !bookingRef || submitting || completed) return;
    if (allIssues.length > 0) {
      setSubmitError(allIssues[0].message);
      setStep(allIssues[0].step);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitPhase('flushing');

    try {
      const saved = await draftSync.flushSave();
      if (!saved) {
        if (draftSync.conflict) return;
        if (draftSync.stepValidationError) {
          setSubmitError(draftSync.stepValidationError);
        }
        return;
      }

      const sessionId = draftSync.sessionId;
      setSubmitPhase('uploading');

      if (form.state.customerSigData?.trim() && sessionId) {
        const blob = dataUrlToBlob(form.state.customerSigData);
        if (blob) {
          await uploadQueue.enqueue({
            kind: 'SIGNATURE',
            file: blob,
            fileName: 'customer-signature.png',
            mimeType: 'image/png',
            required: true,
            clientUploadId: signatureClientUploadId(sessionId, 'customer'),
          });
        }
      }
      if (form.state.staffSigData?.trim() && sessionId) {
        const blob = dataUrlToBlob(form.state.staffSigData);
        if (blob) {
          await uploadQueue.enqueue({
            kind: 'SIGNATURE',
            file: blob,
            fileName: 'staff-signature.png',
            mimeType: 'image/png',
            required: true,
            clientUploadId: signatureClientUploadId(sessionId, 'operator'),
          });
        }
      }
      await uploadQueue.flush();
      if (uploadQueue.hasBlockingUploads) {
        setSubmitError('Pflicht-Uploads sind noch nicht abgeschlossen oder fehlgeschlagen.');
        return;
      }

      setSubmitPhase('completing');
      const payload = buildOperatorHandoverPayload({
        kind,
        booking: bookingRef,
        state: form.state,
      });

      if (kind === 'PICKUP') {
        if (!pickupIdempotencyKeyRef.current) {
          pickupIdempotencyKeyRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? `pickup-${booking.id}-${crypto.randomUUID()}`
              : `pickup-${booking.id}-${Date.now()}`;
        }
        await api.bookings.completePickupHandover(orgId, booking.id, {
          ...payload,
          idempotencyKey: pickupIdempotencyKeyRef.current,
          sessionId: draftSync.sessionId ?? undefined,
          expectedVersion: draftSync.expectedVersion ?? undefined,
        });
      } else {
        if (!returnIdempotencyKeyRef.current) {
          returnIdempotencyKeyRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? `return-${booking.id}-${crypto.randomUUID()}`
              : `return-${booking.id}-${Date.now()}`;
        }
        await api.bookings.completeReturnHandover(orgId, booking.id, {
          ...payload,
          idempotencyKey: returnIdempotencyKeyRef.current,
          sessionId: draftSync.sessionId ?? undefined,
          expectedVersion: draftSync.expectedVersion ?? undefined,
        });
      }

      draftSync.clearDraftAfterComplete();
      await form.reloadDocuments();
      onSuccess?.();
      setCompleted({ vehicleLabel: `${booking.vehicleName} · ${booking.plate}` });
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      const msg = e?.data?.message ?? e?.message ?? 'Übergabe konnte nicht gespeichert werden';
      setSubmitError(typeof msg === 'string' ? msg : 'Übergabe fehlgeschlagen');
    } finally {
      setSubmitting(false);
      setSubmitPhase('idle');
    }
  };

  const openTireMeasure = () => {
    if (!booking || completed) return;
    const odo = form.state.odometerKm ? Number(form.state.odometerKm) : undefined;
    openSheet({
      type: 'tire-measure',
      vehicleId: booking.vehicleId,
      vehicleLabel: `${booking.vehicleName} · ${booking.plate}`,
      bookingId: booking.id,
      handoverSessionId: draftSync.sessionId ?? undefined,
      initialOdometerKm: Number.isFinite(odo) ? odo : undefined,
      onSuccess: () => form.markTireMeasurementCaptured(),
    });
  };

  const openAiUpload = () => {
    if (!booking || completed) return;
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

  if (completed) {
    return (
      <OperatorHandoverSuccessScreen
        kind={kind}
        vehicleLabel={completed.vehicleLabel}
        onDone={onClose}
      />
    );
  }

  const title = kind === 'PICKUP' ? 'Pickup' : 'Return';
  const progress = ((stepIndex(step) + 1) / OPERATOR_HANDOVER_STEPS.length) * 100;
  const isReview = step === 'review';
  const finalizeLabel = getOperatorHandoverFinalizeLabel(kind);

  const stepContent = !booking ? (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <>
      {step === 'vehicle' && (
        <OperatorHandoverStepVehicle
          kind={kind}
          booking={booking}
          form={form}
          fieldErrors={fieldErrors}
        />
      )}
      {step === 'condition' && (
        <OperatorHandoverStepCondition
          kind={kind}
          booking={booking}
          form={form}
          onTireMeasure={openTireMeasure}
          fieldErrors={fieldErrors}
        />
      )}
      {step === 'damages' && <OperatorHandoverStepDamages form={form} />}
      {step === 'documents' && (
        <OperatorHandoverStepDocuments
          booking={booking}
          form={form}
          kind={kind}
          onAiUpload={openAiUpload}
          fieldErrors={fieldErrors}
        />
      )}
      {step === 'signatures' && bookingRef && (
        <OperatorHandoverStepSignatures
          form={form}
          staffOptions={staffOptions}
          isDarkMode={isDarkMode}
          stepErrors={currentStepIssues.map((i) => i.message)}
          fieldErrors={fieldErrors}
          orgId={orgId}
          kind={kind}
          booking={bookingRef}
          handoverSessionId={draftSync.sessionId}
          draftVersion={draftSync.expectedVersion}
          resumeSignatureHint={resumedSignaturesPending}
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
          <div className="flex shrink-0 items-center gap-2">
            <OperatorHandoverSaveStatus
              status={draftSync.saveStatus}
              isOnline={draftSync.isOnline}
              errorMessage={draftSync.draftSyncError}
            />
            <button
              type="button"
              onClick={() => setClosePrompt('discard-draft')}
              disabled={submitting || draftSync.draftLoading}
              className="sq-press hidden min-h-[44px] rounded-xl border border-border/60 px-3 text-[11px] font-semibold text-muted-foreground sm:inline-flex sm:items-center"
            >
              Entwurf verwerfen
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              disabled={submitting}
              className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-300"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={stepIndex(step) + 1}
            aria-valuemin={1}
            aria-valuemax={OPERATOR_HANDOVER_STEPS.length}
            aria-label={`Schritt ${stepIndex(step) + 1} von ${OPERATOR_HANDOVER_STEPS.length}`}
          />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
          Schritt {stepIndex(step) + 1}/{OPERATOR_HANDOVER_STEPS.length}: {STEP_LABELS[step]}
        </p>
      </header>

      <div className={`flex min-h-0 flex-1 ${isTablet ? 'flex-row gap-0' : 'flex-col'}`}>
        {isTablet && (
          <nav className="hidden w-44 shrink-0 border-r border-border/50 p-3 md:block" aria-label="Wizard-Schritte">
            <ul className="space-y-1">
              {OPERATOR_HANDOVER_STEPS.map((s) => {
                const reachable = canNavigateToStep(s, step, kind, bookingRef, form.state);
                return (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={!reachable || draftSync.draftLoading}
                      onClick={() => void navigateToStep(s)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                        step === s
                          ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {STEP_LABELS[s]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {draftSync.draftLoading && (
            <p className="mb-3 text-xs text-muted-foreground">Entwurf wird geladen…</p>
          )}
          {!draftSync.draftLoading && resumeStepHint && (
            <p className="mb-3 rounded-xl border border-[color:var(--brand)]/20 bg-[color:var(--brand-soft)] px-3 py-2 text-xs text-[color:var(--brand-ink)]">
              Entwurf fortgesetzt — zuletzt bei „{resumeStepHint}“
            </p>
          )}
          {stepContent}
          {stepError && (
            <p role="alert" className="mt-3 text-sm text-[color:var(--status-critical)]">
              {stepError}
            </p>
          )}
          {submitError && (
            <p role="alert" className="mt-3 text-sm text-[color:var(--status-critical)]">
              {submitError}
            </p>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/50 bg-background/95 p-4">
        {uploadQueue.items.length > 0 && (
          <div className="mb-3">
            <OperatorUploadStatusList
              items={uploadQueue.items}
              onCancel={(id) => void uploadQueue.cancel(id)}
            />
          </div>
        )}
        {submitPhaseLabel && (
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {submitPhaseLabel}
          </p>
        )}
        <div className="flex gap-2">
          {stepIndex(step) > 0 && (
            <button
              type="button"
              onClick={() => void goBack()}
              disabled={submitting}
              className="sq-3d-btn sq-3d-btn--neutral min-h-[52px] flex-1 font-semibold"
            >
              Zurück
            </button>
          )}
          {!isReview ? (
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!booking || draftSync.draftLoading || submitting}
              className="sq-3d-btn sq-3d-btn--primary min-h-[52px] flex-[2] font-semibold disabled:opacity-50"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                allIssues.length > 0 ||
                draftSync.draftLoading ||
                uploadQueue.hasBlockingUploads
              }
              className="sq-3d-btn sq-3d-btn--primary flex min-h-[52px] flex-[2] items-center justify-center gap-2 font-semibold disabled:opacity-50"
              aria-busy={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {finalizeLabel}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setClosePrompt('discard-draft')}
          disabled={submitting || draftSync.draftLoading}
          className="sq-press mt-3 w-full min-h-[44px] text-center text-xs font-semibold text-muted-foreground sm:hidden"
        >
          Entwurf verwerfen
        </button>
      </footer>

      <OperatorHandoverConflictDialog
        open={Boolean(draftSync.conflict)}
        message={draftSync.conflict?.message ?? 'Der Entwurf wurde parallel bearbeitet.'}
        busy={conflictBusy}
        onAcceptServer={() => {
          setConflictBusy(true);
          void draftSync.resolveConflictAcceptServer().finally(() => setConflictBusy(false));
        }}
        onKeepLocal={() => {
          setConflictBusy(true);
          void draftSync.resolveConflictKeepLocal().finally(() => setConflictBusy(false));
        }}
      />

      <OperatorHandoverConfirmDialog
        open={closePrompt === 'leave'}
        title="Wizard schließen?"
        message={
          draftSync.saveStatus === 'offline'
            ? 'Der Entwurf ist offline und wurde möglicherweise nicht vollständig synchronisiert. Beim Schließen bleiben lokale Daten erhalten — beim Fortsetzen wird erneut synchronisiert.'
            : draftSync.saveStatus === 'conflict'
              ? 'Es liegt ein Versionskonflikt vor. Bitte zuerst den Konflikt auflösen oder den Entwurf verwerfen.'
              : 'Es gibt noch ungespeicherte oder fehlgeschlagene Änderungen. Trotzdem schließen?'
        }
        confirmLabel="Schließen"
        busy={closeBusy}
        onConfirm={() => void handleConfirmLeave()}
        onCancel={() => setClosePrompt(null)}
      />

      <OperatorHandoverConfirmDialog
        open={closePrompt === 'discard-draft'}
        title="Entwurf verwerfen?"
        message="Der gespeicherte Entwurf wird gelöscht. Bereits hochgeladene Dateien auf dem Server bleiben ggf. erhalten, der Wizard startet beim nächsten Öffnen neu."
        confirmLabel="Entwurf verwerfen"
        destructive
        busy={closeBusy}
        onConfirm={() => void handleConfirmDiscardDraft()}
        onCancel={() => setClosePrompt(null)}
      />
    </div>
  );
}
