import { StatusChip } from '../../../components/patterns';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import {
  PRODUCT_BUSINESS_STATUS_LABEL_DE,
  businessLaunchStatusForSlug,
  isSelectableProductSlug,
} from '../../organizations/product-management.policy';

const ROADMAP_SLUG_ORDER = ['RENTAL', 'FLEET', 'VYMOD'] as const;

const PRODUCT_DISPLAY_NAME: Record<string, string> = {
  RENTAL: 'SYNQDRIVE Rental',
  FLEET: 'SYNQDRIVE Fleet',
  VYMOD: 'VYMOD',
};

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
}

export function ProductRoadmapOverview({ catalog, stats, loading }: ProductRoadmapOverviewProps) {
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
              <h3 className="font-semibold text-sm">{PRODUCT_DISPLAY_NAME[slug] ?? row?.name ?? slug}</h3>
              {row?.catalogStatus && (
                <StatusChip className="!text-xs" tone="neutral">
                  Katalog: {row.catalogStatus}
                </StatusChip>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground">{slug}</p>
            {business && (
              <StatusChip tone={tone} className="!text-xs">
                {PRODUCT_BUSINESS_STATUS_LABEL_DE[business]}
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
          </div>
        );
      })}
    </div>
  );
}

/** Visible roadmap slugs for tests and filters (excludes TAXI). */
export const VISIBLE_PRODUCT_ROADMAP_SLUGS = ROADMAP_SLUG_ORDER;