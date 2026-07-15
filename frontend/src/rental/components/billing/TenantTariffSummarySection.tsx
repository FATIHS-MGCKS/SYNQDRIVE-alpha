import type { TenantSubscriptionTariffDetailsDto } from '../../types/billing.types';
import { formatDateDe } from './billing.utils';
import { formatPeriodRange, planKindLabel } from './tenant-tariff-vehicles.utils';

interface TenantTariffSummarySectionProps {
  tariff: TenantSubscriptionTariffDetailsDto | null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
      <span className="text-[12px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

export function TenantTariffSummarySection({ tariff }: TenantTariffSummarySectionProps) {
  if (!tariff) {
    return (
      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Kein aktiver Tarif hinterlegt.</p>
      </div>
    );
  }

  return (
    <div
      className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5"
      data-testid="tenant-tariff-summary"
    >
      <h3 className="text-sm font-semibold mb-3">Tarif</h3>
      <div className="space-y-0">
        <DetailRow label="Produkt" value={planKindLabel(tariff.planKind)} />
        <DetailRow label="Tarifbezeichnung" value={tariff.planName ?? '—'} />
        <DetailRow label="Abrechnungsintervall" value={tariff.billingIntervalLabel} />
        <DetailRow label="Preisversion" value={tariff.priceVersionLabel ?? '—'} />
        <DetailRow label="Vertragsbeginn" value={formatDateDe(tariff.contractStartedAt)} />
        <DetailRow
          label="Nächster Zeitraum"
          value={formatPeriodRange(tariff.nextPeriodStart, tariff.nextPeriodEnd)}
        />
        <DetailRow label="Kündigungsstatus" value={tariff.cancellationStatusLabel ?? '—'} />
        <DetailRow label="Aktuelle Staffel" value={tariff.appliedTierLabel ?? '—'} />
      </div>
    </div>
  );
}
