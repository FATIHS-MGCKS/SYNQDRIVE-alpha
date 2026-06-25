import { StatusChip } from '../../../components/patterns';
import type { BookingDetailDto } from '../../../lib/api';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import { EM_DASH } from './bookingDetailUtils';

const card = 'rounded-lg border border-border bg-card p-4';

interface BookingCustomerRiskTabProps {
  detail: BookingDetailDto;
  orgId?: string;
  onOpenCustomer?: (customerId: string) => void;
}

export function BookingCustomerRiskTab({ detail, orgId, onOpenCustomer }: BookingCustomerRiskTabProps) {
  const c = detail.customer;
  const idUi = customerVerificationApiToUi(c.identityStatus ?? undefined);
  const licenseUi = customerVerificationApiToUi(c.licenseStatus ?? undefined);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold">Kundendaten</h3>
          {onOpenCustomer && (
            <button
              type="button"
              onClick={() => onOpenCustomer(c.customerId)}
              className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
            >
              Kundenakte öffnen
            </button>
          )}
        </div>
        <dl className="space-y-2 text-xs">
          <Row label="Name" value={c.fullName} />
          <Row label="Telefon" value={c.phone ?? EM_DASH} />
          <Row label="E-Mail" value={c.email ?? EM_DASH} />
          <Row label="Kundenstatus" value={c.customerStatus ?? EM_DASH} />
          <Row label="Identität" value={customerVerificationUiLabelDe(idUi)} />
          <Row label="Führerschein" value={customerVerificationUiLabelDe(licenseUi)} />
          <Row label="Risikostufe" value={c.riskLevel ?? EM_DASH} />
        </dl>
      </div>

      <CustomerVerificationPanel
        customerId={c.customerId}
        bookingId={detail.core.bookingId}
        orgId={orgId}
        compact
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Offene Rechnungen" value={c.openInvoiceCount} tone={c.openInvoiceCount > 0 ? 'warning' : 'neutral'} />
        <Metric label="Offene Bußgelder" value={c.openFineCount} tone={c.openFineCount > 0 ? 'warning' : 'neutral'} />
        <Metric label="No-Show Historie" value={c.noShowCount} tone={c.noShowCount > 0 ? 'critical' : 'neutral'} />
      </div>

      {detail.eligibility && (
        <div className={card}>
          <h3 className="text-xs font-bold mb-3">Mietfreigabe (Eligibility)</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <StatusChip tone={detail.eligibility.canStartRental ? 'success' : 'critical'}>
              Pickup: {detail.eligibility.canStartRental ? 'Erlaubt' : 'Blockiert'}
            </StatusChip>
            <StatusChip tone={detail.eligibility.canConfirmBooking ? 'success' : 'warning'}>
              Bestätigung: {detail.eligibility.canConfirmBooking ? 'Erlaubt' : 'Eingeschränkt'}
            </StatusChip>
          </div>
          {detail.eligibility.blockingReasons.length > 0 && (
            <ul className="text-xs text-[color:var(--status-critical)] list-disc pl-4 space-y-1">
              {detail.eligibility.blockingReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {detail.eligibility.warnings.length > 0 && (
            <ul className="text-xs text-[color:var(--status-attention)] list-disc pl-4 space-y-1 mt-2">
              {detail.eligibility.warnings.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'critical';
}) {
  return (
    <div className={`${card} text-center`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <StatusChip tone={tone === 'critical' ? 'critical' : tone === 'warning' ? 'warning' : 'neutral'}>
        {value}
      </StatusChip>
    </div>
  );
}
