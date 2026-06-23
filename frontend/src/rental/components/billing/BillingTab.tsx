import { useState } from 'react';
import { useRentalOrg } from '../../RentalContext';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useBillingData } from './useBillingData';
import { BillingStatusHero } from './BillingStatusHero';
import { BillingSubscriptionCard } from './BillingSubscriptionCard';
import { BillingPriceTierLadder } from './BillingPriceTierLadder';
import { BillingPaymentMethodCard } from './BillingPaymentMethodCard';
import { BillingInvoiceSection } from './BillingInvoiceSection';
import { BillableVehiclesDrawer } from './BillableVehiclesDrawer';
import {
  headerBadgeFromSummary,
} from './billing.utils';
import { Icon } from '../ui/Icon';

export function BillingTab() {
  const { orgId, hasPermission, loading: orgLoading } = useRentalOrg();
  const canRead = hasPermission('billing', 'read');
  const { summary, invoices, billableVehicles, loading, error, reload } = useBillingData(orgId);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);

  if (orgLoading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4 p-1">
        <SkeletonCard className="h-8 w-64" />
        <SkeletonCard className="h-32 w-full" />
        <SkeletonCard className="h-48 w-full" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <EmptyState
          icon={<Icon name="lock" className="w-5 h-5" />}
          title="Kein Zugriff auf Abrechnung"
          description="Du benötigst Leseberechtigung für das Modul Abrechnung."
        />
      </div>
    );
  }

  const headerBadge = summary
    ? headerBadgeFromSummary(summary.subscriptionStatus, summary.calculationStatus)
    : { label: 'Laden…', tone: 'sq-tone-neutral' };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
            Abrechnung & Abo
          </h2>
          <p className="text-[13px] mt-1 text-muted-foreground max-w-[65ch]">
            Verwalte deine Subscription, Zahlungsmethode und Rechnungen für diese Organisation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${headerBadge.tone}`}>
            {headerBadge.label}
          </span>
          {summary?.stripePortalPrepared && !summary.stripeConfigured && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold sq-tone-neutral border border-border/60">
              Stripe wird vorbereitet
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard className="h-36 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SkeletonCard className="h-80 rounded-2xl" />
            <SkeletonCard className="h-80 rounded-2xl" />
          </div>
          <SkeletonCard className="h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState
          title="Abrechnungsdaten nicht verfügbar"
          description={error}
          onRetry={() => void reload()}
          retryLabel="Erneut versuchen"
        />
      ) : summary ? (
        <>
          <BillingStatusHero
            summary={summary}
            stripePortalPrepared={Boolean(summary.stripePortalPrepared && !summary.stripeConfigured)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] gap-4">
            <div className="space-y-4">
              <BillingSubscriptionCard
                summary={summary}
                onShowVehicles={() => setVehiclesOpen(true)}
              />
              <BillingPriceTierLadder
                tiers={summary.priceTiers ?? []}
                currency={summary.priceBook?.currency ?? 'EUR'}
                currentTierId={summary.currentTier?.id ?? null}
              />
            </div>
            <BillingPaymentMethodCard
              paymentMethod={summary.paymentMethod}
              stripePortalPrepared={Boolean(summary.stripePortalPrepared && !summary.stripeConfigured)}
            />
          </div>

          <BillingInvoiceSection invoices={invoices} />

          <BillableVehiclesDrawer
            open={vehiclesOpen}
            onOpenChange={setVehiclesOpen}
            data={billableVehicles}
          />
        </>
      ) : (
        <EmptyState
          icon={<Icon name="credit-card" className="w-5 h-5" />}
          title="Keine Abrechnungsdaten"
          description="Für diese Organisation sind noch keine Billing-Daten verfügbar."
        />
      )}
    </div>
  );
}
