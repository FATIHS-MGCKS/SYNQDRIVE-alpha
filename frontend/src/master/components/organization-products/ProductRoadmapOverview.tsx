import { Pencil } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/LanguageContext';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import {
  businessLaunchStatusForSlug,
  isSelectableProductSlug,
} from '../../organizations/product-management.policy';

const ROADMAP_SLUG_ORDER = ['RENTAL', 'FLEET', 'VYMOD'] as const;

type ProductStatRow = {
  slug: string;
  totalOrgs?: number;
  active?: number;
  trial?: number;
};

interface ProductRoadmapOverviewProps {
  catalog: AdminCatalogProductRow[];
  stats?: ProductStatRow[];
  loading?: boolean;
  onEditProduct?: (slug: string) => void;
}

export function ProductRoadmapOverview({ catalog, stats, loading, onEditProduct }: ProductRoadmapOverviewProps) {
  const { t } = useLanguage();
  const bySlug = Object.fromEntries(catalog.map((c) => [c.slug, c]));
  const statsBySlug = Object.fromEntries((stats ?? []).map((s) => [s.slug, s]));

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {ROADMAP_SLUG_ORDER.map((slug) => {
        const row = bySlug[slug];
        const business = businessLaunchStatusForSlug(slug);
        const stat = statsBySlug[slug];
        const tone =
          business === 'EXISTING_PRODUCT' ? 'success' : business === 'IN_PREPARATION' ? 'warning' : 'neutral';
        return (
          <div key={slug} className="surface-premium p-4 space-y-2" data-product-slug={slug}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">{row?.name ?? slug}</h3>
              {row?.catalogStatus && (
                <StatusChip className="!text-xs" tone="neutral">
                  Katalog: {row.catalogStatus}
                </StatusChip>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground">{slug}</p>
            {business && (
              <StatusChip tone={tone} className="!text-xs">
                {t(`master.productCatalog.business.${business}` as TranslationKey)}
              </StatusChip>
            )}
            {!loading && stat && (
              <p className="text-xs text-muted-foreground">
                Organisationen mit Zuweisung: {stat.totalOrgs ?? 0}
                {typeof stat.active === 'number' ? ` · aktiv: ${stat.active}` : ''}
              </p>
            )}
            {loading && <p className="text-xs text-muted-foreground">Statistik wird geladen…</p>}
            {!row && !loading && (
              <p className="text-xs text-[color:var(--status-watch)]">Kein Katalogeintrag</p>
            )}
            {row && !isSelectableProductSlug(slug) && (
              <p className="text-xs text-muted-foreground">Nicht zur Neuzuweisung verfügbar</p>
            )}
            {onEditProduct && row && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-2 mt-1"
                onClick={() => onEditProduct(slug)}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden />
                {t('master.productCatalog.editor.editMetadata')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Visible roadmap slugs for tests and filters (excludes TAXI). */
export const VISIBLE_PRODUCT_ROADMAP_SLUGS = ROADMAP_SLUG_ORDER;