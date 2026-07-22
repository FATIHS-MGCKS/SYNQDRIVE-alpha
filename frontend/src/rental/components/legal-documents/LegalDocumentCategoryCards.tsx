import { AlertTriangle, ArrowRight, FileText } from 'lucide-react';
import { DataCard, SectionHeader, StatusChip } from '../../../components/patterns';
import type { LegalDocumentCategoryOverview } from '../../lib/legal-documents-overview';
import {
  formatLegalDocumentDate,
  legalDocumentVariantLabel,
} from '../../lib/legal-documents-overview';

interface Props {
  categories: LegalDocumentCategoryOverview[];
  loading?: boolean;
  onSelectCategory?: (categoryKey: string) => void;
}

export function LegalDocumentCategoryCards({ categories, loading, onSelectCategory }: Props) {
  if (loading) {
    return (
      <div
        className="grid gap-3 lg:grid-cols-3"
        role="status"
        aria-label="Dokumentkategorien werden geladen"
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
        title="Dokumentkategorien"
        description="Pflicht-Rechtstexte für Buchungs- und Kundenprozesse"
        as="label"
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {categories.map((category) => (
          <DataCard
            key={category.config.key}
            interactive={Boolean(onSelectCategory)}
            ariaLabel={
              onSelectCategory
                ? `${category.config.title} — Versionshistorie anzeigen`
                : undefined
            }
            onClick={onSelectCategory ? () => onSelectCategory(category.config.key) : undefined}
            title={category.config.title}
            description={category.config.hint}
            className="h-full"
            bodyClassName="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={category.statusTone} dot>
                {category.statusLabel}
              </StatusChip>
              {category.pendingReviewCount > 0 ? (
                <StatusChip tone="info">{category.pendingReviewCount} in Prüfung</StatusChip>
              ) : null}
              {category.draftCount > 0 ? (
                <StatusChip tone="neutral">{category.draftCount} Entwurf</StatusChip>
              ) : null}
            </div>

            {category.activeDocument ? (
              <dl className="grid gap-2 text-[12px]">
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">Aktive Version</dt>
                  <dd className="font-medium text-foreground">v{category.activeDocument.versionLabel}</dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">Gültig seit</dt>
                  <dd className="text-foreground">{formatLegalDocumentDate(category.activeSince)}</dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">Freigegeben von</dt>
                  <dd className="truncate text-foreground">
                    {category.approvedBy ?? category.activatedBy ?? '—'}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-muted-foreground">Sprache / Jurisdiktion</dt>
                  <dd className="text-foreground">
                    {(category.languageLabel ?? '—').toUpperCase()} ·{' '}
                    {(category.jurisdictionLabel ?? '—').toUpperCase()}
                  </dd>
                </div>
                {legalDocumentVariantLabel(category.activeDocument) ? (
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-muted-foreground">Variante</dt>
                    <dd className="text-right text-foreground">
                      {legalDocumentVariantLabel(category.activeDocument)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Keine aktive Version — Buchungsanhänge für diese Kategorie fehlen.</span>
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
                <span>Nächster Schritt: {category.nextAction}</span>
              </div>
            ) : null}
          </DataCard>
        ))}
      </div>
    </div>
  );
}
