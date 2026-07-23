import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { formatRuleValue, labelRuleField } from './rental-rules.utils';
import type { RentalRulePublishScope } from './RentalRulePublishImpactPanel';

export type RentalRulePreviewMode = 'active' | 'draft' | 'diff';

interface RentalRuleLivePreviewPanelProps {
  orgId: string;
  scope: RentalRulePublishScope;
  scopeEntityId?: string;
  className?: string;
}

interface PreviewResponse {
  activeRevision: { id: string; version: number; rulesHash: string } | null;
  draftRevision: { id: string; version: number; rulesHash: string } | null;
  preview: {
    mode: RentalRulePreviewMode;
    hasChanges: boolean;
    ruleDiffs: Array<{
      field: string;
      active: unknown;
      draft: unknown;
      changed: boolean;
    }>;
  };
}

export function RentalRuleLivePreviewPanel({
  orgId,
  scope,
  scopeEntityId,
  className,
}: RentalRuleLivePreviewPanelProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<RentalRulePreviewMode>('diff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.rentalRules.previewRevision(orgId, scope, {
        mode,
        scopeEntityId,
      });
      setPreview(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('rentalRules.workflow.preview.loadError'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [mode, orgId, scope, scopeEntityId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const changedRows = preview?.preview.ruleDiffs.filter((row) => row.changed) ?? [];

  return (
    <section
      className={className}
      aria-labelledby="rental-rules-live-preview-title"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="rental-rules-live-preview-title" className="text-[13px] font-semibold text-foreground">
            {t('rentalRules.workflow.preview.title')}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t('rentalRules.workflow.preview.description')}
          </p>
        </div>
        <div
          role="tablist"
          aria-label={t('rentalRules.workflow.preview.modeLabel')}
          className="flex flex-wrap gap-1"
        >
          {(['active', 'draft', 'diff'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              className={`min-h-8 rounded-lg border px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
                mode === tab
                  ? 'border-brand/50 bg-brand/10 text-foreground'
                  : 'border-border/70 text-muted-foreground'
              }`}
              onClick={() => setMode(tab)}
            >
              {t(`rentalRules.workflow.preview.mode.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t('rentalRules.workflow.preview.loading')}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {preview && !loading && !error ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-[12px]">
              <p className="text-muted-foreground">{t('rentalRules.workflow.preview.productive')}</p>
              <p className="mt-0.5 font-medium text-foreground">
                {preview.activeRevision
                  ? t('rentalRules.workflow.preview.revisionMeta', {
                      version: preview.activeRevision.version,
                      hash: preview.activeRevision.rulesHash.slice(0, 8),
                    })
                  : t('rentalRules.workflow.preview.none')}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-[12px]">
              <p className="text-muted-foreground">{t('rentalRules.workflow.preview.draft')}</p>
              <p className="mt-0.5 font-medium text-foreground">
                {preview.draftRevision
                  ? t('rentalRules.workflow.preview.revisionMeta', {
                      version: preview.draftRevision.version,
                      hash: preview.draftRevision.rulesHash.slice(0, 8),
                    })
                  : t('rentalRules.workflow.preview.none')}
              </p>
            </div>
          </div>

          {mode === 'diff' && !preview.preview.hasChanges ? (
            <p className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
              {t('rentalRules.workflow.preview.noChanges')}
            </p>
          ) : null}

          {changedRows.length > 0 ? (
            <ul className="space-y-2">
              {changedRows.map((row) => (
                <li
                  key={row.field}
                  className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    <span className="font-medium text-foreground">{labelRuleField(row.field)}</span>
                  </div>
                  <div className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-2">
                    <p>
                      <span className="text-foreground/70">{t('rentalRules.workflow.preview.before')}:</span>{' '}
                      {formatRuleValue(row.field, row.active)}
                    </p>
                    <p>
                      <span className="text-foreground/70">{t('rentalRules.workflow.preview.after')}:</span>{' '}
                      {formatRuleValue(row.field, row.draft)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
