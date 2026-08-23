import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatOperatorTireOdometer,
  operatorTireMeasureHandoverNotePrefix,
  operatorTireMeasureSeasonLabel,
  operatorTireMeasureSourceLabel,
  operatorTireMeasureStepLabel,
  operatorTireMeasureValidationMessage,
  OPERATOR_TIRE_MEASURE_SOURCE_OPTIONS,
  OPERATOR_TIRE_MEASURE_WHEELS,
  operatorTireMeasurePlausibilityMessage,
  operatorTireMeasurePositionShort,
} from '../lib/operator-tire-measure-i18n';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { invalidateRentalHealthForVehicle } from '../../rental/lib/rental-health-query';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { OperatorTireMeasureTreadGrid } from './OperatorTireMeasureTreadGrid';
import {
  defaultTireSetupSelection,
  dispatchTireMeasurementSaved,
  submitOperatorTireMeasurement,
} from './operatorTireMeasurePayload';
import {
  OPERATOR_TIRE_MEASURE_STEPS,
  type OperatorTireContextForm,
  type OperatorTireMeasureStep,
  type OperatorTireMeasureValidationCode,
  type OperatorTireTreadForm,
} from './operatorTireMeasure.types';
import {
  defaultMeasuredAtLocal,
  deriveTirePlausibilityWarnings,
  formatTreadInput,
  validateTireMeasureStep,
} from './operatorTireMeasure.utils';
import { useOperatorTireMeasureData } from './useOperatorTireMeasureData';

type TireMeasureAction = Extract<OperatorSheetAction, { type: 'tire-measure' }>;

function stepIndex(step: OperatorTireMeasureStep): number {
  return OPERATOR_TIRE_MEASURE_STEPS.indexOf(step);
}

interface Props {
  action: TireMeasureAction;
}

export function OperatorTireMeasureFlow({ action }: Props) {
  const { t, locale } = useLanguage();
  const isTablet = useOperatorTabletLayout();
  const { closeSheet, openSheet, triggerRefresh } = useOperatorShell();
  const { orgId } = useRentalOrg();
  const { reloadHealth } = useFleetVehicles();
  const data = useOperatorTireMeasureData(action.vehicleId, locale);

  const [step, setStep] = useState<OperatorTireMeasureStep>('vehicle');
  const [selectedSetupId, setSelectedSetupId] = useState<string>('__unknown__');
  const [tread, setTread] = useState<OperatorTireTreadForm>({ fl: '', fr: '', rl: '', rr: '' });
  const [context, setContext] = useState<OperatorTireContextForm>({
    measuredAt: defaultMeasuredAtLocal(),
    odometerKm: '',
    source: 'manual',
    workshopName: '',
    note: '',
  });
  const [stepError, setStepError] = useState<OperatorTireMeasureValidationCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const plausibilityWarnings = useMemo(() => deriveTirePlausibilityWarnings(tread), [tread]);

  useEffect(() => {
    setStep('vehicle');
    setStepError(null);
    setSubmitError(null);
    setSubmitting(false);
    setTread({
      fl: formatTreadInput(action.prefilledTread?.fl),
      fr: formatTreadInput(action.prefilledTread?.fr),
      rl: formatTreadInput(action.prefilledTread?.rl),
      rr: formatTreadInput(action.prefilledTread?.rr),
    });
    setContext((prev) => ({
      ...prev,
      measuredAt: defaultMeasuredAtLocal(),
      odometerKm:
        action.initialOdometerKm != null
          ? String(action.initialOdometerKm)
          : data.odometerKm != null
            ? String(Math.round(data.odometerKm))
            : '',
      source: action.sourceHint ?? 'manual',
      workshopName: '',
      note: action.bookingId
        ? operatorTireMeasureHandoverNotePrefix(locale, action.bookingId)
        : '',
    }));
  }, [
    action.vehicleId,
    action.prefilledTread,
    action.initialOdometerKm,
    action.sourceHint,
    action.bookingId,
    data.odometerKm,
    locale,
  ]);

  useEffect(() => {
    if (data.setupOptions.length > 0) {
      setSelectedSetupId(defaultTireSetupSelection(data.setupOptions));
    }
  }, [data.setupOptions]);

  const vehicleLabel = useMemo(() => {
    const v = data.vehicle;
    if (!v) return action.vehicleLabel;
    return `${v.model ?? t('operator.tireMeasure.fallback.vehicle')} · ${v.license ?? '—'}`;
  }, [data.vehicle, action.vehicleLabel, t]);

  const plate = data.vehicle?.license ?? action.vehicleLabel.split('·').pop()?.trim() ?? '—';

  const goNext = useCallback(() => {
    const err = validateTireMeasureStep(step, tread, context);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    const idx = stepIndex(step);
    if (idx < OPERATOR_TIRE_MEASURE_STEPS.length - 1) {
      setStep(OPERATOR_TIRE_MEASURE_STEPS[idx + 1]!);
    }
  }, [step, tread, context]);

  const goBack = useCallback(() => {
    setStepError(null);
    const idx = stepIndex(step);
    if (idx > 0) {
      setStep(OPERATOR_TIRE_MEASURE_STEPS[idx - 1]!);
    } else {
      closeSheet();
    }
  }, [step, closeSheet]);

  const openAiUpload = () => {
    openSheet({
      type: 'ai-upload',
      vehicleId: action.vehicleId,
      vehicleLabel: action.vehicleLabel,
      bookingId: action.bookingId,
      initialDocType: 'TIRE',
      contextMode: 'tire',
    });
  };

  const handleSave = async () => {
    const err = validateTireMeasureStep('tread', tread, context);
    if (err) {
      setStepError(err);
      setStep('tread');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const setupId = selectedSetupId === '__unknown__' ? null : selectedSetupId;
      await submitOperatorTireMeasurement({
        vehicleId: action.vehicleId,
        tireSetupId: setupId,
        tread,
        context,
      });
      toast.success(t('operator.tireMeasure.toast.success'));
      dispatchTireMeasurementSaved(action.vehicleId, action.bookingId);
      triggerRefresh();
      if (orgId) {
        invalidateRentalHealthForVehicle(orgId, action.vehicleId);
      } else {
        reloadHealth();
      }
      void data.reload();
      action.onSuccess?.();
      closeSheet();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('operator.tireMeasure.toast.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((stepIndex(step) + 1) / OPERATOR_TIRE_MEASURE_STEPS.length) * 100;
  const isReview = step === 'review';
  const selectedSetup = data.setupOptions.find((o) => o.id === selectedSetupId);
  const stepLabel = operatorTireMeasureStepLabel(locale, step);
  const stepErrorText = stepError ? operatorTireMeasureValidationMessage(locale, stepError) : null;

  return (
    <div
      className="fixed inset-0 z-[135] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
      aria-labelledby="operator-tire-measure-title"
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('operator.tireMeasure.eyebrow')}
            </p>
            <h2 id="operator-tire-measure-title" className="truncate text-base font-bold text-foreground">
              {vehicleLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase text-muted-foreground">
            <span>
              {t('operator.tireMeasure.stepProgress', {
                current: stepIndex(step) + 1,
                total: OPERATOR_TIRE_MEASURE_STEPS.length,
                step: stepLabel,
              })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[color:var(--brand)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 ${
          isTablet ? 'mx-auto w-full max-w-xl' : ''
        }`}
      >
        {data.loading && step === 'vehicle' ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {step === 'vehicle' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border surface-premium p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('operator.tireMeasure.fields.plate')}
                    </p>
                    <p className="text-2xl font-bold tracking-wide text-foreground">{plate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('operator.tireMeasure.fields.vehicle')}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {data.vehicle?.model ?? action.vehicleLabel}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {t('operator.tireMeasure.fields.odometer')}
                      </p>
                      <p className="font-semibold tabular-nums">
                        {formatOperatorTireOdometer(locale, data.odometerKm)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {t('operator.tireMeasure.fields.tireSet')}
                      </p>
                      <p className="font-semibold">
                        {selectedSetup?.label ??
                          (data.activeSetup
                            ? String(
                                (data.activeSetup as Record<string, unknown>).name ??
                                  t('operator.tireMeasure.fallback.active'),
                              )
                            : t('operator.tireMeasure.fallback.unknown'))}
                      </p>
                    </div>
                  </div>
                  {data.tireSummary && (
                    <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">
                        {t('operator.tireMeasure.vehicle.lastMeasurement')}{' '}
                        <span className="font-semibold text-foreground">
                          {data.tireSummary.lastMeasurementAt ??
                            data.tireSummary.latestMeasurementAt ??
                            '—'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('operator.tireMeasure.vehicle.pipelineHint')}
                </p>
              </div>
            )}

            {step === 'set' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('operator.tireMeasure.set.hint')}</p>
                <div className="space-y-2">
                  {data.setupOptions.map((opt) => {
                    const active = selectedSetupId === opt.id;
                    const seasonLabel = operatorTireMeasureSeasonLabel(locale, opt.season);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedSetupId(opt.id)}
                        className={`sq-press w-full rounded-2xl border px-4 py-3 text-left ${
                          active
                            ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
                            : 'border-border surface-premium'
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{seasonLabel}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'tread' && (
              <OperatorTireMeasureTreadGrid
                tread={tread}
                onChange={setTread}
                warnings={plausibilityWarnings}
              />
            )}

            {step === 'context' && (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('operator.tireMeasure.fields.measuredAt')}
                  </span>
                  <input
                    type="datetime-local"
                    className="mt-1 h-12 w-full rounded-xl border border-border surface-premium px-3 text-sm"
                    value={context.measuredAt}
                    onChange={(e) => setContext((c) => ({ ...c, measuredAt: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('operator.tireMeasure.fields.odometerKm')}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 h-12 w-full rounded-xl border border-border surface-premium px-3 text-base tabular-nums"
                    value={context.odometerKm}
                    onChange={(e) => setContext((c) => ({ ...c, odometerKm: e.target.value }))}
                    placeholder={t('operator.tireMeasure.placeholders.optional')}
                  />
                </label>
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('operator.tireMeasure.fields.method')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {OPERATOR_TIRE_MEASURE_SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setContext((c) => ({ ...c, source: opt.value }))}
                        className={`sq-press min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold ${
                          context.source === opt.value
                            ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                            : 'border-border surface-premium'
                        }`}
                      >
                        {operatorTireMeasureSourceLabel(locale, opt.value)}
                      </button>
                    ))}
                  </div>
                </div>
                {context.source === 'workshop' && (
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('operator.tireMeasure.fields.workshop')}
                    </span>
                    <input
                      type="text"
                      className="mt-1 h-12 w-full rounded-xl border border-border surface-premium px-3 text-base"
                      value={context.workshopName}
                      onChange={(e) => setContext((c) => ({ ...c, workshopName: e.target.value }))}
                      placeholder={t('operator.tireMeasure.placeholders.workshopName')}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('operator.tireMeasure.fields.note')}
                  </span>
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-xl border border-border surface-premium px-3 py-2 text-sm"
                    value={context.note}
                    onChange={(e) => setContext((c) => ({ ...c, note: e.target.value }))}
                    placeholder={t('operator.tireMeasure.placeholders.note')}
                  />
                </label>
                <button
                  type="button"
                  className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 text-left"
                  onClick={openAiUpload}
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
                  <span>
                    <span className="block text-sm font-semibold">
                      {t('operator.tireMeasure.context.aiUploadTitle')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('operator.tireMeasure.context.aiUploadHint')}
                    </span>
                  </span>
                </button>
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border surface-premium p-4 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">{t('operator.tireMeasure.review.vehicle')}</span>{' '}
                    <span className="font-semibold">{vehicleLabel}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t('operator.tireMeasure.review.tireSet')}</span>{' '}
                    <span className="font-semibold">
                      {selectedSetup?.label ?? t('operator.tireMeasure.fallback.unknown')}
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {OPERATOR_TIRE_MEASURE_WHEELS.map(({ key, position }) => (
                      <div key={key} className="rounded-xl border border-border/50 px-3 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {operatorTireMeasurePositionShort(locale, position)}
                        </p>
                        <p className="text-lg font-bold tabular-nums">
                          {tread[key] || '—'} {t('operator.tireMeasure.tread.unitMm')}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p>
                    <span className="text-muted-foreground">{t('operator.tireMeasure.review.date')}</span>{' '}
                    <span className="font-semibold">
                      {context.measuredAt || t('operator.tireMeasure.review.now')}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t('operator.tireMeasure.review.km')}</span>{' '}
                    <span className="font-semibold">{context.odometerKm || '—'}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t('operator.tireMeasure.review.method')}</span>{' '}
                    <span className="font-semibold">
                      {operatorTireMeasureSourceLabel(locale, context.source)}
                    </span>
                  </p>
                  {context.note.trim() && (
                    <p>
                      <span className="text-muted-foreground">{t('operator.tireMeasure.review.note')}</span>{' '}
                      {context.note}
                    </p>
                  )}
                </div>
                {plausibilityWarnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('operator.tireMeasure.review.uiWarnings')}
                    </p>
                    {plausibilityWarnings.map((w) => (
                      <p key={w.id} className="text-xs text-[color:var(--status-watch)]">
                        {operatorTireMeasurePlausibilityMessage(locale, w)}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('operator.tireMeasure.review.backendHint')}
                </p>
                {submitError && (
                  <p className="text-sm text-[color:var(--status-critical)]">{submitError}</p>
                )}
              </div>
            )}

            {stepErrorText && (
              <p className="mt-2 text-sm text-[color:var(--status-critical)]">{stepErrorText}</p>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 surface-frosted px-4 py-3">
        <div className={`flex gap-2 ${isTablet ? 'mx-auto max-w-xl' : ''}`}>
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            className="sq-press flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-2xl border border-border text-sm font-semibold disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {stepIndex(step) === 0
              ? t('operator.tireMeasure.actions.cancel')
              : t('operator.tireMeasure.actions.back')}
          </button>
          {isReview ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSave()}
              className="sq-press flex min-h-[52px] flex-[2] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand)] text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                t('operator.tireMeasure.actions.save')
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="sq-press flex min-h-[52px] flex-[2] items-center justify-center gap-1 rounded-2xl bg-[color:var(--brand)] text-sm font-bold text-white"
            >
              {t('operator.tireMeasure.actions.continue')}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
