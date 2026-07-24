import { AlertTriangle, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { FormDialog } from '../../../../../components/patterns';
import type { LifecycleActionKind } from '../../../../lib/data-processing-lifecycle.types';
import { LIFECYCLE_ACTION_MATRIX } from '../../../../lib/data-processing-lifecycle.types';
import { useLooseLanguage } from '../../../../lib/data-processing-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: LifecycleActionKind | null;
  loading?: boolean;
  error?: string | null;
  onConfirm: (payload: { reason?: string; scheduleDate?: string; extendValidUntil?: string }) => void;
}

export function LifecycleActionDialog({
  open,
  onOpenChange,
  action,
  loading,
  error,
  onConfirm,
}: Props) {
  const { t } = useLooseLanguage();
  const errorSummaryId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [extendValidUntil, setExtendValidUntil] = useState('');

  if (!action) return null;

  const def = LIFECYCLE_ACTION_MATRIX[action];
  const isCritical = def.tone === 'critical';
  const requiresReason = def.requiresReason;
  const reasonMissing = requiresReason && !reason.trim();

  const handleClose = (next: boolean) => {
    if (!next) {
      setReason('');
      setScheduleDate('');
      setExtendValidUntil('');
    }
    onOpenChange(next);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      title={t(def.labelKey)}
      description={t(def.descriptionKey)}
      maxWidthClassName="sm:max-w-md"
      closeAriaLabel={t('common.close')}
      footer={
        <>
          <button
            type="button"
            onClick={() => handleClose(false)}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            {t('dataProcessing.lifecycle.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || reasonMissing}
            onClick={() =>
              onConfirm({
                reason: reason.trim() || undefined,
                scheduleDate: scheduleDate || undefined,
                extendValidUntil: extendValidUntil || undefined,
              })
            }
            className={`px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 ${
              isCritical
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'sq-3d-btn sq-3d-btn--primary'
            }`}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t(def.labelKey)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div
            id={errorSummaryId}
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
          >
            {error}
          </div>
        ) : null}

        {def.impactKey ? (
          <div
            className={`rounded-xl border p-3 flex gap-2.5 ${
              isCritical ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/10'
            }`}
            role="alert"
          >
            <AlertTriangle
              className={`w-4 h-4 shrink-0 mt-0.5 ${isCritical ? 'text-destructive' : 'text-amber-600'}`}
              aria-hidden
            />
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">{t(def.impactKey)}</p>
          </div>
        ) : null}

        {def.separatesFrom ? (
          <p className="text-[11px] text-muted-foreground">
            {t('dataProcessing.lifecycle.separatesFrom', {
              other: t(LIFECYCLE_ACTION_MATRIX[def.separatesFrom].labelKey),
            })}
          </p>
        ) : null}

        {def.requiresScheduleDate ? (
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium">{t('dataProcessing.lifecycle.scheduleDate')}</span>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </label>
        ) : null}

        {action === 'supersede' ? (
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium">{t('dataProcessing.lifecycle.extendValidUntil')}</span>
            <input
              type="date"
              value={extendValidUntil}
              onChange={(e) => setExtendValidUntil(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </label>
        ) : null}

        {requiresReason ? (
          <label className="block space-y-1.5" htmlFor={reasonId}>
            <span className="text-[12px] font-medium">
              {t('dataProcessing.lifecycle.reason')}
              <span className="text-destructive ml-0.5" aria-hidden>
                *
              </span>
            </span>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              aria-required="true"
              aria-invalid={reasonMissing || undefined}
              aria-describedby={error ? errorSummaryId : undefined}
              placeholder={t('dataProcessing.lifecycle.reasonPlaceholder')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </label>
        ) : null}
      </div>
    </FormDialog>
  );
}
