import { useBillingSubscriptionOverview } from './useBillingSubscriptionOverview';
import { useBillingVehicleBilling } from './useBillingVehicleBilling';
import { useBillingInvoices } from './useBillingInvoices';
import { useBillingPaymentMethods } from './useBillingPaymentMethods';
import { useBillingPaymentHistory } from './useBillingPaymentHistory';

export { useBillingSubscriptionOverview };
export { useBillingVehicleBilling };
export { useBillingInvoices };
export { useBillingPaymentMethods };
export { useBillingPaymentHistory };

export function useBillingData(orgId: string | undefined) {
  const overview = useBillingSubscriptionOverview(orgId);
  const vehicles = useBillingVehicleBilling(orgId);
  const invoices = useBillingInvoices(orgId);
  const paymentMethods = useBillingPaymentMethods(orgId);
  const paymentHistory = useBillingPaymentHistory(orgId);

  return {
    summary: overview.summary,
    overview: overview.overview,
    invoices: invoices.invoices,
    billableVehicles: vehicles.billableVehicles,
    vehicleLicenses: vehicles.vehicleLicenses,
    paymentMethods: paymentMethods.data,
    paymentHistory: paymentHistory.payments,
    loading:
      overview.loading ||
      vehicles.loadingVehicles ||
      invoices.loading ||
      paymentMethods.loading,
    error: overview.error ?? vehicles.vehiclesError ?? invoices.error ?? paymentMethods.error,
    reload: async () => {
      await Promise.allSettled([
        overview.reload(),
        vehicles.reloadAll(),
        invoices.reload(),
        paymentMethods.reload(),
        paymentHistory.reload(),
      ]);
    },
    sections: {
      overview,
      vehicles,
      invoices,
      paymentMethods,
      paymentHistory,
    },
  };
}
