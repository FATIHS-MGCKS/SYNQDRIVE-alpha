import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api } from '../../../lib/api';
import { MfaStepUpDialog } from '../../../components/mfa/MfaStepUpDialog';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import { businessLaunchStatusForSlug } from '../../organizations/product-management.policy';
import type { TranslationKey } from '../../../i18n/LanguageContext';
import { applyMasterProductApiResult } from './product-management-mutations';
import {
  isProductMetadataConflict,
  shouldRetainProductMetadataPending,
  type ProductMetadataPatchPending,
} from './master-product-metadata-patch';
import type { MasterBillingSection } from '../billing/master-billing-navigation';

function descriptionForApi(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function descriptionFromApi(value: string | undefined): string {
  return value ?? '';
}

export interface ProductCatalogEditorPanelProps {
  productSlug: string | null;
  stats?: { totalOrgs?: number; active?: number; trial?: number };
  selectedOrgId?: string | null;
  onClose: () => void;
  onSaved: (row: AdminCatalogProductRow) => void;
  onOpenOrgProducts?: (orgId: string) => void;
  onOpenBilling: (input: {
    section: MasterBillingSection;
    subTab?: string | null;
    orgId?: string | null;
    pricingProductKey?: string | null;
  }) => void;
}

export function ProductCatalogEditorPanel({
  productSlug,
  stats,
  selectedOrgId,
  onClose,
  onSaved,
  onOpenOrgProducts,
  onOpenBilling,
}: ProductCatalogEditorPanelProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [row, setRow] = useState<AdminCatalogProductRow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baselineName, setBaselineName] = useState('');
  const [baselineDescription, setBaselineDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const pendingRef = useRef<ProductMetadataPatchPending | null>(null);

  const business = productSlug ? businessLaunchStatusForSlug(productSlug) : null;
  const businessLabel = business
    ? t(`master.productCatalog.business.${business}` as TranslationKey)
    : '';

  const dirty = useMemo(
    () => name.trim() !== baselineName.trim() || description.trim() !== baselineDescription.trim(),
    [name, description, baselineName, baselineDescription],
  );

  const loadProduct = useCallback(
    async (options?: { preserveUserEdits?: boolean }) => {
      if (!productSlug) return;
      if (!options?.preserveUserEdits) {
        setLoading(true);
        setLoadError(null);
        setSaveSuccess(false);
      }
      try {
        const data = await api.products.getCatalogProduct(productSlug);
        setRow(data);
        const desc = descriptionFromApi(data.description);
        if (!options?.preserveUserEdits) {
          setName(data.name);
          setDescription(desc);
        }
        setBaselineName(data.name);
        setBaselineDescription(desc);
      } catch (e) {
        if (!options?.preserveUserEdits) {
          setLoadError(e instanceof Error ? e.message : t('master.productCatalog.editor.loadError'));
          setRow(null);
        }
      } finally {
        if (!options?.preserveUserEdits) {
          setLoading(false);
        }
      }
    },
    [productSlug, t],
  );

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const tryClose = () => {
    if (dirty && !window.confirm(t('master.productCatalog.editor.unsavedWarning'))) {
      return;
    }
    onClose();
  };

  const runPatch = useCallback(
    async (slug: string, body: ProductMetadataPatchPending['body'], isRetry?: boolean) => {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const res = await api.products.patchMetadataResult(slug, body);
        const ok = await applyMasterProductApiResult(
          res.status,
          res.errorMessage,
          async () => {
            if (res.ok && res.data) {
              onSaved(res.data as AdminCatalogProductRow);
              const saved = res.data as AdminCatalogProductRow;
              const desc = descriptionFromApi(saved.description);
              setRow(saved);
              setName(saved.name);
              setDescription(desc);
              setBaselineName(saved.name);
              setBaselineDescription(desc);
              setSaveSuccess(true);
            }
          },
          (msg) => setSaveError(msg),
        );
        if (!ok) {
          if (shouldRetainProductMetadataPending(res.status, res.errorMessage ?? '')) {
            if (!isRetry) {
              pendingRef.current = { productSlug: slug, body };
            }
            setMfaOpen(true);
            return;
          }
          if (isProductMetadataConflict(res.status, res.errorMessage ?? '')) {
            await loadProduct({ preserveUserEdits: true });
            setSaveError(t('master.productCatalog.editor.conflictRetry'));
          }
        } else {
          pendingRef.current = null;
        }
      } finally {
        setSaving(false);
      }
    },
    [loadProduct, onSaved],
  );

  const handleSave = () => {
    if (!productSlug || !row) return;
    const nextName = name.trim();
    if (!nextName) {
      setSaveError(t('master.productCatalog.editor.validationName'));
      return;
    }
    void runPatch(productSlug, {
      name: nextName,
      description: descriptionForApi(description),
      ifCurrentName: baselineName.trim(),
      ifCurrentDescription: descriptionForApi(baselineDescription),
    });
  };

  const handleMfaSuccess = async () => {
    const pending = pendingRef.current;
    if (!pending) {
      setMfaOpen(false);
      return;
    }
    await runPatch(pending.productSlug, pending.body, true);
    setMfaOpen(false);
  };

  if (!productSlug) return null;

  return (
    <main
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-catalog-editor-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto surface-premium rounded-t-xl sm:rounded-xl border border-border shadow-lg p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="product-catalog-editor-title" className="text-lg font-semibold">
              {t('master.productCatalog.editor.title')}
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-1">{productSlug}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={tryClose} aria-label={t('master.productCatalog.editor.cancel')}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {loading && <MasterLoadingState variant="card" count={1} />}
        {loadError && (
          <MasterErrorState title={t('master.productCatalog.editor.title')} error={loadError} onRetry={() => void loadProduct()} />
        )}

        {!loading && !loadError && row && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="neutral" className="!text-xs">
                {t('master.productCatalog.editor.catalogStatus')}: {row.catalogStatus}
              </StatusChip>
              {business && (
                <StatusChip tone="neutral" className="!text-xs">
                  {t('master.productCatalog.editor.businessReadiness')}: {businessLabel}
                </StatusChip>
              )}
            </div>

            {stats && (
              <p className="text-xs text-muted-foreground">
                {t('master.productCatalog.editor.orgStats', {
                  total: String(stats.totalOrgs ?? 0),
                  active: String(stats.active ?? 0),
                })}
              </p>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="product-meta-name">
                {t('master.productCatalog.editor.nameLabel')}
              </label>
              <input
                id="product-meta-name"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="product-meta-description">
                {t('master.productCatalog.editor.descriptionLabel')}
              </label>
              <textarea
                id="product-meta-description"
                className="mt-1 w-full min-h-[96px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="secondary"
                className="justify-between"
                onClick={() =>
                  onOpenBilling({ section: 'pricing', subTab: 'versions', pricingProductKey: productSlug })
                }
              >
                {t('master.productCatalog.editor.openTariffs')}
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-between"
                disabled={!selectedOrgId || !onOpenOrgProducts}
                title={
                  !selectedOrgId ? t('master.productCatalog.editor.orgAssignmentsDisabledHint') : undefined
                }
                onClick={() => {
                  if (selectedOrgId && onOpenOrgProducts) {
                    onOpenOrgProducts(selectedOrgId);
                    onClose();
                  }
                }}
              >
                {t('master.productCatalog.editor.openOrgAssignments')}
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>
            </div>

            {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
            {saveSuccess && (
              <p className="text-sm text-[color:var(--status-ok)]">{t('master.productCatalog.editor.saveSuccess')}</p>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
                {t('master.productCatalog.editor.save')}
              </Button>
              <Button type="button" variant="outline" onClick={tryClose} disabled={saving}>
                {t('master.productCatalog.editor.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <MfaStepUpDialog
        open={mfaOpen}
        action="MASTER_ORGANIZATION"
        onClose={() => setMfaOpen(false)}
        onSuccess={() => void handleMfaSuccess()}
      />
    </main>
  );
}
