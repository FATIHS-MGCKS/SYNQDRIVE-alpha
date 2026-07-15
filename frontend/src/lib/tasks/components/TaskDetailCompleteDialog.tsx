import { useEffect } from 'react';
import { AppDialog } from '../../../components/patterns/app-dialog';
import { Button } from '../../../components/ui/button';
import type { ApiTaskDetail } from '../types';
import {
  buildCompleteTaskPayload,
  useTaskCompleteForm,
} from '../taskCompleteForm.utils';

export interface TaskDetailCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ApiTaskDetail | null;
  loading?: boolean;
  submitError?: string | null;
  onSubmit: (payload: ReturnType<typeof buildCompleteTaskPayload>) => Promise<void>;
}

export function TaskDetailCompleteDialog({
  open,
  onOpenChange,
  detail,
  loading = false,
  submitError,
  onSubmit,
}: TaskDetailCompleteDialogProps) {
  const { form, errors, model, patch, reset, validate, setErrors } = useTaskCompleteForm(detail);

  useEffect(() => {
    if (open && detail) reset(detail);
  }, [open, detail, reset]);

  const handleSubmit = async () => {
    if (!detail || !validate()) return;
    setErrors({});
    try {
      await onSubmit(buildCompleteTaskPayload(detail, form));
    } catch {
      // Parent sets submitError; keep dialog open.
    }
  };

  if (!detail || !model) return null;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} maxWidthClassName="sm:max-w-lg" hideClose>
      <div className="p-5">
        <h2 className="text-base font-semibold text-foreground">Aufgabe abschließen</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Prüfen Sie die Pflichtangaben, bevor Sie die Aufgabe erledigen.
        </p>

        {model.openRequiredTitles.length > 0 && (
          <div className="mt-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2">
            <p className="text-[11px] font-semibold text-[color:var(--status-watch)]">
              Offene Pflichtpunkte
            </p>
            <ul className="mt-1 list-inside list-disc text-[11px] text-[color:var(--status-watch)]">
              {model.openRequiredTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </div>
        )}

        {model.requiresResolutionCode && (
          <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
            Abschluss-Code *
            <select
              value={form.resolutionCode}
              onChange={(event) => patch({ resolutionCode: event.target.value })}
              disabled={loading}
              className="mt-1.5 w-full rounded-lg border border-border surface-premium px-3 py-2 text-xs"
            >
              <option value="">Bitte wählen …</option>
              {model.resolutionCodeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {errors.resolutionCode && (
          <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">
            {errors.resolutionCode}
          </p>
        )}

        <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
          Abschluss-Notiz{model.requiresResolutionNote ? ' *' : ''}
          <textarea
            value={form.resolutionNote}
            onChange={(event) => patch({ resolutionNote: event.target.value })}
            disabled={loading}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs"
            placeholder="Ergebnis / durchgeführte Maßnahmen dokumentieren"
          />
        </label>
        {errors.resolutionNote && (
          <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">
            {errors.resolutionNote}
          </p>
        )}

        {model.showsCostFields && (
          <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
            Tatsächliche Kosten (EUR)
            <input
              type="text"
              inputMode="decimal"
              value={form.actualCostEuros}
              onChange={(event) => patch({ actualCostEuros: event.target.value })}
              disabled={loading}
              className="mt-1.5 w-full rounded-lg border border-border surface-premium px-3 py-2 text-xs"
              placeholder="z. B. 149,00"
            />
          </label>
        )}
        {errors.actualCostEuros && (
          <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">
            {errors.actualCostEuros}
          </p>
        )}

        {model.canOverride && !model.canSubmitNormally && (
          <div className="mt-4 rounded-lg border border-border/70 bg-muted/15 p-3">
            <label className="flex items-start gap-2 text-[11px] font-semibold text-foreground">
              <input
                type="checkbox"
                checked={form.useOverride}
                onChange={(event) => patch({ useOverride: event.target.checked })}
                disabled={loading}
                className="mt-0.5"
              />
              <span>Trotz offener Pflichtpunkte abschließen (Manager)</span>
            </label>
            {form.useOverride && (
              <textarea
                value={form.overrideReason}
                onChange={(event) => patch({ overrideReason: event.target.value })}
                disabled={loading}
                rows={3}
                className="mt-2 w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs"
                placeholder="Begründung für den Override"
              />
            )}
            {errors.overrideReason && (
              <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">
                {errors.overrideReason}
              </p>
            )}
          </div>
        )}

        {(errors.submit || submitError) && (
          <p className="mt-3 text-[11px] font-medium text-[color:var(--status-critical)]" role="alert">
            {submitError ?? errors.submit}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="neutral" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="button" size="sm" disabled={loading} onClick={() => void handleSubmit()}>
            {loading ? 'Wird gespeichert …' : 'Abschließen'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
