import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  AdminBillingPriceTierDto,
  AdminBillingPriceVersionDto,
  AdminBillingPricebookDto,
} from '../../types/admin-billing.types';
import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { SkeletonCard } from '../../../components/patterns/states';
import {
  formatDateDe,
  formatMoneyCents,
  formatTierRange,
  validateTierRows,
} from './admin-billing.utils';
import { BillingPublishModal } from './BillingPublishModal';

interface BillingPricingTabProps {
  refreshToken?: number;
}

export function BillingPricingTab({ refreshToken = 0 }: BillingPricingTabProps) {
  const [pricebooks, setPricebooks] = useState<AdminBillingPricebookDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [newBookProduct, setNewBookProduct] = useState('rental');

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const books = (await api.billing.pricebooks()) as AdminBillingPricebookDto[];
      setPricebooks(books);
      if (!selectedId && books[0]) setSelectedId(books[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (bookId: string) => {
    setDetailLoading(true);
    try {
      const [book, vers] = await Promise.all([
        api.billing.pricebook(bookId),
        api.billing.pricebookVersions(bookId),
      ]);
      setDetail(book as AdminBillingPricebookDto);
      const vlist = vers as AdminBillingPriceVersionDto[];
      setVersions(vlist);
      const draft = vlist.find((v) => v.status === 'DRAFT') ?? vlist[0];
      if (draft) {
        setSelectedVersionId(draft.id);
        setDraftTiers(draft.tiers ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks, refreshToken]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail, refreshToken]);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const isDraft = selectedVersion?.status === 'DRAFT';
  const tierIssues = validateTierRows(draftTiers);

  const selectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    const v = versions.find((x) => x.id === versionId);
    setDraftTiers(v?.tiers ?? []);
  };

  const updateTierField = (
    index: number,
    field: keyof AdminBillingPriceTierDto,
    value: number | null,
  ) => {
    setDraftTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
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
    try {
      await api.billing.replacePriceTiers(
        selectedVersionId,
        draftTiers.map((t, i) => ({
          minVehicles: t.minVehicles,
          maxVehicles: t.maxVehicles,
          unitPriceCents: t.unitPriceCents,
          sortOrder: i,
        })),
      );
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.billing.createPriceVersion(selectedId, {
        versionLabel: `Draft v${versions.length + 1}`,
      });
      await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const duplicateActive = async () => {
    if (!selectedId) return;
    const active = versions.find((v) => v.status === 'ACTIVE');
    if (!active) return;
    setSaving(true);
    try {
      const draft = await api.billing.createPriceVersion(selectedId, {
        versionLabel: `Copy of ${active.versionLabel ?? active.versionNumber}`,
      });
      if (active.tiers?.length) {
        await api.billing.replacePriceTiers(
          draft.id,
          active.tiers.map((t, i) => ({
            minVehicles: t.minVehicles,
            maxVehicles: t.maxVehicles,
            unitPriceCents: t.unitPriceCents,
            sortOrder: i,
          })),
        );
      }
      await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (allowUnpriced: boolean) => {
    if (!selectedVersionId) return;
    setSaving(true);
    try {
      await api.billing.publishPriceVersion(selectedVersionId, { allowUnpriced });
      setPublishOpen(false);
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedVersionId) return;
    setSaving(true);
    try {
      await api.billing.archivePriceVersion(selectedVersionId);
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePricebook = async () => {
    if (!newBookName.trim()) return;
    setSaving(true);
    try {
      const book = await api.billing.createPricebook({
        name: newBookName.trim(),
        productKey: newBookProduct,
        currency: 'EUR',
        isDefault: pricebooks.length === 0,
      });
      setCreateOpen(false);
      setNewBookName('');
      await loadBooks();
      setSelectedId(book.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (error && !pricebooks.length) {
    return <ErrorState title="Preisstaffeln nicht verfügbar" description={error} onRetry={() => void loadBooks()} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] gap-4">
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] space-y-2">
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
              onClick={() => setSelectedId(book.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                selectedId === book.id
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                  : 'hover:bg-muted/40 text-foreground'
              }`}
            >
              <div>{book.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {book.productKey} · {book.currency}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
        {detailLoading || !detail ? (
          <SkeletonCard className="h-80" />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold">{detail.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {detail.billingModel} · {detail.interval} · {detail.currency}
                  {detail.isDefault ? ' · Standard' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void createDraft()}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 hover:bg-muted/40"
                >
                  Draft erstellen
                </button>
                <button
                  type="button"
                  onClick={() => void duplicateActive()}
                  disabled={saving || !versions.some((v) => v.status === 'ACTIVE')}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 hover:bg-muted/40"
                >
                  Active duplizieren
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVersion(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                    selectedVersionId === v.id
                      ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {v.versionLabel ?? `v${v.versionNumber}`} · {v.status}
                </button>
              ))}
            </div>

            {selectedVersion && (
              <div className="text-xs text-muted-foreground">
                Status: {selectedVersion.status} · tierMode: {selectedVersion.tierMode} · effectiveFrom:{' '}
                {formatDateDe(selectedVersion.effectiveFrom)}
              </div>
            )}

            {tierIssues.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1">
                {tierIssues.map((issue, i) => (
                  <p key={i} className="text-[11px] sq-tone-warning px-2 py-0.5 rounded">
                    Staffel {issue.tierIndex + 1}: {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-muted/40">
                    {['Min', 'Max', 'Preis (Cent)', 'Sort', ''].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftTiers.map((tier, index) => {
                    const rowIssues = tierIssues.filter((x) => x.tierIndex === index);
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
                            onChange={(e) =>
                              updateTierField(index, 'minVehicles', Number(e.target.value))
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
                            onChange={(e) =>
                              updateTierField(
                                index,
                                'maxVehicles',
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            className="w-16 px-2 py-1 rounded border border-border/70 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            disabled={!isDraft}
                            value={tier.unitPriceCents ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              updateTierField(
                                index,
                                'unitPriceCents',
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            className="w-24 px-2 py-1 rounded border border-border/70 text-xs"
                          />
                          {tier.unitPriceCents != null && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {formatMoneyCents(tier.unitPriceCents, detail.currency)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">{tier.sortOrder}</td>
                        <td className="px-3 py-2">
                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => removeTier(index)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Entfernen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {formatTierRange(1, 8)} · {formatTierRange(9, 19)} · {formatTierRange(20, null)} — Max leer = 20+
            </p>

            <div className="flex flex-wrap gap-2">
              {isDraft && (
                <>
                  <button
                    type="button"
                    onClick={addTier}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
                  >
                    Tier hinzufügen
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTiers()}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-white"
                  >
                    Draft speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishOpen(true)}
                    disabled={saving || draftTiers.length === 0}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[var(--brand)] text-[var(--brand)]"
                  >
                    Version veröffentlichen
                  </button>
                </>
              )}
              {selectedVersion?.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={() => void handleArchive()}
                  disabled={saving}
                  title="Draft verwerfen"
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
                >
                  Draft verwerfen
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <BillingPublishModal
        open={publishOpen}
        onOpenChange={setPublishOpen}
        effectiveFrom={selectedVersion?.effectiveFrom}
        hasMissingPrices={draftTiers.some((t) => t.unitPriceCents == null)}
        onConfirm={handlePublish}
        loading={saving}
      />

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="sq-card rounded-2xl p-5 w-full max-w-md shadow-[var(--shadow-2)] space-y-4">
            <h3 className="text-[15px] font-semibold">Preisstaffel erstellen</h3>
            <input
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
            <select
              value={newBookProduct}
              onChange={(e) => setNewBookProduct(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            >
              <option value="rental">Rental</option>
              <option value="fleet">Fleet</option>
              <option value="taxi">Taxi</option>
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
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--brand)] text-white font-semibold"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
