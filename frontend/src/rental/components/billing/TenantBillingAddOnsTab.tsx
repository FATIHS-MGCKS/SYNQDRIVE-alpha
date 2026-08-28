import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  resolveTenantBillingAddonName,
  resolveTenantBillingAddonStatusLabel,
} from '../../lib/rental-tenant-billing-i18n';
import type { TenantSubscriptionOverviewDto } from '../../types/billing.types';

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
  const { t } = useLanguage();

  if (loading && !overview) return <SkeletonCard className="h-48 rounded-2xl" />;
  if (error) {
    return (
      <ErrorState
        title={t('tenantBilling.addons.loadErrorTitle')}
        description={error}
        onRetry={() => void onRetry()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const addOns = overview?.addOns ?? [];
  const activeAddOns = addOns.filter((addon) => addon.active);

  if (activeAddOns.length === 0) {
    return (
      <EmptyState
        data-testid="tenant-addons-empty"
        title={t('tenantBilling.addons.empty.title')}
        description={t('tenantBilling.addons.empty.body')}
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
            <p className="text-sm font-semibold">{resolveTenantBillingAddonName(addon, t)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {resolveTenantBillingAddonStatusLabel(addon, t)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
