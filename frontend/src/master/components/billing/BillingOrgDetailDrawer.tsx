import { useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  paymentMethodStatusLabel,
  priceStatusLabel,
  subscriptionStatusLabel,
  subscriptionStatusTone,
  warningLabel,
} from './admin-billing.utils';

interface BillingOrgDetailDrawerProps {
  row: AdminOrgBillingRowDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingOrgDetailDrawer({
  row,
  open,
  onOpenChange,
}: BillingOrgDetailDrawerProps) {
  const [syncNote, setSyncNote] = useState<string | null>(null);

  if (!row) return null;

  const subStatus = row.subscription?.status ?? 'NONE';
  const products = row.products.map((p) => `${p.product.name} (${p.plan})`).join(' · ') || '—';

  const handleSyncStripe = async () => {
    setSyncNote(null);
    try {
      const res = (await api.billing.adminSyncStripe(row.organization.id)) as {
        message?: string;
        prepared?: boolean;
      };
      setSyncNote(res.message ?? 'Stripe Sync: vorbereitet.');
    } catch (e) {
      const msg = (e as Error).message ?? '';
      setSyncNote(
        msg.toLowerCase().includes('not configured') || msg.includes('501')
          ? 'Stripe wird vorbereitet — noch nicht live.'
          : msg || 'Stripe Sync fehlgeschlagen.',
      );
    }
  };

  const adminActions = [
    {
      label: 'Stripe Sync starten',
      hint: 'Gibt Prepared-State zurück, bis Stripe SDK aktiv ist',
      action: handleSyncStripe,
    },
  ] as const;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={row.organization.companyName}
      description="Subscription-, Fahrzeug- und Zahlungsübersicht"
      widthClassName="sm:max-w-lg"
      status={
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${subscriptionStatusTone(subStatus)}`}>
          {subscriptionStatusLabel(subStatus)}
        </span>
      }
    >
      <div className="space-y-5">
        {row.warnings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {row.warnings.map((w) => (
              <span key={w} className="px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-warning">
                {warningLabel(w)}
              </span>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Subscription
          </h4>
          {[
            ['Produkte', products],
            ['Verbundene Fahrzeuge', String(row.connectedVehicleCount)],
            ['Abrechenbare Fahrzeuge', String(row.billableVehicleCount)],
            ['Preisstatus', priceStatusLabel(row.priceStatus)],
            [
              'Nächste Rechnung (Vorschau)',
              row.nextInvoicePreview.totalCents != null
                ? formatMoneyCents(row.nextInvoicePreview.totalCents)
                : 'Nicht berechenbar',
            ],
            [
              'Zeitraum',
              `${formatDateDe(row.subscription?.currentPeriodStart)} – ${formatDateDe(row.subscription?.currentPeriodEnd)}`,
            ],
            ['Zahlungsmethode', paymentMethodStatusLabel(row.paymentMethodStatus)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-right">{value}</span>
            </div>
          ))}
        </section>

        {row.lastInvoice && (
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Letzte Rechnung
            </h4>
            <p className="text-xs">
              {formatMoneyCents(row.lastInvoice.amountCents)} · {row.lastInvoice.status} ·{' '}
              {formatDateDe(row.lastInvoice.invoiceDate)}
            </p>
          </section>
        )}

        <section>
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Admin Actions
          </h4>
          <div className="space-y-2">
            {syncNote && (
              <p className="text-[11px] text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                {syncNote}
              </p>
            )}
            {adminActions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                title={action.hint}
                onClick={() => void action.action()}
              >
                {action.label}
              </Button>
            ))}
            <p className="text-[10px] text-muted-foreground px-1">
              Trial, Status-Override und Custom Price Override sind noch nicht angebunden.
            </p>
          </div>
        </section>
      </div>
    </DetailDrawer>
  );
}
