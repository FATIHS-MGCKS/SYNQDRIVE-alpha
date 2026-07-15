import { useMemo, useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { Button } from '../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  paymentMethodStatusLabel,
  warningLabel,
} from './admin-billing.utils';
import {
  domainStatusLabel,
  domainStatusTone,
  syncStatusLabel,
  syncStatusTone,
  tariffLabelFromRow,
} from './master-contract.utils';
import { MasterContractPreviewPanel } from './MasterContractPreviewPanel';
import { useMasterOrgContract } from './useMasterOrgContract';

interface BillingOrgDetailDrawerProps {
  row: AdminOrgBillingRowDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContractUpdated?: () => void;
}

type DrawerTab = 'details' | 'actions' | 'history';
type PendingCriticalAction =
  | { kind: 'pause' }
  | { kind: 'schedule-cancel' }
  | { kind: 'activate'; priceVersionId: string }
  | null;

export function BillingOrgDetailDrawer({
  row,
  open,
  onOpenChange,
  onContractUpdated,
}: BillingOrgDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [priceVersionId, setPriceVersionId] = useState('');
  const [trialEndAt, setTrialEndAt] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [discountReason, setDiscountReason] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingCriticalAction>(null);

  const contract = useMasterOrgContract(row, open, onContractUpdated);

  const domainStatus =
    contract.contractState?.contract?.domainStatus ??
    row?.subscription?.status ??
    'NONE';

  const detailRows = useMemo(() => {
    if (!row) return [];
    const overview = contract.overview;
    return [
      ['Tarif', tariffLabelFromRow(row.tariffLabel, row.contract?.productKey)],
      ['Price Version', row.contract?.priceVersionLabel ?? '—'],
      ['Status', domainStatusLabel(domainStatus)],
      ['Trial bis', formatDateDe(row.subscription?.trialEndAt ?? overview?.contract?.trialEndsAt)],
      ['Beginn', formatDateDe(row.subscription?.startedAt ?? overview?.contract?.startedAt)],
      [
        'Billing Anchor',
        row.subscription?.billingAnchorDay != null ? `Tag ${row.subscription.billingAnchorDay}` : '—',
      ],
      [
        'Kündigung',
        row.subscription?.cancelAtPeriodEnd
          ? `Geplant (${formatDateDe(row.subscription.cancelAt)})`
          : formatDateDe(row.subscription?.cancelAt),
      ],
      ['Fahrzeugmenge', `${row.billableVehicleCount} abrechenbar / ${row.connectedVehicleCount} verbunden`],
      [
        'Rabatte',
        overview?.pricing?.discounts?.length
          ? overview.pricing.discounts.map((discount) => discount.label).join(', ')
          : row.discountSummary ?? 'Keine',
      ],
      [
        'Zahlungsmethode',
        overview?.paymentMethod?.statusLabel ??
          paymentMethodStatusLabel(row.paymentMethodStatus),
      ],
      [
        'Nächste Rechnung',
        overview?.billing?.nextExpectedInvoice?.grossAmount?.formatted ??
          (row.nextInvoicePreview.totalCents != null
            ? formatMoneyCents(row.nextInvoicePreview.totalCents)
            : '—'),
      ],
      [
        'Stripe Mapping',
        row.subscription?.stripeCustomerId && row.subscription?.stripeSubscriptionId
          ? 'Kunde + Abo'
          : row.subscription?.stripeCustomerId || row.subscription?.stripeSubscriptionId
            ? 'Teilweise'
            : 'Fehlt',
      ],
    ] as const;
  }, [contract.overview, domainStatus, row]);

  if (!row) return null;

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-xs outline-none focus:border-[var(--brand)]';

  const handlePreviewPriceVersion = async () => {
    if (!priceVersionId.trim()) return;
    await contract.runPreview({ priceVersionId: priceVersionId.trim() });
  };

  const handleApplyPriceVersion = async () => {
    if (!priceVersionId.trim()) return;
    await contract.runMutation('select-price-version', { priceVersionId: priceVersionId.trim() });
  };

  const handleCreateDraft = async () => {
    await contract.runMutation('draft', { currency: 'EUR' });
  };

  const handleAssignRental = async () => {
    await contract.runMutation('assign-rental', {});
  };

  const handleAssignFleet = async () => {
    await contract.runMutation('assign-fleet', {});
  };

  const handleConfigureTrial = async () => {
    if (!priceVersionId.trim() || !trialEndAt) return;
    await contract.runMutation('trial', {
      priceVersionId: priceVersionId.trim(),
      trialEndAt: new Date(trialEndAt).toISOString(),
    });
  };

  const handleScheduleTariffChange = async () => {
    if (!effectiveAt) return;
    await contract.runPreview({
      productKey: row.contract?.productKey === 'RENTAL' ? 'FLEET' : 'RENTAL',
      effectiveAt: new Date(effectiveAt).toISOString(),
    });
  };

  const handleConfirmTariffChange = async () => {
    if (!effectiveAt) return;
    const nextProduct = row.contract?.productKey === 'RENTAL' ? 'FLEET' : 'RENTAL';
    await contract.runMutation('schedule-tariff-change', {
      productKey: nextProduct,
      effectiveAt: new Date(effectiveAt).toISOString(),
    });
  };

  const handleAddDiscount = async () => {
    const percentBps = Math.round(Number(discountPercent) * 100);
    if (!Number.isFinite(percentBps) || percentBps <= 0) return;
    await contract.runMutation('add-discount', {
      discountType: 'PERCENT',
      percentBps,
      validFrom: new Date().toISOString(),
      reason: discountReason || 'Master-Rabatt',
      currency: 'EUR',
    });
  };

  const confirmCriticalAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'pause') {
      await contract.runMutation('pause');
    } else if (pendingAction.kind === 'schedule-cancel') {
      await contract.runMutation('schedule-cancel', {});
    } else if (pendingAction.kind === 'activate') {
      await contract.runMutation('activate', { priceVersionId: pendingAction.priceVersionId });
    }
    setPendingAction(null);
  };

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={row.organization.companyName}
        description="Vertragsdetails und Master-Aktionen"
        widthClassName="sm:max-w-3xl"
        status={
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${domainStatusTone(domainStatus)}`}>
              {domainStatusLabel(domainStatus)}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${syncStatusTone(row.syncStatus)}`}>
              Sync: {syncStatusLabel(row.syncStatus)}
            </span>
          </div>
        }
      >
        <div className="space-y-5">
          {row.warnings.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {row.warnings.map((warning) => (
                <span key={warning} className="px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-warning">
                  {warningLabel(warning)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['details', 'Details'],
                ['actions', 'Aktionen'],
                ['history', 'Historie'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={tab === key ? 'secondary' : 'ghost'}
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={contract.loading}
              onClick={() => void contract.reload()}
            >
              Aktualisieren
            </Button>
          </div>

          {contract.error ? (
            <ErrorState
              compact
              title="Vertrag konnte nicht geladen werden"
              description={contract.error}
              onRetry={() => void contract.reload()}
            />
          ) : null}

          {contract.actionMessage ? (
            <p className="text-[11px] rounded-lg bg-muted/30 px-3 py-2 text-muted-foreground">
              {contract.actionMessage}
            </p>
          ) : null}

          {contract.loading ? <SkeletonCard className="h-40" /> : null}

          {!contract.loading && tab === 'details' ? (
            <section className="space-y-2" data-testid="master-contract-details">
              {detailRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 text-xs py-1 border-b border-border/40"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold text-right">{value}</span>
                </div>
              ))}
              {row.lastInvoice ? (
                <p className="text-[11px] text-muted-foreground pt-2">
                  Letzte Rechnung: {formatMoneyCents(row.lastInvoice.amountCents)} ·{' '}
                  {formatDateDe(row.lastInvoice.invoiceDate)}
                </p>
              ) : null}
            </section>
          ) : null}

          {!contract.loading && tab === 'actions' ? (
            <div className="space-y-4" data-testid="master-contract-actions">
              <MasterContractPreviewPanel preview={contract.preview} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button type="button" variant="outline" disabled={contract.actionLoading} onClick={() => void handleCreateDraft()}>
                  Draft erstellen
                </Button>
                <Button type="button" variant="outline" disabled={contract.actionLoading} onClick={() => void handleAssignRental()}>
                  Rental zuweisen
                </Button>
                <Button type="button" variant="outline" disabled={contract.actionLoading} onClick={() => void handleAssignFleet()}>
                  Fleet zuweisen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contract.actionLoading}
                  onClick={() => void contract.runMutation('reactivate')}
                >
                  Reaktivieren
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contract.actionLoading}
                  onClick={() => setPendingAction({ kind: 'pause' })}
                >
                  Pausieren
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contract.actionLoading}
                  onClick={() => setPendingAction({ kind: 'schedule-cancel' })}
                >
                  Kündigung planen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contract.actionLoading}
                  onClick={() => void contract.runMutation('revoke-cancel')}
                >
                  Kündigung widerrufen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contract.actionLoading}
                  onClick={() => void contract.runMutation('sync-stripe')}
                >
                  Stripe Sync starten
                </Button>
              </div>

              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <h4 className="text-[12px] font-semibold">Price Version & Trial</h4>
                <input
                  className={inputClass}
                  placeholder="Price Version ID"
                  value={priceVersionId}
                  onChange={(e) => setPriceVersionId(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void handlePreviewPriceVersion()}>
                    Preview
                  </Button>
                  <Button type="button" size="sm" onClick={() => void handleApplyPriceVersion()}>
                    Price Version übernehmen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPendingAction({
                        kind: 'activate',
                        priceVersionId: priceVersionId.trim() || row.contract?.priceVersionId || '',
                      })
                    }
                  >
                    Aktivieren
                  </Button>
                </div>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={trialEndAt}
                  onChange={(e) => setTrialEndAt(e.target.value)}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => void handleConfigureTrial()}>
                  Trial konfigurieren
                </Button>
              </div>

              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <h4 className="text-[12px] font-semibold">Tarifwechsel planen</h4>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={effectiveAt}
                  onChange={(e) => setEffectiveAt(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleScheduleTariffChange()}>
                    Preview
                  </Button>
                  <Button type="button" size="sm" onClick={() => void handleConfirmTariffChange()}>
                    Tarifwechsel planen
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <h4 className="text-[12px] font-semibold">Rabatt</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    className={inputClass}
                    placeholder="Prozent"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    placeholder="Grund"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                </div>
                <Button type="button" size="sm" onClick={() => void handleAddDiscount()}>
                  Rabatt hinzufügen
                </Button>
              </div>
            </div>
          ) : null}

          {!contract.loading && tab === 'history' ? (
            <section data-testid="master-contract-history">
              {!contract.history?.auditEntries?.length ? (
                <EmptyState compact title="Noch keine Vertragsänderungen" />
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto">
                  {contract.history.auditEntries.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{entry.action}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateDe(entry.createdAt)}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{entry.entityType}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </DetailDrawer>

      <AlertDialog open={pendingAction != null} onOpenChange={(next) => !next && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kritische Vertragsaktion bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'pause'
                ? 'Der Vertrag wird pausiert. Abrechnung und Zugriff können eingeschränkt werden.'
                : pendingAction?.kind === 'schedule-cancel'
                  ? 'Die Kündigung wird für den Vertrag vorgemerkt.'
                  : 'Der Vertrag wird mit der gewählten Price Version aktiviert.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCriticalAction()}>
              Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
