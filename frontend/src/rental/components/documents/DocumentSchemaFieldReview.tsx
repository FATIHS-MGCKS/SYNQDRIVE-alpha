import { Icon } from '../ui/Icon';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  countSchemaReviewIssues,
  maskSensitiveValue,
  type SchemaReviewField,
  type SchemaReviewGroup,
} from '../../lib/document-schema-field-review';
import type { PlausibilityStatus } from './document-extraction.shared';

function plausClass(status: PlausibilityStatus): string {
  if (status === 'BLOCKER') {
    return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]';
  }
  if (status === 'WARNING') {
    return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]';
  }
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] text-[color:var(--status-success)]';
}

export interface DocumentSchemaFieldReviewProps {
  groups: SchemaReviewGroup[];
  readOnly?: boolean;
  pending?: boolean;
  isDirty?: boolean;
  hasSavedReview?: boolean;
  saveError?: string | null;
  planInvalidatedHint?: boolean;
  showSource?: boolean;
  isDarkMode?: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onFieldChange: (key: string, value: string) => void;
  onSaveReview: () => void;
  onToggleSource?: () => void;
}

function FieldRow({
  field,
  readOnly,
  isDarkMode,
  t,
  onFieldChange,
}: {
  field: SchemaReviewField;
  readOnly?: boolean;
  isDarkMode?: boolean;
  t: DocumentSchemaFieldReviewProps['t'];
  onFieldChange: (key: string, value: string) => void;
}) {
  const label = field.labelKey
    ? t(field.labelKey as TranslationKey, {}) !== field.labelKey
      ? t(field.labelKey as TranslationKey, {})
      : field.label
    : field.label;

  const displayValue = readOnly && field.sensitive
    ? maskSensitiveValue(field.value, true)
    : field.value;

  return (
    <div
      className={`px-3 py-2.5 min-w-0 border-t border-border first:border-t-0 ${
        isDarkMode ? 'bg-neutral-900/30' : 'bg-muted/10'
      }`}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3 min-w-0">
        <div className="sm:w-44 shrink-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
            {field.required ? (
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('docUpload.fieldReview.required')}
              </span>
            ) : null}
            {field.isMissing ? (
              <span className="rounded-full border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--status-critical)]">
                {t('docUpload.fieldReview.missing')}
              </span>
            ) : null}
          </div>
          {field.showConfidence && field.confidencePercent != null ? (
            <span className="text-[9px] text-muted-foreground">
              {t('docUpload.fieldReview.confidence', { percent: field.confidencePercent })}
            </span>
          ) : null}
        </div>

        <div className="w-full min-w-0 sm:flex-1 space-y-1.5">
          {readOnly ? (
            <span className="block w-full min-w-0 break-words text-[11px] font-medium text-foreground whitespace-pre-wrap">
              {displayValue || '—'}
              {field.unit && displayValue ? (
                <span className="ml-1 text-muted-foreground">{field.unit}</span>
              ) : null}
            </span>
          ) : field.fieldType === 'multiline' ? (
            <textarea
              value={field.value}
              rows={3}
              onChange={(e) => onFieldChange(field.key, e.target.value)}
              className="w-full min-w-0 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
            />
          ) : field.enumValues?.length ? (
            <select
              value={field.value}
              onChange={(e) => onFieldChange(field.key, e.target.value)}
              className="w-full min-w-0 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
            >
              <option value="">—</option>
              {field.enumValues.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <input
                value={field.value}
                onChange={(e) => onFieldChange(field.key, e.target.value)}
                className="w-full min-w-0 flex-1 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
              />
              {field.unit ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">{field.unit}</span>
              ) : null}
            </div>
          )}

          {field.fieldChecks.length > 0 ? (
            <div className="space-y-1">
              {field.fieldChecks.map((check, index) => (
                <div
                  key={`${field.key}-${check.code}-${index}`}
                  className={`rounded-md border px-2 py-1 text-[10px] ${plausClass(check.status)}`}
                >
                  {check.message}
                </div>
              ))}
            </div>
          ) : null}

          {field.showSource && field.provenance ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
              {field.provenance.page != null ? (
                <div>
                  {t('docUpload.fieldReview.sourcePage', { page: field.provenance.page })}
                </div>
              ) : null}
              {field.provenance.textEvidence ? (
                <div className="mt-0.5 break-words">{field.provenance.textEvidence}</div>
              ) : (
                <div>{t('docUpload.fieldReview.noSourceSnippet')}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DocumentSchemaFieldReview({
  groups,
  readOnly = false,
  pending = false,
  isDirty = false,
  hasSavedReview = false,
  saveError = null,
  planInvalidatedHint = false,
  showSource = false,
  isDarkMode = false,
  t,
  onFieldChange,
  onSaveReview,
  onToggleSource,
}: DocumentSchemaFieldReviewProps) {
  const issues = countSchemaReviewIssues(groups);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border px-3 py-4 text-[11px] text-muted-foreground">
        {t('docUpload.fieldReview.noFields')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {issues.missingRequired > 0 ? (
            <span className="rounded-full border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--status-critical)]">
              {t('docUpload.fieldReview.missingCount', { count: issues.missingRequired })}
            </span>
          ) : null}
          {issues.blockers > 0 ? (
            <span className="rounded-full border border-[color:var(--status-critical)]/30 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--status-critical)]">
              {t('docUpload.fieldReview.blockerCount', { count: issues.blockers })}
            </span>
          ) : null}
          {issues.warnings > 0 ? (
            <span className="rounded-full border border-[color:var(--status-watch)]/30 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--status-watch)]">
              {t('docUpload.fieldReview.warningCount', { count: issues.warnings })}
            </span>
          ) : null}
        </div>
        {onToggleSource ? (
          <button
            type="button"
            onClick={onToggleSource}
            className="text-[10px] font-semibold text-primary"
          >
            {showSource ? t('docUpload.fieldReview.hideSource') : t('docUpload.fieldReview.showSource')}
          </button>
        ) : null}
      </div>

      {planInvalidatedHint ? (
        <div className="rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[10px] text-[color:var(--status-watch)]">
          {t('docUpload.fieldReview.planInvalidatedHint')}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.id} className="overflow-hidden rounded-xl border border-border">
          <div className={`border-b border-border px-3 py-2 ${isDarkMode ? 'bg-neutral-900/50' : 'bg-muted/20'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(group.labelKey as TranslationKey)}
            </span>
          </div>
          {group.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              readOnly={readOnly}
              isDarkMode={isDarkMode}
              t={t}
              onFieldChange={onFieldChange}
            />
          ))}
        </div>
      ))}

      {!readOnly ? (
        <div className="space-y-2">
          {isDirty ? (
            <p className="text-[10px] text-muted-foreground">{t('docUpload.fieldReview.unsavedHint')}</p>
          ) : hasSavedReview ? (
            <p className="text-[10px] text-muted-foreground">{t('docUpload.fieldReview.savedHint')}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{t('docUpload.fieldReview.saveBeforeConfirmHint')}</p>
          )}
          {saveError ? <p className="text-[10px] text-[color:var(--status-critical)]">{saveError}</p> : null}
          <button
            type="button"
            onClick={onSaveReview}
            disabled={pending || !isDirty}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/30 ${
              pending || !isDirty ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <Icon name="save" className="h-3.5 w-3.5" />
            {pending ? t('docUpload.fieldReview.saving') : t('docUpload.fieldReview.saveAndRecheck')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
