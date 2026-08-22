import { useCallback, useMemo, useState } from 'react';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { ApiTaskDetail } from './types';
import type { CompleteTaskPayload } from './types';
import {
  taskDetailValidationBlockedByChecklist,
  taskDetailValidationInvalidCost,
  taskDetailValidationOverrideReasonRequired,
  taskDetailValidationResolutionCodeRequired,
  taskDetailValidationResolutionNoteRequired,
} from './task-detail-actions-presentation-i18n';
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

export function buildTaskCompleteFormModel(
  detail: ApiTaskDetail,
  locale: string,
): TaskCompleteFormModel {
  const completionControl = buildTaskCompletionControlModel(detail, locale);
  return {
    requiresResolutionCode: taskRequiresResolutionCode(detail.summary.type),
    requiresResolutionNote: taskRequiresResolutionNote(detail.summary.type),
    showsCostFields: taskShowsCostFields(detail.summary.type),
    resolutionCodeOptions: getTaskResolutionCodeOptions(detail.summary.type, locale),
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
  locale: string,
): TaskCompleteFormErrors {
  const model = buildTaskCompleteFormModel(detail, locale);
  const errors: TaskCompleteFormErrors = {};

  const submittingWithOverride = form.useOverride && model.canOverride;
  if (!model.canSubmitNormally && !submittingWithOverride) {
    errors.submit = taskDetailValidationBlockedByChecklist(locale);
  }

  if (model.requiresResolutionCode && !form.resolutionCode.trim()) {
    errors.resolutionCode = taskDetailValidationResolutionCodeRequired(locale);
  }

  if (model.requiresResolutionNote && !form.resolutionNote.trim()) {
    errors.resolutionNote = taskDetailValidationResolutionNoteRequired(locale);
  }

  if (model.showsCostFields && form.actualCostEuros.trim()) {
    const parsed = Number(form.actualCostEuros.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.actualCostEuros = taskDetailValidationInvalidCost(locale);
    }
  }

  if (submittingWithOverride && !form.overrideReason.trim()) {
    errors.overrideReason = taskDetailValidationOverrideReasonRequired(locale);
  }

  return errors;
}

export function buildCompleteTaskPayload(
  detail: ApiTaskDetail,
  form: TaskCompleteFormState,
): CompleteTaskPayload {
  const payload: CompleteTaskPayload = {};
  const showsCostFields = taskShowsCostFields(detail.summary.type);
  const canOverride = detail.availableActions.overrideCompletion.enabled;

  if (form.resolutionCode.trim()) payload.resolutionCode = form.resolutionCode.trim();
  if (form.resolutionNote.trim()) payload.resolutionNote = form.resolutionNote.trim();

  if (showsCostFields && form.actualCostEuros.trim()) {
    const euros = Number(form.actualCostEuros.replace(',', '.'));
    if (Number.isFinite(euros) && euros >= 0) {
      payload.actualCostCents = Math.round(euros * 100);
    }
  }

  if (form.useOverride && canOverride) {
    payload.overrideIncompleteChecklist = true;
    payload.overrideReason = form.overrideReason.trim();
  }

  return payload;
}

export function useTaskCompleteForm(detail: ApiTaskDetail | null) {
  const { locale } = useLanguage();
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
    () => (detail ? buildTaskCompleteFormModel(detail, locale) : null),
    [detail, locale],
  );

  const reset = useCallback((nextDetail: ApiTaskDetail | null) => {
    setForm(
      nextDetail
        ? createTaskCompleteFormState(nextDetail)
        : {
            resolutionCode: '',
            resolutionNote: '',
            actualCostEuros: '',
            overrideReason: '',
            useOverride: false,
          },
    );
    setErrors({});
  }, []);

  const patch = (partial: Partial<TaskCompleteFormState>) => {
    setForm((current) => ({ ...current, ...partial }));
    setErrors({});
  };

  const validate = () => {
    if (!detail) return false;
    const nextErrors = validateTaskCompleteForm(detail, form, locale);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  return { form, errors, model, patch, reset, validate, setErrors };
}
