import type { PublicDocumentActionPlanPreview } from '../../lib/document-extraction.types';
import {
  resolveActionPreviewStatusLabel,
  resolveActionRequirementLabel,
} from '../../lib/document-action-plan-preview';
import type { TranslationKey } from '../../i18n/translations/en';

function statusClass(status: string): string {
  if (status === 'BLOCKED') {
    return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]';
  }
  if (status === 'DISABLED') {
    return 'border-border bg-muted/20 text-muted-foreground';
  }
  if (status === 'SUGGESTION' || status === 'INFORMATIONAL') {
    return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]';
  }
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] text-[color:var(--status-success)]';
}

function requirementClass(requirement: string): string {
  if (requirement === 'REQUIRED') {
    return 'border-[color:var(--status-critical)]/20 text-[color:var(--status-critical)]';
  }
  if (requirement === 'OPTIONAL') {
    return 'border-[color:var(--status-watch)]/20 text-[color:var(--status-watch)]';
  }
  return 'border-border text-muted-foreground';
}

export interface DocumentActionPlanReviewProps {
  preview: PublicDocumentActionPlanPreview | null;
  loading?: boolean;
  error?: string | null;
  locked?: boolean;
  readOnly?: boolean;
  pendingToggle?: string | null;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onToggleOptional?: (semanticAction: string, enabled: boolean) => void;
}

export function DocumentActionPlanReview({
  preview,
  loading = false,
  error = null,
  locked = false,
  readOnly = false,
  pendingToggle = null,
  t,
  onToggleOptional,
}: DocumentActionPlanReviewProps) {
  if (locked) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
        {t('docUpload.actionPlan.locked')}
      </div>
    );
  }

  if (loading && !preview) {
    return (
      <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
        {t('docUpload.actionPlan.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-3 py-2 text-[10px] text-[color:var(--status-critical)]">
        {error}
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-2">
      <div>
        <p className="sq-section-label mb-1">{t('docUpload.actionPlan.title')}</p>
        <p className="text-[10px] text-muted-foreground">{preview.summary}</p>
        {preview.confirmBlockedReason ? (
          <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">
            {preview.confirmBlockedReason}
          </p>
        ) : null}
      </div>

      {preview.actions.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
          {t('docUpload.actionPlan.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {preview.actions.map((action) => (
            <div
              key={`${action.semanticAction}-${action.sequence}`}
              className={`rounded-xl border px-3 py-2.5 ${action.status === 'DISABLED' ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-foreground">{action.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t('docUpload.actionPlan.targetModule')}: {action.targetModuleLabel}
                    {action.targetEntityLabel
                      ? ` · ${t('docUpload.actionPlan.targetEntity')}: ${action.targetEntityLabel}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${requirementClass(action.requirement)}`}
                  >
                    {resolveActionRequirementLabel(action.requirement, (key) => t(key as TranslationKey))}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusClass(action.status)}`}
                  >
                    {resolveActionPreviewStatusLabel(action.status, (key) => t(key as TranslationKey))}
                  </span>
                </div>
              </div>

              {action.writableFields.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('docUpload.actionPlan.writableData')}
                  </p>
                  {action.writableFields.map((field) => (
                    <div key={field.key} className="flex flex-wrap gap-x-2 text-[10px]">
                      <span className="text-muted-foreground">{field.label}:</span>
                      <span className="font-medium text-foreground">{field.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {action.missingPrerequisites.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[color:var(--status-critical)]">
                    {t('docUpload.actionPlan.missingPrerequisites')}
                  </p>
                  {action.missingPrerequisites.map((issue) => (
                    <p key={issue.code} className="text-[10px] text-[color:var(--status-critical)]">
                      {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}

              {action.conflicts.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[color:var(--status-watch)]">
                    {t('docUpload.actionPlan.conflicts')}
                  </p>
                  {action.conflicts.map((issue) => (
                    <p key={issue.code} className="text-[10px] text-[color:var(--status-watch)]">
                      {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}

              {action.toggleable && !readOnly ? (
                <label className="mt-2 flex items-center gap-2 text-[10px] text-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border"
                    checked={action.enabled}
                    disabled={pendingToggle === action.semanticAction}
                    onChange={(event) =>
                      onToggleOptional?.(action.semanticAction, event.target.checked)
                    }
                  />
                  <span>{t('docUpload.actionPlan.includeOptional')}</span>
                </label>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
