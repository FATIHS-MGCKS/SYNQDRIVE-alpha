import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  formatRecognitionReasonList,
  parseDocumentClassificationResult,
  resolveClassificationDisplayLabel,
  type DocumentClassificationResultView,
} from '../../lib/document-classification-result';
import { formatConfidencePercent } from '../../lib/document-extraction-lifecycle';
import type { PublicDocumentExtraction } from '../../lib/document-extraction.types';

type DocTypeOption = { value: string; labelKey: string };

export interface DocumentClassificationResultPanelProps {
  record: Pick<
    PublicDocumentExtraction,
    | 'plausibility'
    | 'documentCategory'
    | 'documentSubtype'
    | 'classificationConfidence'
    | 'detectedDocumentType'
    | 'effectiveDocumentType'
    | 'documentType'
    | 'classificationMode'
    | 'allowedActions'
    | 'status'
  > | null;
  locale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  typeLabel: (labelKey: string, fallback?: string) => string;
  isDarkMode?: boolean;
  mode?: 'review' | 'awaiting_type';
  docTypeOptions?: DocTypeOption[];
  pendingTypeSelection?: string;
  onPendingTypeChange?: (value: string) => void;
  onSetDocumentType?: (type: string, reextract: boolean) => void;
  disabled?: boolean;
}

function confidenceTone(
  band: DocumentClassificationResultView['confidenceBand'],
  isDarkMode: boolean,
): string {
  switch (band) {
    case 'high':
      return isDarkMode ? 'bg-green-500/10 text-green-300 border-green-500/30' : 'bg-green-50 text-green-800 border-green-200';
    case 'medium':
      return isDarkMode ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-900 border-amber-200';
    case 'low':
      return isDarkMode ? 'bg-red-500/10 text-red-300 border-red-500/30' : 'bg-red-50 text-red-800 border-red-200';
    default:
      return 'surface-solid text-foreground border-border';
  }
}

export function DocumentClassificationResultPanel({
  record,
  locale,
  t,
  typeLabel,
  isDarkMode = false,
  mode = 'review',
  docTypeOptions = [],
  pendingTypeSelection = '',
  onPendingTypeChange,
  onSetDocumentType,
  disabled = false,
}: DocumentClassificationResultPanelProps) {
  const [showTypeChange, setShowTypeChange] = useState(mode === 'awaiting_type');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const result = useMemo(() => parseDocumentClassificationResult(record), [record]);
  const manualDocTypes = useMemo(
    () => docTypeOptions.filter((option) => option.value !== 'AUTO'),
    [docTypeOptions],
  );

  if (!result) return null;

  const displayLabel = resolveClassificationDisplayLabel({
    subtype: result.subtype,
    legacyDocumentType: result.legacyDocumentType,
    typeLabel,
  });
  const categoryLabel = result.category
    ? typeLabel(`documentExtraction.category.${result.category}`, result.category)
    : null;
  const confidencePercent = formatConfidencePercent(result.confidence);
  const reasonList = formatRecognitionReasonList(result.recognitionReasonKeys, t, locale);
  const canChangeType =
    mode === 'awaiting_type' ||
    (record?.allowedActions?.includes('set_document_type') && mode === 'review');

  const headline = result.isUncertain && mode === 'awaiting_type'
    ? t('docUpload.classificationUncertain')
    : t('docUpload.classificationRecognizedAs', { label: displayLabel });

  return (
    <section
      className="rounded-lg border p-3 sm:p-4 min-w-0 space-y-3 border-border bg-muted/70"
      aria-label={t('docUpload.classificationPanelAria')}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-start gap-2 min-w-0">
            <Icon
              name={result.isUncertain ? 'alert-circle' : 'sparkles'}
              className={`w-4 h-4 shrink-0 mt-0.5 ${result.isUncertain ? 'text-amber-500' : 'text-brand'}`}
            />
            <div className="min-w-0">
              <h4 className={`text-sm font-semibold break-words text-foreground`}>
                {headline}
              </h4>
              {(categoryLabel || result.subtype) && (
                <p className={`text-xs break-words text-muted-foreground`}>
                  {categoryLabel ? `${t('docUpload.category')}: ${categoryLabel}` : null}
                  {categoryLabel && result.subtype ? ' · ' : null}
                  {result.subtype
                    ? `${t('docUpload.classificationSubtype')}: ${typeLabel(`documentExtraction.subtype.${result.subtype}`, result.subtype)}`
                    : null}
                </p>
              )}
            </div>
          </div>
        </div>
        {confidencePercent ? (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${confidenceTone(result.confidenceBand, isDarkMode)}`}
          >
            {t(`docUpload.classificationConfidence.${result.confidenceBand}`)}
            {result.confidenceBand !== 'unknown' ? ` · ${confidencePercent}` : ''}
          </span>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${confidenceTone('unknown', isDarkMode)}`}
          >
            {t('docUpload.classificationConfidence.unknown')}
          </span>
        )}
      </div>

      {reasonList ? (
        <p className={`text-xs break-words ${isDarkMode ? 'text-muted-foreground' : 'text-foreground'}`}>
          {t('docUpload.classificationRecognizedBecause', { reasons: reasonList })}
        </p>
      ) : null}

      {result.isUncertain && result.alternatives.length > 0 ? (
        <div className="min-w-0 space-y-1.5">
          <p className={`text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}>
            {t('docUpload.classificationAlternatives')}
          </p>
          <ul className="space-y-1">
            {result.alternatives.map((alt) => {
              const altLabel = resolveClassificationDisplayLabel({
                subtype: alt.subtype,
                legacyDocumentType: alt.legacyDocumentType,
                typeLabel,
              });
              const altConfidence = formatConfidencePercent(alt.confidence);
              return (
                <li
                  key={`${alt.category}-${alt.subtype}-${alt.legacyDocumentType}`}
                  className={`text-xs rounded-md px-2 py-1.5 break-words surface-solid text-foreground border border-border`}
                >
                  <span className="font-medium">{altLabel}</span>
                  {altConfidence ? <span className="opacity-80"> · {altConfidence}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mode === 'review' && result.isUncertain ? (
        <p className={`text-xs ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
          {t('docUpload.classificationVerifyHint')}
        </p>
      ) : null}

      {canChangeType ? (
        <div className="space-y-2 pt-1">
          {mode === 'review' && !showTypeChange ? (
            <button
              type="button"
              onClick={() => setShowTypeChange(true)}
              disabled={disabled}
              className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold surface-solid border border-border text-foreground hover:bg-muted ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Icon name="pencil" className="w-3.5 h-3.5" />
              {t('docUpload.changeDocumentType')}
            </button>
          ) : null}

          {(showTypeChange || mode === 'awaiting_type') && manualDocTypes.length > 0 ? (
            <div className="space-y-2">
              <p className={`text-xs break-words text-muted-foreground`}>
                {t('docUpload.classificationReextractHint')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                <select
                  value={pendingTypeSelection}
                  onChange={(e) => onPendingTypeChange?.(e.target.value)}
                  disabled={disabled}
                  className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-xs border surface-solid border-border text-foreground`}
                >
                  {manualDocTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {typeLabel(opt.labelKey)}
                    </option>
                  ))}
                </select>
                {mode === 'awaiting_type' ? (
                  <button
                    type="button"
                    onClick={() => onSetDocumentType?.(pendingTypeSelection, false)}
                    disabled={disabled || !pendingTypeSelection}
                    className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold bg-brand text-brand-foreground disabled:opacity-50"
                  >
                    {t('docUpload.selectTypeAndContinue')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetDocumentType?.(pendingTypeSelection, true)}
                    disabled={disabled || !pendingTypeSelection}
                    className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold bg-brand text-brand-foreground disabled:opacity-50"
                  >
                    {t('docUpload.reextract')}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {(result.modelVersion || result.contractVersion) && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails((open) => !open)}
            className="text-[10px] font-semibold underline-offset-2 hover:underline text-muted-foreground"
          >
            {showTechnicalDetails ? t('docUpload.classificationHideDetails') : t('docUpload.classificationShowDetails')}
          </button>
          {showTechnicalDetails ? (
            <dl className={`mt-1 space-y-0.5 text-[10px] text-muted-foreground`}>
              {result.contractVersion ? (
                <div className="flex gap-2">
                  <dt className="shrink-0">{t('docUpload.classificationContractVersion')}:</dt>
                  <dd>{result.contractVersion}</dd>
                </div>
              ) : null}
              {result.modelVersion ? (
                <div className="flex gap-2">
                  <dt className="shrink-0">{t('docUpload.classificationModelVersion')}:</dt>
                  <dd>{result.modelVersion}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      )}
    </section>
  );
}
