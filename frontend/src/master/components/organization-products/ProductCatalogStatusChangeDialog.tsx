import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api } from '../../../lib/api';
import { MfaStepUpDialog } from '../../../components/mfa/MfaStepUpDialog';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import { applyMasterProductApiResult } from './product-management-mutations';
import {
  isProductCatalogStatusConflict,
  oppositeCatalogStatus,
  shouldRetainProductCatalogStatusPending,
  type ProductCatalogStatusPatchPending,
} from './master-product-catalog-status-patch';

type ImpactPreview = {
  currentCatalogStatus: string;
  requestedTargetCatalogStatus: string | null;
  organizationAssignmentsTotal: number;
  organizationProductsByStatus: Record<string, number>;
  activeVehicleGrants: number;
  admissionAfterTarget: Record<string, string>;
  guarantees: Record<string, boolean>;
  previewMayBeStaleBeforeWrite?: boolean;
};

export interface ProductCatalogStatusChangeDialogProps {
  row: AdminCatalogProductRow;
  open: boolean;
  onClose: () => void;
  onApplied: (row: AdminCatalogProductRow) => void;
}

export function ProductCatalogStatusChangeDialog({
  row,
  open,
  onClose,
  onApplied,
}: ProductCatalogStatusChangeDialogProps) {
  const { t } = useLanguage();
  const targetStatus = oppositeCatalogStatus(row.catalogStatus);
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const pendingRef = useRef<ProductCatalogStatusPatchPending | null>(null);

  const loadImpact = useCallback(async () => {
    setImpactError(null);
    try {
      const data = (await api.products.getCatalogStatusImpact(
        row.slug,
        targetStatus,
      )) as ImpactPreview;
      setImpact(data);
    } catch (e) {
      setImpact(null);
      setImpactError(e instanceof Error ? e.message : t('master.productCatalog.status.impactError'));
    }
  }, [row.slug, targetStatus, t]);

  useEffect(() => {
    if (open) {
      setChangeReason('');
      setSaveError(null);
      setSaveSuccess(false);
      void loadImpact();
    }
  }, [open, loadImpact]);

  const runPatch = useCallback(
    async (body: ProductCatalogStatusPatchPending['body'], isRetry?: boolean) => {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const res = await api.products.patchCatalogStatusResult(row.slug, body);
        const ok = await applyMasterProductApiResult(
          res.status,
          res.errorMessage,
          async () => {
            if (res.ok && res.data?.product) {
              onApplied(res.data.product as AdminCatalogProductRow);
              setSaveSuccess(true);
            }
          },
          (msg) => setSaveError(msg),
        );
        if (!ok) {
          if (shouldRetainProductCatalogStatusPending(res.status, res.errorMessage ?? '')) {
            if (!isRetry) {
              pendingRef.current = { productSlug: row.slug, body };
            }
            setMfaOpen(true);
            return;
          }
          if (isProductCatalogStatusConflict(res.status, res.errorMessage ?? '')) {
            await loadImpact();
            setSaveError(t('master.productCatalog.status.conflictRetry'));
          }
        } else {
          pendingRef.current = null;
        }
      } finally {
        setSaving(false);
      }
    },
    [loadImpact, onApplied, row.slug, t],
  );

  const handleConfirm = () => {
    const reason = changeReason.trim();
    if (!reason) {
      setSaveError(t('master.productCatalog.status.reasonRequired'));
      return;
    }
    void runPatch({
      catalogStatus: targetStatus,
      ifCurrentCatalogStatus: row.catalogStatus as 'ACTIVE' | 'DISABLED',
      changeReason: reason,
    });
  };

  const handleMfaSuccess = async () => {
    const pending = pendingRef.current;
    if (!pending) {
      setMfaOpen(false);
      return;
    }
    await runPatch(pending.body, true);
    setMfaOpen(false);
  };

  if (!open) return null;

  return (
  <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-status-change-title"
      >
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto surface-premium rounded-xl border border-border shadow-lg p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[color:var(--status-warning)] shrink-0 mt-0.5" aria-hidden />
            <div>
              <h3 id="catalog-status-change-title" className="font-semibold">
                {t('master.productCatalog.status.dialogTitle', {
                  slug: row.slug,
                  target: targetStatus,
                })}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('master.productCatalog.status.dialogIntro')}
              </p>
            </div>
          </div>

          {impactError && (
            <p className="text-sm text-destructive" role="alert">
              {impactError}
            </p>
          )}

          {impact && (
            <dl className="text-sm space-y-1 border border-border rounded-lg p-3 bg-muted/30">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('master.productCatalog.status.current')}</dt>
                <dd className="font-medium">{impact.currentCatalogStatus}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('master.productCatalog.status.assignments')}</dt>
                <dd>{impact.organizationAssignmentsTotal}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('master.productCatalog.status.activeGrants')}</dt>
                <dd>{impact.activeVehicleGrants}</dd>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">
                {t('master.productCatalog.status.entitlementsPreserved')}
              </p>
              {impact.previewMayBeStaleBeforeWrite && (
                <p className="text-xs text-muted-foreground">
                  {t('master.productCatalog.status.previewStaleHint')}
                </p>
              )}
            </dl>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="catalog-status-reason">
              {t('master.productCatalog.status.reasonLabel')}
            </label>
            <textarea
              id="catalog-status-reason"
              className="mt-1 w-full min-h-[72px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              disabled={saving}
            />
          </div>

          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-sm text-[color:var(--status-ok)]">{t('master.productCatalog.status.success')}</p>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('master.productCatalog.editor.cancel')}
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={saving || !impact}>
              {t('master.productCatalog.status.confirm')}
            </Button>
          </div>
        </div>
      </div>
      <MfaStepUpDialog
        open={mfaOpen}
        action="MASTER_ORGANIZATION"
        onClose={() => setMfaOpen(false)}
        onSuccess={() => void handleMfaSuccess()}
      />
    </>
  );
}