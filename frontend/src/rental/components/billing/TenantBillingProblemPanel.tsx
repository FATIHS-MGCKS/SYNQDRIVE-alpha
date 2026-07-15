import type { TenantSubscriptionOverviewDto } from '../../types/billing.types';
import { Button } from '../../../components/ui/button';

interface TenantBillingProblemPanelProps {
  overview: TenantSubscriptionOverviewDto | null;
  canWrite: boolean;
  onViewInvoices?: () => void;
  onManagePaymentMethod?: () => void;
  onOpenPortal?: () => void;
  portalLoading?: boolean;
}

export function TenantBillingProblemPanel({
  overview,
  canWrite,
  onViewInvoices,
  onManagePaymentMethod,
  onOpenPortal,
  portalLoading = false,
}: TenantBillingProblemPanelProps) {
  if (!overview) return null;

  const criticalWarnings = overview.warnings.filter((warning) => warning.severity === 'critical');
  const paymentWarnings = overview.warnings.filter(
    (warning) =>
      warning.message.toLowerCase().includes('zahlung') ||
      warning.message.toLowerCase().includes('zahlungsmethode'),
  );
  const warnings = criticalWarnings.length > 0 ? criticalWarnings : paymentWarnings;

  if (warnings.length === 0 && overview.contract?.status !== 'PAST_DUE') {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-border/60 px-4 py-4 sq-tone-critical space-y-3"
      data-testid="tenant-billing-problem-panel"
    >
      <div>
        <h3 className="text-sm font-semibold">Handlungsbedarf bei der Zahlung</h3>
        <p className="text-[12px] mt-1 text-muted-foreground">
          Bitte prüfen Sie offene Rechnungen und aktualisieren Sie Ihre Zahlungsmethode.
        </p>
      </div>

      {warnings.map((warning, index) => (
        <div key={`${warning.message}-${index}`} className="text-xs">
          <p className="font-semibold">{warning.message}</p>
          {warning.actionHint ? (
            <p className="mt-1 text-muted-foreground">{warning.actionHint}</p>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {onViewInvoices ? (
          <Button type="button" size="sm" variant="outline" onClick={onViewInvoices}>
            Offene Rechnungen ansehen
          </Button>
        ) : null}
        {canWrite && onManagePaymentMethod ? (
          <Button type="button" size="sm" variant="outline" onClick={onManagePaymentMethod}>
            Zahlungsmethode aktualisieren
          </Button>
        ) : null}
        {canWrite && onOpenPortal ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={portalLoading}
            onClick={onOpenPortal}
          >
            {portalLoading ? 'Wird geöffnet…' : 'Kundenportal öffnen'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
