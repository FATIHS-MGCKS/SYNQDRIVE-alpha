import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  AdminBillingCatalogProductDto,
  AdminBillingPriceSimulationDto,
  AdminBillingPriceTierDto,
  AdminBillingPriceVersionDto,
  AdminBillingPricebookDto,
  AdminStripeCatalogMappingStatusDto,
} from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import {
  formatDateDe,
  formatMoneyCents,
  formatTierRange,
} from './admin-billing.utils';
import { BillingPublishModal } from './BillingPublishModal';
import { MasterPricingSubTabBar } from './MasterPricingSubTabBar';
import {
  addonCatalogProducts,
  baseCatalogProducts,
  catalogProductRoleLabel,
  catalogProductStatusLabel,
  centsToEuroInput,
  isPublishedVersionEditable,
  mapStripeCatalogError,
  parseEuroInput,
  priceVersionDisplayStatusLabel,
  priceVersionDisplayStatusTone,
  pricingModelLabel,
  resolvePriceVersionDisplayStatus,
  tierModeLabel,
  validateTierRows,
} from './master-pricing.utils';
import {
  MASTER_BILLING_PRICING_TABS,
  parseMasterBillingSubTab,
  type MasterBillingPricingTab,
} from './master-billing-navigation';

interface BillingPricingTabProps {
  refreshToken?: number;
  activeSubTab?: string | null;
  onSubTabChange?: (tab: MasterBillingPricingTab) => void;
}

export function BillingPricingTab({
  refreshToken = 0,
  activeSubTab,
  onSubTabChange,
}: BillingPricingTabProps) {
  const pricingTab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_PRICING_TABS.map((tab) => tab.id),
    'products',
  );

  const [catalogProducts, setCatalogProducts] = useState<AdminBillingCatalogProductDto[]>([]);
  const [pricebooks, setPricebooks] = useState<AdminBillingPricebookDto[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminBillingPricebookDto | null>(null);
  const [versions, setVersions] = useState<AdminBillingPriceVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [draftTiers, setDraftTiers] = useState<AdminBillingPriceTierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookProductKey, setNewBookProductKey] = useState('RENTAL');

  const [vehicleCount, setVehicleCount] = useState(10);
  const [discountPercent, setDiscountPercent] = useState('');
  const [simulation, setSimulation] = useState<AdminBillingPriceSimulationDto | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);

  const [stripeTestStatus, setStripeTestStatus] = useState<AdminStripeCatalogMappingStatusDto | null>(
    null,
  );
  const [stripeLiveStatus, setStripeLiveStatus] = useState<AdminStripeCatalogMappingStatusDto | null>(
    null,
  );
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeProductId, setStripeProductId] = useState('');
  const [stripePriceId, setStripePriceId] = useState('');
  const [stripeMode, setStripeMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);

  const baseProducts = useMemo(() => baseCatalogProducts(catalogProducts), [catalogProducts]);
  const addonProducts = useMemo(() => addonCatalogProducts(catalogProducts), [catalogProducts]);
  const creatableProducts = useMemo(
    () => baseProducts.filter((product) => product.status === 'ACTIVE'),
    [baseProducts],
  );

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const isDraft = isPublishedVersionEditable(selectedVersion ?? { status: 'ARCHIVED' });
  const tierIssues = validateTierRows(draftTiers);
  const displayStatus = selectedVersion
    ? resolvePriceVersionDisplayStatus(selectedVersion)
    : null;

  const loadCatalog = useCallback(async () => {
    const products = (await api.billing.catalogProducts()) as AdminBillingCatalogProductDto[];
    setCatalogProducts(products);
    return products;
  }, []);

  const loadBooks = useCallback(async () => {
    const books = (await api.billing.pricebooks()) as AdminBillingPricebookDto[];
    setPricebooks(books);
    return books;
  }, []);

  const loadDetail = useCallback(async (bookId: string) => {
    setDetailLoading(true);
    try {
      const [book, versionList] = await Promise.all([
        api.billing.pricebook(bookId),
        api.billing.pricebookVersions(bookId),
      ]);
      setDetail(book as AdminBillingPricebookDto);
      const vlist = versionList as AdminBillingPriceVersionDto[];
      setVersions(vlist);
      const draft = vlist.find((version) => version.status === 'DRAFT') ?? vlist[0];
      if (draft) {
        setSelectedVersionId(draft.id);
        setDraftTiers(draft.tiers ?? []);
      } else {
        setSelectedVersionId(null);
        setDraftTiers([]);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadStripeStatus = useCallback(async (versionId: string) => {
    setStripeLoading(true);
    try {
      const [testStatus, liveStatus] = await Promise.all([
        api.billing.stripeCatalogMappingStatus(versionId, 'TEST'),
        api.billing.stripeCatalogMappingStatus(versionId, 'LIVE'),
      ]);
      setStripeTestStatus(testStatus as AdminStripeCatalogMappingStatusDto);
      setStripeLiveStatus(liveStatus as AdminStripeCatalogMappingStatusDto);
    } catch (e) {
      setStripeMessage(mapStripeCatalogError(e));
    } finally {
      setStripeLoading(false);
    }
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, books] = await Promise.all([loadCatalog(), loadBooks()]);
      setSelectedBookId((current) => {
        if (current && books.some((book) => book.id === current)) return current;
        const defaultBook =
          books.find((book) => book.isDefault) ??
          products.flatMap((product) => product.priceBooks)[0] ??
          books[0];
        return defaultBook?.id ?? null;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadBooks, loadCatalog]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll, refreshToken]);

  useEffect(() => {
    if (selectedBookId) void loadDetail(selectedBookId);
  }, [selectedBookId, loadDetail, refreshToken]);

  useEffect(() => {
    if (pricingTab === 'stripe' && selectedVersionId) {
      void loadStripeStatus(selectedVersionId);
    }
  }, [pricingTab, selectedVersionId, loadStripeStatus, refreshToken]);

  useEffect(() => {
    if (creatableProducts.length > 0 && !creatableProducts.some((product) => product.key === newBookProductKey)) {
      setNewBookProductKey(creatableProducts[0].key);
    }
  }, [creatableProducts, newBookProductKey]);

  const selectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    const version = versions.find((entry) => entry.id === versionId);
    setDraftTiers(version?.tiers ?? []);
    setSimulation(null);
    setStripeMessage(null);
  };

  const updateTierField = (
    index: number,
    field: keyof AdminBillingPriceTierDto,
    value: number | null,
  ) => {
    setDraftTiers((prev) => prev.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)));
  };

  const updateTierEuroPrice = (index: number, euroValue: string) => {
    updateTierField(index, 'unitPriceCents', parseEuroInput(euroValue));
  };

  const addTier = () => {
    const last = draftTiers[draftTiers.length - 1];
    const nextMin = last ? (last.maxVehicles ?? last.minVehicles) + 1 : 1;
    setDraftTiers((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        minVehicles: nextMin,
        maxVehicles: null,
        unitPriceCents: null,
        sortOrder: prev.length,
      },
    ]);
  };

  const removeTier = (index: number) => {
    setDraftTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const saveTiers = async () => {
    if (!selectedVersionId || !isDraft) return;
    setSaving(true);
    setError(null);
    try {
      await api.billing.replacePriceTiers(
        selectedVersionId,
        draftTiers.map((tier, index) => ({
          minVehicles: tier.minVehicles,
          maxVehicles: tier.maxVehicles,
          unitPriceCents: tier.unitPriceCents,
          sortOrder: index,
        })),
      );
      if (selectedBookId) await loadDetail(selectedBookId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = async () => {
    if (!selectedBookId) return;
    setSaving(true);
    setError(null);
    try {
      await api.billing.createPriceVersion(selectedBookId, {
        versionLabel: `Entwurf v${versions.length + 1}`,
      });
      await loadDetail(selectedBookId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const duplicatePublished = async () => {
    if (!selectedBookId) return;
    const published = versions.find((version) => version.status === 'ACTIVE');
    if (!published) return;
    setSaving(true);
    setError(null);
    try {
      const draft = (await api.billing.createPriceVersion(selectedBookId, {
        versionLabel: `Kopie ${published.versionLabel ?? `v${published.versionNumber}`}`,
      })) as AdminBillingPriceVersionDto;
      if (published.tiers?.length) {
        await api.billing.replacePriceTiers(
          draft.id,
          published.tiers.map((tier, index) => ({
            minVehicles: tier.minVehicles,
            maxVehicles: tier.maxVehicles,
            unitPriceCents: tier.unitPriceCents,
            sortOrder: index,
          })),
        );
        if (published.tierMode) {
          await api.billing.updatePriceVersion(draft.id, { tierMode: published.tierMode as 'VOLUME' | 'GRADUATED' });
        }
      }
      await loadDetail(selectedBookId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (allowUnpriced: boolean) => {
    if (!selectedVersionId) return;
    setSaving(true);
    setError(null);
    try {
      await api.billing.publishPriceVersion(selectedVersionId, { allowUnpriced });
      setPublishOpen(false);
      if (selectedBookId) await loadDetail(selectedBookId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedVersionId || (selectedVersion?.usageCount ?? 0) > 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.billing.archivePriceVersion(selectedVersionId);
      if (selectedBookId) await loadDetail(selectedBookId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePricebook = async () => {
    if (!newBookName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const book = (await api.billing.createPricebook({
        name: newBookName.trim(),
        productKey: newBookProductKey,
        currency: 'EUR',
        isDefault: pricebooks.length === 0,
      })) as AdminBillingPricebookDto;
      setCreateOpen(false);
      setNewBookName('');
      await reloadAll();
      setSelectedBookId(book.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runSimulation = async () => {
    if (!selectedVersionId) return;
    setSimulationLoading(true);
    setError(null);
    try {
      const discountPercentBps = discountPercent
        ? Math.round(Number(discountPercent.replace(',', '.')) * 100)
        : undefined;
      const result = (await api.billing.simulatePriceVersion(selectedVersionId, {
        vehicleCount,
        discountPercentBps,
      })) as AdminBillingPriceSimulationDto;
      setSimulation(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSimulationLoading(false);
    }
  };

  const connectStripeMapping = async () => {
    if (!selectedVersionId || !stripeProductId.trim() || !stripePriceId.trim()) return;
    setStripeLoading(true);
    setStripeMessage(null);
    try {
      await api.billing.connectStripeCatalogMapping(selectedVersionId, {
        stripeMode,
        stripeProductId: stripeProductId.trim(),
        stripePriceId: stripePriceId.trim(),
      });
      setStripeMessage('Stripe-Mapping gespeichert.');
      await loadStripeStatus(selectedVersionId);
    } catch (e) {
      setStripeMessage(mapStripeCatalogError(e));
    } finally {
      setStripeLoading(false);
    }
  };

  const validateStripeMapping = async (mappingId: string) => {
    setStripeLoading(true);
    setStripeMessage(null);
    try {
      await api.billing.validateStripeCatalogMapping(mappingId);
      setStripeMessage('Stripe-Mapping validiert.');
      if (selectedVersionId) await loadStripeStatus(selectedVersionId);
    } catch (e) {
      setStripeMessage(mapStripeCatalogError(e));
    } finally {
      setStripeLoading(false);
    }
  };

  const createStripeCatalog = async (mode: 'TEST' | 'LIVE') => {
    if (!selectedVersionId) return;
    setStripeLoading(true);
    setStripeMessage(null);
    try {
      await api.billing.syncStripePriceVersion(selectedVersionId, { stripeMode: mode });
      setStripeMessage(`Stripe-Katalog (${mode}) erstellt.`);
      await loadStripeStatus(selectedVersionId);
    } catch (e) {
      setStripeMessage(mapStripeCatalogError(e));
    } finally {
      setStripeLoading(false);
    }
  };

  const renderBookPicker = () => (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)] space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Pricebooks</h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="text-[10px] font-semibold text-[var(--brand)]"
        >
          + Neu
        </button>
      </div>
      {pricebooks.length === 0 ? (
        <EmptyState compact title="Keine Pricebooks" />
      ) : (
        pricebooks.map((book) => (
          <button
            key={book.id}
            type="button"
            onClick={() => setSelectedBookId(book.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
              selectedBookId === book.id
                ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                : 'hover:bg-muted/40 text-foreground'
            }`}
          >
            <div>{book.name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {book.productKey} · {book.currency}
              {book.isDefault ? ' · Standard' : ''}
            </div>
          </button>
        ))
      )}
    </div>
  );

  const renderProductsTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4">
      <div className="space-y-4">
        <section className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Grundtarife</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Rental und Fleet mit zugeordneten Pricebooks.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-muted/40">
                  {['Produkt', 'Rolle', 'Status', 'Pricebooks', 'Verwendung'].map((header) => (
                    <th
                      key={header}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseProducts.map((product) => (
                  <tr key={product.id} className="border-t border-border/50">
                    <td className="px-3 py-2 text-xs font-medium">{product.name}</td>
                    <td className="px-3 py-2 text-xs">{catalogProductRoleLabel(product.productRole)}</td>
                    <td className="px-3 py-2 text-xs">{catalogProductStatusLabel(product.status)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{product.priceBookCount}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{product.subscriptionItemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Add-ons (vorbereitet)</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Vorbereitete Zusatzprodukte — noch ohne eigene Staffel-Preislogik in diesem Screen.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-muted/40">
                  {['Add-on', 'Status', 'Verwendung'].map((header) => (
                    <th
                      key={header}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addonProducts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-xs text-muted-foreground">
                      Keine Add-ons im Katalog.
                    </td>
                  </tr>
                ) : (
                  addonProducts.map((product) => (
                    <tr key={product.id} className="border-t border-border/50">
                      <td className="px-3 py-2 text-xs font-medium">{product.name}</td>
                      <td className="px-3 py-2 text-xs">{catalogProductStatusLabel(product.status)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{product.subscriptionItemCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {renderBookPicker()}
    </div>
  );

  const renderVersionsTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {renderBookPicker()}
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
        {detailLoading || !detail ? (
          <SkeletonCard className="h-80" />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold">{detail.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {detail.billingModel} · {detail.interval} · {detail.currency}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void createDraft()}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 hover:bg-muted/40"
                >
                  Neue Version (Entwurf)
                </button>
                <button
                  type="button"
                  onClick={() => void duplicatePublished()}
                  disabled={saving || !versions.some((version) => version.status === 'ACTIVE')}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 hover:bg-muted/40"
                >
                  Veröffentlichte kopieren
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-muted/40">
                    {[
                      'Version',
                      'Status',
                      'Gültig ab',
                      'Währung',
                      'Intervall',
                      'Modell',
                      'Verwendung',
                      '',
                    ].map((header) => (
                      <th
                        key={header}
                        className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => {
                    const status = resolvePriceVersionDisplayStatus(version);
                    return (
                      <tr key={version.id} className="border-t border-border/50">
                        <td className="px-3 py-2 text-xs font-medium">
                          {version.versionLabel ?? `v${version.versionNumber}`}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`px-2 py-0.5 rounded ${priceVersionDisplayStatusTone(status)}`}>
                            {priceVersionDisplayStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDateDe(version.effectiveFrom)}</td>
                        <td className="px-3 py-2 text-xs">{detail.currency}</td>
                        <td className="px-3 py-2 text-xs">{detail.interval}</td>
                        <td className="px-3 py-2 text-xs">{tierModeLabel(version.tierMode)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{version.usageCount ?? 0}</td>
                        <td className="px-3 py-2 text-xs">
                          <button
                            type="button"
                            onClick={() => selectVersion(version.id)}
                            className="text-[var(--brand)] font-semibold"
                          >
                            Auswählen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedVersion && (
              <p className="text-[11px] text-muted-foreground">
                Ausgewählt: {selectedVersion.versionLabel ?? `v${selectedVersion.versionNumber}`} ·{' '}
                {displayStatus ? priceVersionDisplayStatusLabel(displayStatus) : '—'} · Verwendung:{' '}
                {selectedVersion.usageCount ?? 0}. Veröffentlichte Versionen sind schreibgeschützt — Änderungen
                erfordern eine neue Version.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderTiersTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {renderBookPicker()}
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
        {detailLoading || !detail ? (
          <SkeletonCard className="h-80" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => selectVersion(version.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                    selectedVersionId === version.id
                      ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {version.versionLabel ?? `v${version.versionNumber}`} ·{' '}
                  {priceVersionDisplayStatusLabel(resolvePriceVersionDisplayStatus(version))}
                </button>
              ))}
            </div>

            {selectedVersion && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Modell:{' '}
                  <strong className="text-foreground">{tierModeLabel(selectedVersion.tierMode)}</strong>
                </span>
                {isDraft ? (
                  <select
                    value={selectedVersion.tierMode}
                    onChange={(event) => {
                      const tierMode = event.target.value as 'VOLUME' | 'GRADUATED';
                      void api.billing
                        .updatePriceVersion(selectedVersion.id, { tierMode })
                        .then(() => (selectedBookId ? loadDetail(selectedBookId) : undefined));
                    }}
                    className="px-2 py-1 rounded border border-border/70 text-xs"
                  >
                    <option value="VOLUME">Volume</option>
                    <option value="GRADUATED">Graduated</option>
                  </select>
                ) : null}
                {!isDraft ? (
                  <span className="sq-tone-warning px-2 py-0.5 rounded">
                    Veröffentlichte Version — nur Lesen. Neue Version anlegen zum Bearbeiten.
                  </span>
                ) : null}
              </div>
            )}

            {tierIssues.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1">
                {tierIssues.map((issue, index) => (
                  <p key={`${issue.tierIndex}-${issue.kind}-${index}`} className="text-[11px] sq-tone-warning px-2 py-0.5 rounded">
                    Staffel {issue.tierIndex + 1}: {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="bg-muted/40">
                    {['Min', 'Max', 'Preis (€)', ''].map((header) => (
                      <th
                        key={header}
                        className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftTiers.map((tier, index) => {
                    const rowIssues = tierIssues.filter((issue) => issue.tierIndex === index);
                    return (
                      <tr
                        key={tier.id}
                        className={`border-t border-border/50 ${rowIssues.length ? 'bg-[var(--brand-soft)]/20' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            disabled={!isDraft}
                            value={tier.minVehicles}
                            onChange={(event) =>
                              updateTierField(index, 'minVehicles', Number(event.target.value))
                            }
                            className="w-16 px-2 py-1 rounded border border-border/70 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            disabled={!isDraft}
                            value={tier.maxVehicles ?? ''}
                            placeholder="∞"
                            onChange={(event) =>
                              updateTierField(
                                index,
                                'maxVehicles',
                                event.target.value ? Number(event.target.value) : null,
                              )
                            }
                            className="w-16 px-2 py-1 rounded border border-border/70 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={!isDraft}
                            value={centsToEuroInput(tier.unitPriceCents)}
                            placeholder="—"
                            onChange={(event) => updateTierEuroPrice(index, event.target.value)}
                            className="w-24 px-2 py-1 rounded border border-border/70 text-xs"
                          />
                          {tier.unitPriceCents != null && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {formatMoneyCents(tier.unitPriceCents, detail.currency)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isDraft ? (
                            <button
                              type="button"
                              onClick={() => removeTier(index)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Entfernen
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {formatTierRange(1, 8)} · {formatTierRange(9, 19)} · {formatTierRange(20, null)} — Max leer = unbegrenzt
            </p>

            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    onClick={addTier}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
                  >
                    Staffel hinzufügen
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTiers()}
                    disabled={saving || tierIssues.some((issue) => issue.kind !== 'missing_price')}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-white"
                  >
                    Entwurf speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishOpen(true)}
                    disabled={saving || draftTiers.length === 0}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[var(--brand)] text-[var(--brand)]"
                  >
                    Veröffentlichen
                  </button>
                </>
              ) : null}
              {selectedVersion?.status === 'DRAFT' && (selectedVersion.usageCount ?? 0) === 0 ? (
                <button
                  type="button"
                  onClick={() => void handleArchive()}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
                >
                  Entwurf archivieren
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderSimulationTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {renderBookPicker()}
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              onClick={() => selectVersion(version.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                selectedVersionId === version.id
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              {version.versionLabel ?? `v${version.versionNumber}`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Fahrzeugmenge</span>
            <input
              type="number"
              min={0}
              value={vehicleCount}
              onChange={(event) => setVehicleCount(Number(event.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-border/70"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Rabatt (%)</span>
            <input
              type="text"
              inputMode="decimal"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-xl border border-border/70"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void runSimulation()}
              disabled={simulationLoading || !selectedVersionId}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
            >
              Simulation starten
            </button>
          </div>
        </div>

        {simulation ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Grundbetrag', simulation.baseAmountCents],
                ['Rabatt', simulation.discountCents],
                ['Netto', simulation.netCents],
                ['Steuer', simulation.taxCents],
                ['Brutto', simulation.grossCents],
              ].map(([label, cents]) => (
                <div key={label} className="rounded-xl border border-border/60 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                  <div className="text-sm font-semibold mt-1">
                    {typeof cents === 'number'
                      ? formatMoneyCents(cents, simulation.currency)
                      : '—'}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground">
              Modell: {pricingModelLabel(simulation.pricingModel)} · Status: {simulation.calculationStatus}
              {simulation.matchedTier
                ? ` · Staffel ${formatTierRange(
                    simulation.matchedTier.minVehicles,
                    simulation.matchedTier.maxVehicles,
                  )}`
                : ''}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-muted/40">
                    {['Staffel', 'Menge', 'Einzelpreis', 'Summe'].map((header) => (
                      <th
                        key={header}
                        className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simulation.tierLines.map((line) => (
                    <tr key={`${line.sortOrder}-${line.minVehicles}`} className="border-t border-border/50">
                      <td className="px-3 py-2 text-xs">
                        {formatTierRange(line.minVehicles, line.maxVehicles)}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-2 text-xs">
                        {formatMoneyCents(line.unitPriceCents, simulation.currency)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {formatMoneyCents(line.subtotalCents, simulation.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState compact title="Noch keine Simulation" description="Fahrzeugmenge eingeben und starten." />
        )}
      </div>
    </div>
  );

  const renderStripePanel = (
    mode: 'TEST' | 'LIVE',
    status: AdminStripeCatalogMappingStatusDto | null,
  ) => (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{mode === 'TEST' ? 'Test' : 'Live'}</h4>
        <span className="text-[10px] text-muted-foreground">
          Runtime: {status?.runtimeStripeMode ?? '—'}
        </span>
      </div>
      {status?.mapping ? (
        <div className="text-xs space-y-1">
          <div>Product: <code>{status.mapping.stripeProductId}</code></div>
          <div>Price: <code>{status.mapping.stripePriceId}</code></div>
          <div>Status: {status.mapping.mappingStatus}</div>
          {status.mapping.lastError ? (
            <div className="sq-tone-warning px-2 py-1 rounded">{status.mapping.lastError}</div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={stripeLoading}
              onClick={() => void validateStripeMapping(status.mapping!.id)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
            >
              Validieren
            </button>
            <button
              type="button"
              disabled={stripeLoading}
              onClick={() => void createStripeCatalog(mode)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
            >
              Sync / Erstellen
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Kein Mapping vorhanden.</p>
          <button
            type="button"
            disabled={stripeLoading || resolvePriceVersionDisplayStatus(selectedVersion ?? { status: 'DRAFT' }) === 'DRAFT'}
            onClick={() => void createStripeCatalog(mode)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
          >
            Stripe-Produkt/Preis erstellen
          </button>
        </div>
      )}
    </div>
  );

  const renderStripeTab = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {renderBookPicker()}
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              onClick={() => selectVersion(version.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                selectedVersionId === version.id
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              {version.versionLabel ?? `v${version.versionNumber}`}
            </button>
          ))}
        </div>

        {stripeMessage ? (
          <p className="text-xs rounded-lg px-3 py-2 bg-muted/30">{stripeMessage}</p>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderStripePanel('TEST', stripeTestStatus)}
          {renderStripePanel('LIVE', stripeLiveStatus)}
        </div>

        <div className="rounded-xl border border-border/60 p-4 space-y-3">
          <h4 className="text-sm font-semibold">Manuelles Mapping</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={stripeMode}
              onChange={(event) => setStripeMode(event.target.value as 'TEST' | 'LIVE')}
              className="px-3 py-2 rounded-xl border border-border/70 text-xs"
            >
              <option value="TEST">Test</option>
              <option value="LIVE">Live</option>
            </select>
            <input
              value={stripeProductId}
              onChange={(event) => setStripeProductId(event.target.value)}
              placeholder="Stripe Product ID"
              className="px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
            <input
              value={stripePriceId}
              onChange={(event) => setStripePriceId(event.target.value)}
              placeholder="Stripe Price ID"
              className="px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={stripeLoading || !selectedVersionId}
            onClick={() => void connectStripeMapping()}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
          >
            Mapping verbinden
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-10" />
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-96" />
        </div>
      </div>
    );
  }

  if (error && !pricebooks.length && !catalogProducts.length) {
    return (
      <ErrorState
        title="Tarife & Preise nicht verfügbar"
        description={error}
        onRetry={() => void reloadAll()}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="master-pricing-tab">
      <MasterPricingSubTabBar
        activeTab={pricingTab}
        onTabChange={(tab) => onSubTabChange?.(tab)}
      />

      {error ? (
        <p className="text-xs sq-tone-warning rounded-lg px-3 py-2">{error}</p>
      ) : null}

      {pricingTab === 'products' ? renderProductsTab() : null}
      {pricingTab === 'versions' ? renderVersionsTab() : null}
      {pricingTab === 'tiers' ? renderTiersTab() : null}
      {pricingTab === 'simulation' ? renderSimulationTab() : null}
      {pricingTab === 'stripe' ? renderStripeTab() : null}

      <BillingPublishModal
        open={publishOpen}
        onOpenChange={setPublishOpen}
        effectiveFrom={selectedVersion?.effectiveFrom}
        hasMissingPrices={draftTiers.some((tier) => tier.unitPriceCents == null)}
        onConfirm={handlePublish}
        loading={saving}
      />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-premium rounded-2xl p-5 w-full max-w-md shadow-[var(--shadow-2)] space-y-4">
            <h3 className="text-[15px] font-semibold">Pricebook erstellen</h3>
            <input
              value={newBookName}
              onChange={(event) => setNewBookName(event.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
            <select
              value={newBookProductKey}
              onChange={(event) => setNewBookProductKey(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            >
              {creatableProducts.map((product) => (
                <option key={product.id} value={product.key}>
                  {product.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs border border-border/70"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleCreatePricebook()}
                disabled={saving || creatableProducts.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--brand)] text-white font-semibold"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
