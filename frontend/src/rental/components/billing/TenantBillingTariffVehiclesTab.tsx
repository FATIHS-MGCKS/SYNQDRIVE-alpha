import { ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { BillingPriceTierLadder } from './BillingPriceTierLadder';
import { TenantBillableVehiclesTable } from './TenantBillableVehiclesTable';
import { TenantPricingBreakdownSection } from './TenantPricingBreakdownSection';
import { TenantTariffSummarySection } from './TenantTariffSummarySection';
import { TenantVehicleChangesSection } from './TenantVehicleChangesSection';
import type { useBillingTariffVehicles } from './useBillingTariffVehicles';

type TariffVehiclesState = ReturnType<typeof useBillingTariffVehicles>;

interface TenantBillingTariffVehiclesTabProps {
  data: TariffVehiclesState;
}

export function TenantBillingTariffVehiclesTab({ data }: TenantBillingTariffVehiclesTabProps) {
  const {
    tariff,
    tariffLoading,
    tariffError,
    reloadTariff,
    vehicles,
    vehiclesMeta,
    vehiclesLoading,
    vehiclesError,
    vehicleQuery,
    setVehicleQuery,
    reloadVehicles,
    changes,
    changesMeta,
    changesLoading,
    changesError,
    changesQuery,
    setChangesQuery,
    reloadChanges,
  } = data;

  if (tariffLoading && !tariff) {
    return (
      <div className="space-y-4" data-testid="tenant-tariff-vehicles-tab">
        <SkeletonCard className="h-56 rounded-2xl" />
        <SkeletonCard className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (tariffError && !tariff) {
    return (
      <ErrorState
        title="Tarif & Fahrzeuge konnten nicht geladen werden"
        description={tariffError}
        onRetry={() => void reloadTariff()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  const pricing = tariff?.pricing ?? null;
  const priceTiers =
    pricing?.priceTiers.map((tier, index) => ({
      id: `tier-${index}`,
      minVehicles: tier.minVehicles,
      maxVehicles: tier.maxVehicles,
      unitPriceCents: tier.unitPrice?.cents ?? null,
      sortOrder: index,
    })) ?? [];
  const currentTierIndex = pricing?.priceTiers.findIndex((tier) => tier.isCurrent) ?? -1;

  return (
    <div className="space-y-4" data-testid="tenant-tariff-vehicles-tab">
      <p className="text-[12px] leading-relaxed text-muted-foreground max-w-[70ch]">
        Tarif, Preisbildung und abrechenbare Fahrzeuge — nachvollziehbar und ohne technische Details.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TenantTariffSummarySection tariff={tariff?.tariff ?? null} />
        <TenantPricingBreakdownSection
          pricing={pricing}
          loading={tariffLoading}
          error={tariffError}
        />
      </div>

      {priceTiers.length > 0 ? (
        <BillingPriceTierLadder
          tiers={priceTiers}
          currency={pricing?.currency ?? 'EUR'}
          currentTierId={currentTierIndex >= 0 ? `tier-${currentTierIndex}` : null}
          pricingModel={pricing?.pricingModel ?? null}
        />
      ) : null}

      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <TenantBillableVehiclesTable
          vehicles={vehicles}
          meta={vehiclesMeta}
          query={vehicleQuery}
          loading={vehiclesLoading}
          error={vehiclesError}
          onQueryChange={setVehicleQuery}
          onRetry={reloadVehicles}
        />
      </div>

      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <TenantVehicleChangesSection
          changes={changes}
          meta={changesMeta}
          query={changesQuery}
          loading={changesLoading}
          error={changesError}
          onQueryChange={setChangesQuery}
          onRetry={reloadChanges}
        />
      </div>

      {tariff?.sectionErrors?.length ? (
        <div className="space-y-2">
          {tariff.sectionErrors.map((sectionError) => (
            <p
              key={`${sectionError.section}-${sectionError.message}`}
              className="text-xs sq-tone-warning px-2 py-1 rounded"
            >
              {sectionError.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
