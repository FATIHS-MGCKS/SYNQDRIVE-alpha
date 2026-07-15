import { useMemo, useState } from 'react';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';
import type { ApiTaskDetail } from './types';
import type { CompleteTaskPayload } from './types';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';
import {
  getTaskResolutionCodeOptions,
  taskRequiresResolutionCode,
  taskShowsCostFields,
} from './taskResolution.utils';

export interface TaskCompleteFormState {
  resolutionCode: string;
  resolutionNote: string;
  actualCostEuros: string;
  overrideReason: string;
  useOverride: boolean;
}

export interface TaskCompleteFormErrors {
  resolutionCode?: string;
  resolutionNote?: string;
  actualCostEuros?: string;
  overrideReason?: string;
  submit?: string;
}

export interface TaskCompleteFormModel {
  requiresResolutionCode: boolean;
  requiresResolutionNote: boolean;
  showsCostFields: boolean;
  resolutionCodeOptions: ReturnType<typeof getTaskResolutionCodeOptions>;
  openRequiredTitles: string[];
  canOverride: boolean;
  canSubmitNormally: boolean;
}

export function buildTaskCompleteFormModel(detail: ApiTaskDetail): TaskCompleteFormModel {
  const completionControl = buildTaskCompletionControlModel(detail);
  return {
    requiresResolutionCode: taskRequiresResolutionCode(detail.summary.type),
    requiresResolutionNote: taskRequiresResolutionNote(detail.summary.type),
    showsCostFields: taskShowsCostFields(detail.summary.type),
    resolutionCodeOptions: getTaskResolutionCodeOptions(detail.summary.type),
    openRequiredTitles: completionControl.openRequiredTitles,
    canOverride: completionControl.canOverride,
    canSubmitNormally: completionControl.enabled,
  };
}

export function createTaskCompleteFormState(detail: ApiTaskDetail): TaskCompleteFormState {
  return {
    resolutionCode: detail.completion.resolutionCode ?? detail.resolutionCode ?? '',
    resolutionNote: detail.completion.resolutionNote ?? detail.resolutionNote ?? '',
    actualCostEuros:
      detail.actualCostCents != null ? String((detail.actualCostCents / 100).toFixed(2)) : '',
    overrideReason: '',
    useOverride: false,
  };
}

export function validateTaskCompleteForm(
  detail: ApiTaskDetail,
  form: TaskCompleteFormState,
): TaskCompleteFormErrors {
  const model = buildTaskCompleteFormModel(detail);
  const errors: TaskCompleteFormErrors = {};

  const submittingWithOverride = form.useOverride && model.canOverride;
  if (!model.canSubmitNormally && !submittingWithOverride) {
    errors.submit = 'Offene Pflichtpunkte blockieren den Abschluss.';
  }

  if (model.requiresResolutionCode && !form.resolutionCode.trim()) {
    errors.resolutionCode = 'Bitte wählen Sie einen Abschluss-Code.';
  }

  if (model.requiresResolutionNote && !form.resolutionNote.trim()) {
    errors.resolutionNote = 'Abschluss-Notiz ist für diesen Aufgabentyp erforderlich.';
  }

  if (model.showsCostFields && form.actualCostEuros.trim()) {
    const parsed = Number(form.actualCostEuros.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.actualCostEuros = 'Bitte geben Sie einen gültigen Betrag ein.';
    }
  }

  if (submittingWithOverride && !form.overrideReason.trim()) {
    errors.overrideReason = 'Bitte geben Sie eine Begründung für den Override an.';
  }

  return errors;
}

export function buildCompleteTaskPayload(
  detail: ApiTaskDetail,
  form: TaskCompleteFormState,
): CompleteTaskPayload {
  const payload: CompleteTaskPayload = {};
  const model = buildTaskCompleteFormModel(detail);

  if (form.resolutionCode.trim()) payload.resolutionCode = form.resolutionCode.trim();
  if (form.resolutionNote.trim()) payload.resolutionNote = form.resolutionNote.trim();

  if (model.showsCostFields && form.actualCostEuros.trim()) {
    const euros = Number(form.actualCostEuros.replace(',', '.'));
    if (Number.isFinite(euros) && euros >= 0) {
      payload.actualCostCents = Math.round(euros * 100);
    }
  }

  if (form.useOverride && model.canOverride) {
    payload.overrideIncompleteChecklist = true;
    payload.overrideReason = form.overrideReason.trim();
  }

  return payload;
}

export function useTaskCompleteForm(detail: ApiTaskDetail | null) {
  const [form, setForm] = useState<TaskCompleteFormState>(() =>
    detail ? createTaskCompleteFormState(detail) : {
      resolutionCode: '',
      resolutionNote: '',
      actualCostEuros: '',
      overrideReason: '',
      useOverride: false,
    },
  );
  const [errors, setErrors] = useState<TaskCompleteFormErrors>({});

  const model = useMemo(
    () => (detail ? buildTaskCompleteFormModel(detail) : null),
    [detail],
  );

  const reset = (nextDetail: ApiTaskDetail | null) => {
    setForm(nextDetail ? createTaskCompleteFormState(nextDetail) : {
      resolutionCode: '',
      resolutionNote: '',
      actualCostEuros: '',
      overrideReason: '',
      useOverride: false,
    });
    setErrors({});
  };

  const patch = (partial: Partial<TaskCompleteFormState>) => {
    setForm((current) => ({ ...current, ...partial }));
    setErrors({});
  };

  const validate = () => {
    if (!detail) return false;
    const nextErrors = validateTaskCompleteForm(detail, form);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  return { form, errors, model, patch, reset, validate, setErrors };
}
