import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { EmptyState, SectionHeader, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { MasterErrorState, MasterLoadingState, MasterPageSection } from '../../shell';
import { PageContainer } from '../../shell/PageContainer';
import { MasterPageHeader } from '../../shell/MasterPageHeader';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import { ProductRoadmapOverview } from './ProductRoadmapOverview';
import { ProductCommercialHub } from './ProductCommercialHub';
import type { MasterBillingSection } from '../billing/master-billing-navigation';
import type { OrganizationOperationalRowDto } from '../../organizations/types';
import { fetchProductManagementOrgPage, shouldUpdateOrgListState } from './product-management-org-list';

const ORG_PAGE_SIZE = 25;

interface ProductManagementViewProps {
  onOpenOrgProducts: (orgId: string) => void;
  onOpenBilling: (input: {
    section: MasterBillingSection;
    subTab?: string | null;
    orgId?: string | null;
  }) => void;
}

export function ProductManagementView({ onOpenOrgProducts, onOpenBilling }: ProductManagementViewProps) {
  const [catalog, setCatalog] = useState<AdminCatalogProductRow[]>([]);
  const [stats, setStats] = useState<Array<{ slug: string; totalOrgs?: number; active?: number; trial?: number }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [orgPage, setOrgPage] = useState(1);
  const [orgRows, setOrgRows] = useState<OrganizationOperationalRowDto[]>([]);
  const [orgTotal, setOrgTotal] = useState(0);
  const [orgTotalPages, setOrgTotalPages] = useState(1);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const orgRequestId = useRef(0);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, productStats] = await Promise.all([api.products.list(), api.products.stats()]);
      const rows = Array.isArray(cat) ? cat : [];
      setCatalog(rows.filter((p) => p.slug !== 'TAXI'));
      setStats(Array.isArray(productStats) ? productStats : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Produktdaten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrgPage = useCallback(async () => {
    const requestId = ++orgRequestId.current;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const res = await fetchProductManagementOrgPage(
        { page: orgPage, limit: ORG_PAGE_SIZE, search: submittedSearch },
        requestId,
        (id) => id !== orgRequestId.current,
      );
      if (!res) return;
      setOrgRows(res.data);
      const total = res.meta.total ?? res.data.length;
      const limit = res.meta.limit ?? ORG_PAGE_SIZE;
      const totalPages = res.meta.totalPages ?? Math.max(1, Math.ceil(total / limit));
      setOrgTotal(total);
      setOrgTotalPages(totalPages);
    } catch (e) {
      if (!shouldUpdateOrgListState(requestId, orgRequestId.current)) return;
      setOrgError(e instanceof Error ? e.message : 'Organisationen konnten nicht geladen werden');
      setOrgRows([]);
    } finally {
      if (shouldUpdateOrgListState(requestId, orgRequestId.current)) {
        setOrgLoading(false);
      }
    }
  }, [orgPage, submittedSearch]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void loadOrgPage();
  }, [loadOrgPage]);

  const submitSearch = () => {
    setOrgPage(1);
    setSubmittedSearch(searchInput.trim());
  };

  const selectedOrg = orgRows.find((o) => o.id === selectedOrgId) ?? null;

  return (
    <PageContainer variant="standard">
      <MasterPageHeader
        variant="page"
        title="Produktmanagement"
        description="Plattform-Produktlizenzen, Roadmap-Status und Mandanten-Zuweisungen (SYNQDRIVE-alpha)."
        icon={<Building2 className="w-4 h-4" />}
        actions={(
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshCatalog()}>
            <RefreshCw className="w-4 h-4" aria-hidden />
            <span className="sr-only">Aktualisieren</span>
          </Button>
        )}
      />

      <div className="space-y-8 mt-6">
        <ProductCommercialHub selectedOrgId={selectedOrgId} onOpenBilling={onOpenBilling} />

        <MasterPageSection title="Produktübersicht">
          {loading && <MasterLoadingState variant="card" count={3} />}
          {error && <MasterErrorState title="Katalog" error={error} onRetry={() => void refreshCatalog()} />}
          {!loading && !error && (
            <ProductRoadmapOverview catalog={catalog} stats={stats} loading={loading} />
          )}
        </MasterPageSection>

        <MasterPageSection title="Verfügbarkeit & Roadmap">
          <div className="space-y-3 text-sm text-muted-foreground max-w-3xl">
            <p>
              <strong className="text-foreground">SYNQDRIVE Rental</strong> ist das bestehende operative
              Geschäftsprodukt der Plattform.
            </p>
            <p>
              <strong className="text-foreground">SYNQDRIVE Fleet</strong> und{' '}
              <strong className="text-foreground">VYMOD</strong> befinden sich in der Produktvorbereitung.
              Externe Anwendungen sind noch nicht angebunden; eine Lizenzzuweisung aktiviert keine
              produktionsreife externe App.
            </p>
            <p>
              <StatusChip className="!text-xs" tone="neutral">
                Hinweis
              </StatusChip>{' '}
              <code className="text-xs">ProductCatalogStatus.ACTIVE</code> beschreibt Katalog-Metadaten —
              nicht den Geschäfts-Launch-Status.
            </p>
          </div>
        </MasterPageSection>

        <MasterPageSection title="Organisationen">
          <SectionHeader title="Mandant auswählen" />
          <div className="flex flex-wrap gap-2 mb-4 max-w-xl">
            <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Suche (Name, Kürzel…)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch();
                }}
                aria-label="Organisation suchen"
              />
            </div>
            <Button type="button" variant="secondary" onClick={submitSearch}>
              Suchen
            </Button>
          </div>

          {orgLoading && <MasterLoadingState variant="rows" count={4} />}
          {orgError && (
            <MasterErrorState title="Organisationen" error={orgError} onRetry={() => void loadOrgPage()} />
          )}
          {!orgLoading && !orgError && orgRows.length === 0 && (
            <EmptyState title="Keine Organisationen" description="Passen Sie die Suche an oder laden Sie die Liste neu." />
          )}

          {!orgLoading && !orgError && orgRows.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {orgTotal} Organisation(en) · Seite {orgPage} von {orgTotalPages}
              </p>
              <ul className="space-y-2 mb-4">
                {orgRows.map((org) => (
                  <li key={org.id}>
                    <button
                      type="button"
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selectedOrgId === org.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/60'
                      }`}
                      onClick={() => setSelectedOrgId(org.id)}
                    >
                      <span className="font-semibold">{org.companyName}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        {org.city}, {org.country}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 mb-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={orgPage <= 1 || orgLoading}
                  onClick={() => setOrgPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden />
                  Zurück
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={orgPage >= orgTotalPages || orgLoading}
                  onClick={() => setOrgPage((p) => Math.min(orgTotalPages, p + 1))}
                >
                  Weiter
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </Button>
              </div>
            </>
          )}

          {selectedOrg && (
            <div className="surface-premium p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{selectedOrg.companyName}</p>
                <p className="text-xs text-muted-foreground font-mono">{selectedOrg.id}</p>
              </div>
              <Button
                type="button"
                className="gap-2"
                onClick={() => onOpenOrgProducts(selectedOrg.id)}
              >
                Produkte verwalten
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>
            </div>
          )}
        </MasterPageSection>
      </div>
    </PageContainer>
  );
}