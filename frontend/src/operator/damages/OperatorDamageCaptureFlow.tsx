import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { DamageResponse, DamageSource } from '../../rental/lib/damage.types';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { OperatorDamageDetailsStep } from './OperatorDamageDetailsStep';
import { OperatorDamagePhotoStep, type OperatorDamagePhotoItem } from './OperatorDamagePhotoStep';
import { OperatorDamageReviewStep } from './OperatorDamageReviewStep';
import {
  buildOperatorDamagePayload,
  DEFAULT_OPERATOR_DAMAGE_FORM,
  OPERATOR_DAMAGE_CAPTURE_STEPS,
  resolveDamageSource,
  validateOperatorDamageStep,
  type OperatorDamageCaptureStep,
  type OperatorDamageFormState,
} from './operatorDamagePayload';

const STEP_LABELS: Record<OperatorDamageCaptureStep, string> = {
  vehicle: 'Fahrzeug',
  photos: 'Fotos',
  details: 'Klassifizierung',
  review: 'Prüfen',
};

export interface OperatorDamageCaptureContext {
  vehicleId: string;
  vehicleName: string;
  plate: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  bookingLabel?: string;
  source?: DamageSource;
  handoverKind?: HandoverDialogKind;
  reportedBy?: string;
  skipVehicleConfirm?: boolean;
  onCreated?: (damage: DamageResponse) => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  context: OperatorDamageCaptureContext | null;
  onSaved?: (damage: DamageResponse) => void;
}

function stepIndex(step: OperatorDamageCaptureStep): number {
  return OPERATOR_DAMAGE_CAPTURE_STEPS.indexOf(step);
}

export function OperatorDamageCaptureFlow({ isOpen, onClose, context, onSaved }: Props) {
  const isTablet = useOperatorTabletLayout();
  const { openSheet, triggerRefresh } = useOperatorShell();
  const [step, setStep] = useState<OperatorDamageCaptureStep>('vehicle');
  const [form, setForm] = useState<OperatorDamageFormState>(DEFAULT_OPERATOR_DAMAGE_FORM);
  const [photos, setPhotos] = useState<OperatorDamagePhotoItem[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedDamageId, setSavedDamageId] = useState<string | null>(null);

  const source = useMemo(
    () => resolveDamageSource(context?.source, context?.handoverKind),
    [context?.source, context?.handoverKind],
  );

  useEffect(() => {
    if (!isOpen) return;
    setForm(DEFAULT_OPERATOR_DAMAGE_FORM);
    setPhotos([]);
    setStepError(null);
    setSubmitError(null);
    setSubmitting(false);
    setSavedDamageId(null);
    setStep(context?.skipVehicleConfirm ? 'photos' : 'vehicle');
  }, [isOpen, context?.vehicleId, context?.skipVehicleConfirm]);

  const vehicleLabel = context?.vehicleName ?? 'Fahrzeug';
  const plate = context?.plate ?? '';

  const advance = useCallback(() => {
    const err = validateOperatorDamageStep(step, form, photos.length);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    const idx = stepIndex(step);
    if (idx < OPERATOR_DAMAGE_CAPTURE_STEPS.length - 1) {
      setStep(OPERATOR_DAMAGE_CAPTURE_STEPS[idx + 1]);
    }
  }, [step, form, photos.length]);

  const back = useCallback(() => {
    setStepError(null);
    const idx = stepIndex(step);
    if (idx > 0) {
      setStep(OPERATOR_DAMAGE_CAPTURE_STEPS[idx - 1]);
    } else {
      onClose();
    }
  }, [step, onClose]);

  const handleSave = useCallback(async () => {
    if (!context?.vehicleId || submitting) return;
    const err = validateOperatorDamageStep('details', form, photos.length);
    if (err) {
      setSubmitError(err);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const images = photos.map((p) => ({ imageData: p.dataUrl, caption: p.caption }));
      const payload = buildOperatorDamagePayload(form, {
        source,
        bookingId: context.bookingId,
        customerId: context.customerId,
        reportedBy: context.reportedBy ?? 'Operator',
        images,
      });

      const created = await api.vehicleIntelligence.createVehicleDamage(context.vehicleId, payload);
      setSavedDamageId(created.id);

      window.dispatchEvent(
        new CustomEvent('operator:damage-created', { detail: { damage: created } }),
      );
      triggerRefresh();
      context.onCreated?.(created);
      onSaved?.(created);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Schaden konnte nicht gespeichert werden.');
    } finally {
      setSubmitting(false);
    }
  }, [context, form, photos, source, submitting, triggerRefresh, onSaved, onClose]);

  const openAiUpload = useCallback(() => {
    if (!context?.vehicleId) return;
    onClose();
    openSheet({
      type: 'ai-upload',
      vehicleId: context.vehicleId,
      vehicleLabel: [context.vehicleName, context.plate].filter(Boolean).join(' · '),
      bookingId: context.bookingId,
      customerId: context.customerId,
      damageId: savedDamageId ?? undefined,
      initialDocType: 'DAMAGE',
      contextMode: 'damage',
    });
  }, [context, onClose, openSheet, savedDamageId]);

  if (!isOpen || !context) return null;

  const progress = ((stepIndex(step) + 1) / OPERATOR_DAMAGE_CAPTURE_STEPS.length) * 100;
  const isLast = step === 'review';

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
      aria-labelledby="operator-damage-capture-title"
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 md:max-w-2xl">
          <button
            type="button"
            onClick={back}
            className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
            aria-label="Zurück"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Schaden erfassen
            </p>
            <h2 id="operator-damage-capture-title" className="truncate text-base font-bold">
              {STEP_LABELS[step]}
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
        </div>
        <div className="mx-auto mt-3 h-1 max-w-lg overflow-hidden rounded-full bg-muted md:max-w-2xl">
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div
        className={`mx-auto min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 py-5 ${
          isTablet ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        {step === 'vehicle' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Fahrzeug für die Schadenerfassung bestätigen.</p>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fahrzeug
                </p>
                <p className="mt-0.5 text-lg font-bold text-foreground">{vehicleLabel}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Kennzeichen
                </p>
                <p className="mt-0.5 text-base font-semibold text-foreground">{plate || '—'}</p>
              </div>
              {context.bookingLabel && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Buchung
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">{context.bookingLabel}</p>
                </div>
              )}
              {context.customerName && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Kunde
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">{context.customerName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'photos' && (
          <OperatorDamagePhotoStep photos={photos} onPhotosChange={setPhotos} error={stepError} />
        )}

        {step === 'details' && (
          <OperatorDamageDetailsStep form={form} onChange={setForm} />
        )}

        {step === 'review' && (
          <OperatorDamageReviewStep
            vehicleLabel={vehicleLabel}
            plate={plate}
            bookingLabel={context.bookingLabel}
            customerName={context.customerName}
            source={source}
            form={form}
            photos={photos}
            onOpenAiUpload={openAiUpload}
          />
        )}

        {step === 'details' && stepError && (
          <p className="mt-3 text-xs text-[color:var(--status-critical)]">{stepError}</p>
        )}
        {submitError && (
          <p className="mt-3 text-xs text-[color:var(--status-critical)]">{submitError}</p>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className={`mx-auto flex gap-2 ${isTablet ? 'max-w-2xl' : 'max-w-lg'}`}>
          {isLast ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSave()}
              className="sq-press min-h-[52px] flex-1 rounded-2xl bg-[color:var(--brand)] text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                'Schaden speichern'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="sq-press min-h-[52px] flex-1 rounded-2xl bg-[color:var(--brand)] text-sm font-bold text-white"
            >
              <span className="inline-flex items-center justify-center gap-1">
                Weiter
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
