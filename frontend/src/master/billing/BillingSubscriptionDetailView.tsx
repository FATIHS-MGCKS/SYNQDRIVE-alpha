import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { SectionHeader, StatusChip } from '../../components/patterns';
import { ErrorState, SkeletonCard } from '../../components/patterns/states';
import type { AdminOrgBillingRowDto } from '../types/admin-billing.types';
import type { BillingSubscriptionOperationalDetailDto } from './types';
import {
  attentionReasonLabel,
  formatDateDe,
  formatMoneyCents,
  formatRelativeDe,
} from './billing.utils';
import {
  BillingAttentionChip,
  BillingDomainStatusChip,
  BillingHealthChip,
  BillingReconciliationChip,
} from './BillingStatusChips';
import { useBillingSubscriptionDetail } from './useBillingOperational';
import { paymentMethodStatusLabel } from '../components/billing/admin-billing.utils';

export function operationalDetailToBillingRow(
  detail: BillingSubscriptionOperationalDetailDto,
): AdminOrgBillingRowDto {
  return {
    organization: {
      id: detail.organizationId,
      companyName: detail.companyName,
      status: detail.organizationStatus,
    },
    subscription: detail.subscriptionId
      ? {
          id: detail.subscriptionId,
          status: detail.domainStatus,
          lockVersion: detail.lockVersion ?? undefined,
          currentPeriodStart: null,
          currentPeriodEnd: detail.currentPeriodEnd,
          trialEndAt: detail.trial.endsAt,
          startedAt: detail.startedAt,
          cancelAt: detail.cancelAt,
          cancelAtPeriodEnd: detail.cancelAtPeriodEnd,
          billingAnchorDay: detail.billingAnchorDay,
          stripeCustomerId: detail.stripeCustomerId,
          stripeSubscriptionId: detail.stripeSubscriptionId,
        }
      : null,
    contract: {
      productKey: detail.productKey,
      productName: detail.tariffLabel,
      priceBookId: null,
      priceBookName: detail.priceBookName,
      priceVersionId: detail.priceVersionId,
      priceVersionLabel: detail.priceVersionLabel,
      priceVersionStatus: null,
    },
    tariffLabel: detail.tariffLabel,
    products: [],
    connectedVehicleCount: detail.connectedVehicleCount,
    billableVehicleCount: detail.billableVehicleCount,
    currentTier: null,
    priceStatus: 'OK',
    projectedMonthlyAmountCents: detail.projectedMonthlyAmountCents,
    paymentMethodStatus: detail.paymentMethodStatus,
    lastInvoice: detail.lastInvoice,
    openAmountCents: detail.openAmountCents,
    nextChargeAt: detail.nextChargeAt,
    syncStatus: detail.syncStatus,
      nextInvoicePreview: {
        subtotalCents: null,
        totalCents: null,
        calculationStatus: 'OK',
        billableVehicleCount: detail.billableVehicleCount,
      },
    warnings: detail.warnings,
  };
}

interface BillingSubscriptionDetailViewProps {
  organizationId: string;
  onBack: () => void;
  onOpenOrganization?: (organizationId: string) => void;
  onManageContract?: (row: AdminOrgBillingRowDto) => void;
}

export function BillingSubscriptionDetailView({
  organizationId,
  onBack,
  onOpenOrganization,
  onManageContract,
}: BillingSubscriptionDetailViewProps) {
  const { detail, loading, error, refresh } = useBillingSubscriptionDetail(organizationId);

  const billingRow = useMemo(
    () => (detail ? operationalDetailToBillingRow(detail) : null),
    [detail],
  );

  if (loading && !detail) {
    return (
      <div className="space-y-4" data-testid="master-billing-subscription-detail">
        <SkeletonCard className="h-10 w-40" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <ErrorState
        title="Vertrag nicht verfügbar"
        description={error ?? 'Vertragsdetail konnte nicht geladen werden'}
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="master-billing-subscription-detail">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zurück zur Liste
        </Button>
        {onOpenOrganization ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenOrganization(organizationId)}>
            Organisation anzeigen
          </Button>
        ) : null}
        {billingRow && onManageContract ? (
          <Button type="button" size="sm" onClick={() => onManageContract(billingRow)}>
            Vertragsaktionen
          </Button>
        ) : null}
      </div>

      <div className="surface-premium p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{detail.companyName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {detail.tariffLabel ?? 'Kein Plan'} · Verlängerung {formatRelativeDe(detail.nextChargeAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BillingAttentionChip attention={detail.attention} />
            <BillingDomainStatusChip status={detail.domainStatus} />
            <BillingHealthChip health={detail.billingHealth} />
            <BillingReconciliationChip health={detail.reconciliationHealth} />
          </div>
        </div>

        {detail.warnings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detail.warnings.map((code: string) => (
              <StatusChip key={code} tone="warning" className="!text-xs">
                {attentionReasonLabel(code)}
              </StatusChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="surface-premium p-5 space-y-3">
          <SectionHeader title="Lifecycle" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{detail.domainStatusLabel}</dd>
            <dt className="text-muted-foreground">Beginn</dt>
            <dd>{formatDateDe(detail.startedAt)}</dd>
            <dt className="text-muted-foreground">Testphase</dt>
            <dd>
              {detail.trial.active
                ? `${detail.trial.source} · bis ${formatDateDe(detail.trial.endsAt)}`
                : '—'}
            </dd>
            <dt className="text-muted-foreground">Kündigung</dt>
            <dd>{detail.cancelAtPeriodEnd ? formatDateDe(detail.cancelAt) : '—'}</dd>
          </dl>
        </section>

        <section className="surface-premium p-5 space-y-3">
          <SectionHeader title="Abrechnungsgesundheit" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Zahlungsmethode</dt>
            <dd>{paymentMethodStatusLabel(detail.paymentMethodStatus)}</dd>
            <dt className="text-muted-foreground">Offener Betrag</dt>
            <dd>{formatMoneyCents(detail.openAmountCents)}</dd>
            <dt className="text-muted-foreground">Letzte Fehlzahlung</dt>
            <dd>{formatDateDe(detail.lastFailedPaymentAt)}</dd>
            <dt className="text-muted-foreground">Offene Abweichungen</dt>
            <dd>{detail.openDriftCount}</dd>
          </dl>
        </section>

        <section className="surface-premium p-5 space-y-3">
          <SectionHeader title="Kommerziell" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Plan</dt>
            <dd>{detail.tariffLabel ?? '—'}</dd>
            <dt className="text-muted-foreground">Preisversion</dt>
            <dd>{detail.priceVersionLabel ?? '—'}</dd>
            <dt className="text-muted-foreground">Preisbuch</dt>
            <dd>{detail.priceBookName ?? '—'}</dd>
            <dt className="text-muted-foreground">Prognose / Monat</dt>
            <dd>{formatMoneyCents(detail.projectedMonthlyAmountCents)}</dd>
            <dt className="text-muted-foreground">Fahrzeuge</dt>
            <dd>
              {detail.connectedVehicleCount} verbunden · {detail.billableVehicleCount} abrechenbar
            </dd>
          </dl>
        </section>

        <section className="surface-premium p-5 space-y-3">
          <SectionHeader title="Technische Details" description="Nur für Ops — keine Source of Truth" />
          <dl className="grid grid-cols-1 gap-y-2 text-xs font-mono text-muted-foreground break-all">
            <div>Stripe Customer: {detail.stripeCustomerId ?? '—'}</div>
            <div>Stripe Subscription: {detail.stripeSubscriptionId ?? '—'}</div>
            <div>Sync: {detail.syncStatus}</div>
            <div>Aktualisiert: {formatDateDe(detail.updatedAt)}</div>
          </dl>
        </section>
      </div>
    </div>
  );
}
