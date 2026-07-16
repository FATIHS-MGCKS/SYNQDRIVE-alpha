import { EmptyState } from '../../../components/patterns/states';
import type { TenantSubscriptionOverviewDto } from '../../types/billing.types';
import { ErrorState, SkeletonCard } from '../../../components/patterns/states';

interface TenantBillingAddOnsTabProps {
  overview: TenantSubscriptionOverviewDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function TenantBillingAddOnsTab({
  overview,
  loading,
  error,
  onRetry,
}: TenantBillingAddOnsTabProps) {
  if (loading && !overview) return <SkeletonCard className="h-48 rounded-2xl" />;
  if (error) {
    return (
      <ErrorState
        title="Zusatzmodule konnten nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  const addOns = overview?.addOns ?? [];
  const activeAddOns = addOns.filter((addon) => addon.active);

  if (activeAddOns.length === 0) {
    return (
      <EmptyState
        data-testid="tenant-addons-empty"
        title="Noch keine Zusatzmodule aktiv"
        description="Optionale Erweiterungen wie Sprachassistent oder KI-Pakete können später hier verwaltet werden. Aktuell ist kein Zusatzmodul für Ihr Abo hinterlegt."
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="tenant-addons-tab">
      {activeAddOns.map((addon) => (
        <div
          key={addon.key}
          className="surface-premium rounded-xl border border-border/60 px-4 py-3 flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-sm font-semibold">{addon.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{addon.statusLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
