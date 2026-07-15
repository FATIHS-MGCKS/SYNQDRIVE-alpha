import type { BillingSummaryDto } from '../../types/billing.types';
import { BillingSubscriptionCard } from './BillingSubscriptionCard';
import { BillingPriceTierLadder } from './BillingPriceTierLadder';
import { Button } from '../../../components/ui/button';
import { ErrorState, SkeletonCard } from '../../../components/patterns/states';

interface TenantBillingTariffVehiclesTabProps {
  summary: BillingSummaryDto | null;
  pricingModel?: 'VOLUME' | 'GRADUATED' | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onShowVehicles: () => void;
}

export function TenantBillingTariffVehiclesTab({
  summary,
  pricingModel,
  loading,
  error,
  onRetry,
  onShowVehicles,
}: TenantBillingTariffVehiclesTabProps) {
  if (loading) return <SkeletonCard className="h-72 rounded-2xl" />;
  if (error) {
    return (
      <ErrorState
        title="Tarif konnte nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }
  if (!summary) {
    return (
      <ErrorState
        title="Kein Tarif verfügbar"
        description="Für diese Organisation liegt noch kein aktiver Vertrag vor."
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="tenant-tariff-vehicles-tab">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={onShowVehicles}>
          Fahrzeuge anzeigen
        </Button>
      </div>
      <BillingSubscriptionCard summary={summary} onShowVehicles={onShowVehicles} />
      <BillingPriceTierLadder
        tiers={summary.priceTiers ?? []}
        currency={summary.priceBook?.currency ?? 'EUR'}
        currentTierId={summary.currentTier?.id ?? null}
        pricingModel={pricingModel}
      />
    </div>
  );
}
