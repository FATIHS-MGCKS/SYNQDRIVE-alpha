import { AlertTriangle, ArrowRight, FileText } from 'lucide-react';
import { DataCard, SectionHeader, StatusChip } from '../../../components/patterns';
import type { LegalDocumentCategoryOverview } from '../../lib/legal-documents-overview';
import {
  formatLegalDocumentDate,
  legalDocumentVariantLabel,
} from '../../lib/legal-documents-overview';
import { useLanguage } from '../../i18n/LanguageContext';

interface Props {
  categories: LegalDocumentCategoryOverview[];
  loading?: boolean;
  onSelectCategory?: (categoryKey: string) => void;
}

export function LegalDocumentCategoryCards({ categories, loading, onSelectCategory }: Props) {
  const { t, locale } = useLanguage();

  if (loading) {
    return (
      <div
        className="grid gap-3 lg:grid-cols-3"
        role="status"
        aria-label={t('legalDocuments.categories.loading')}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="surface-premium h-44 animate-pulse rounded-xl border border-border/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title={t('legalDocuments.categories.title')}
        description={t('legalDocuments.categories.description')}
        as="label"
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {categories.map((category) => (
          <DataCard
            key={category.config.key}
            interactive={Boolean(onSelectCategory)}
            ariaLabel={
              onSelectCategory
                ? t('legalDocuments.categories.showHistory', { title: category.title })
                : undefined
            }
            onClick={onSelectCategory ? () => onSelectCategory(category.config.key) : undefined}
            title={category.title}
            description={category.hint}
            className="h-full"
            bodyClassName="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={category.statusTone} dot>
                {category.statusLabel}
              </StatusChip>
              {category.pendingReviewCount > 0 ? (
                <StatusChip tone="info">
                  {t('legalDocuments.categories.inReview', { count: category.pendingReviewCount })}
                </StatusChip>
              ) : null}
              {category.draftCount > 0 ? (
                <StatusChip tone="neutral">
                  {t('legalDocuments.categories.drafts', { count: category.draftCount })}
                </StatusChip>
              ) : null}
            </div>

            {category.activeDocument ? (
              <dl className="grid gap-2 text-[12px]">
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">{t('legalDocuments.categories.activeVersion')}</dt>
                  <dd className="font-medium text-foreground">v{category.activeDocument.versionLabel}</dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">{t('legalDocuments.categories.validSince')}</dt>
                  <dd className="text-foreground">
                    {formatLegalDocumentDate(category.activeSince, locale)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">{t('legalDocuments.categories.approvedBy')}</dt>
                  <dd className="truncate text-foreground">
                    {category.approvedBy ?? category.activatedBy ?? t('legalDocuments.common.emDash')}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">{t('legalDocuments.categories.languageJurisdiction')}</dt>
                  <dd className="text-foreground">
                    {(category.languageLabel ?? t('legalDocuments.common.emDash')).toUpperCase()} ·{' '}
                    {(category.jurisdictionLabel ?? t('legalDocuments.common.emDash')).toUpperCase()}
                  </dd>
                </div>
                {legalDocumentVariantLabel(category.activeDocument, t) ? (
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-muted-foreground">{t('legalDocuments.categories.variant')}</dt>
                    <dd className="text-right text-foreground">
                      {legalDocumentVariantLabel(category.activeDocument, t)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('legalDocuments.categories.noActive')}</span>
              </div>
            )}

            {category.missingCoverage.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
                {category.missingCoverage.join(' · ')}
              </div>
            ) : null}

            {category.issues.length > 0 ? (
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {category.issues.map((issue) => (
                  <li key={issue} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-watch)]" />
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {category.nextAction ? (
              <div className="flex items-center gap-1.5 border-t border-border/60 pt-2 text-[12px] font-medium text-foreground">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{t('legalDocuments.categories.nextStep', { action: category.nextAction })}</span>
              </div>
            ) : null}
          </DataCard>
        ))}
      </div>
    </div>
  );
}
