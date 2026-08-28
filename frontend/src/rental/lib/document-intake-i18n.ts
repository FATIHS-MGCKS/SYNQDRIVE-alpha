import type { IntakeProcessingStepId } from './document-intake-processing-steps';
import type { FlowStatus } from '../components/documents/document-extraction.shared';
import type { UploadValidationCode } from './document-extraction-validation';
import type { TranslationKey } from '../i18n/translations/en';

export type DocumentIntakeTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

const VALIDATION_KEY_MAP: Record<UploadValidationCode, TranslationKey> = {
  NO_VEHICLE: 'docUpload.validation.noVehicle',
  NO_FILE: 'docUpload.validation.noFile',
  MULTIPLE_FILES: 'docUpload.validation.multipleFiles',
  EMPTY_FILE: 'docUpload.validation.emptyFile',
  FILE_TOO_LARGE: 'docUpload.validation.fileTooLarge',
  INVALID_EXTENSION: 'docUpload.validation.invalidExtension',
  INVALID_MIME: 'docUpload.validation.invalidMime',
};

export function validationTranslationKey(code: UploadValidationCode): TranslationKey {
  return VALIDATION_KEY_MAP[code];
}

export function resolveValidationMessage(
  code: UploadValidationCode,
  t: DocumentIntakeTranslate,
  maxMb = 10,
): string {
  const key = validationTranslationKey(code);
  return t(key, code === 'FILE_TOO_LARGE' ? { maxMb } : undefined);
}

export function resolveFlowStatusLabel(status: FlowStatus, t: DocumentIntakeTranslate): string {
  const key = `docUpload.flow.${status}` as TranslationKey;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function resolveProcessingStepLabels(
  t: DocumentIntakeTranslate,
): Record<IntakeProcessingStepId, string> {
  return {
    file_check: t('docUpload.processingStep.fileCheck'),
    file_stored: t('docUpload.processingStep.fileStored'),
    text_recognition: t('docUpload.processingStep.textRecognition'),
    classification: t('docUpload.processingStep.classification'),
    data_preparation: t('docUpload.processingStep.dataPreparation'),
    ready_for_review: t('docUpload.processingStep.readyForReview'),
  };
}

export function extractionFieldTranslationKey(fieldKey: string): TranslationKey {
  return `docUpload.extractionField.${fieldKey.replace(/\./g, '_')}` as TranslationKey;
}

export function resolveExtractionFieldLabel(fieldKey: string, t: DocumentIntakeTranslate): string {
  const key = extractionFieldTranslationKey(fieldKey);
  const translated = t(key);
  return translated === key ? fieldKey : translated;
}

export function resolveDocumentTypeLabel(
  docType: string,
  t: DocumentIntakeTranslate,
  fallback?: string,
): string {
  const key = `documentExtraction.classification.${docType}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return fallback ?? docType;
}

export function resolveClassificationLabelKey(labelKey: string, t: DocumentIntakeTranslate, fallback?: string): string {
  const translated = t(labelKey as TranslationKey);
  return translated === labelKey ? (fallback ?? labelKey) : translated;
}

export function resolveSupportedFormatsLabel(
  extensions: string[],
  maxUploadMb: number,
  t: DocumentIntakeTranslate,
): string {
  const extLabel = extensions.map((e) => e.replace(/^\./, '').toUpperCase()).join(', ');
  return t('docUpload.supportedFormatsTemplate', { extensions: extLabel, maxMb: maxUploadMb });
}

export type DocumentIntakeHostErrorKey =
  | 'docUpload.hostError.extractionFailed'
  | 'docUpload.hostError.retryFailed'
  | 'docUpload.hostError.reextractFailed'
  | 'docUpload.hostError.typeSetFailed'
  | 'docUpload.hostError.saveFieldsBeforeConfirm'
  | 'docUpload.hostError.actionPlanBlocked'
  | 'docUpload.hostError.vehicleRequiredBeforeConfirm'
  | 'docUpload.hostError.confirmFailed'
  | 'docUpload.hostError.loadFailed'
  | 'docUpload.hostError.uploadTargetUnavailable'
  | 'docUpload.hostError.uploadFailed';

export function resolveHostErrorMessage(
  hostErrorKey: DocumentIntakeHostErrorKey | null,
  backendMessage: string | null,
  t: DocumentIntakeTranslate,
  actionPlanBlockedReason?: string | null,
): string | null {
  if (backendMessage) return backendMessage;
  if (!hostErrorKey) return null;
  if (hostErrorKey === 'docUpload.hostError.actionPlanBlocked' && actionPlanBlockedReason) {
    return actionPlanBlockedReason;
  }
  return t(hostErrorKey);
}
