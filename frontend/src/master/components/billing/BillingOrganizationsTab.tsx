import { useMemo, useState } from 'react';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { EmptyState } from '../../../components/patterns/states';
import {
  formatDateDe,
  formatMoneyCents,
  paymentMethodStatusLabel,
  paymentMethodStatusTone,
  priceStatusLabel,
  priceStatusTone,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from './admin-billing.utils';

type OrgFilter = 'all' | 'payment_missing' | 'price_not_configured' | 'past_due';

interface BillingOrganizationsTabProps {
  organizations: AdminOrgBillingRowDto[];
  onSelectOrg: (row: AdminOrgBillingRowDto) => void;
}

export function BillingOrganizationsTab({ organizations, onSelectOrg }: BillingOrganizationsTabProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [filter, setFilter] = useState<OrgFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return organizations.filter((row) => {
      if (status !== 'all' && row.subscription?.status !== status) return false;
      if (filter === 'payment_missing' && !row.warnings.includes('PAYMENT_METHOD_MISSING')) {
        return false;
      }
      if (
        filter === 'price_not_configured' &&
        !row.warnings.some((w) =>
          ['PRICE_NOT_CONFIGURED', 'NO_ACTIVE_PRICE_VERSION'].includes(w),
        )
      ) {
        return false;
      }
      if (filter === 'past_due' && !row.warnings.includes('PAST_DUE')) return false;
      if (q && !row.organization.companyName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [organizations, search, status, filter]);

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-xs outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_160px_180px] gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Organisation suchen…"
          className={inputClass}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="all">Alle Status</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="TRIALING">Testphase</option>
          <option value="PAST_DUE">Überfällig</option>
          <option value="CANCELLED">Gekündigt</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as OrgFilter)} className={inputClass}>
          <option value="all">Alle Filter</option>
          <option value="payment_missing">Ohne Zahlungsmethode</option>
          <option value="price_not_configured">Preis nicht konfiguriert</option>
          <option value="past_due">Überfällig</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState compact title="Keine Organisationen gefunden" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-muted/40">
                {[
                  'Organisation',
                  'Produkte',
                  'Status',
                  'Verbunden',
                  'Billable',
                  'Preisstatus',
                  'Proj. Monat',
                  'Zahlung',
                  'Letzte Rechnung',
                  'Periodenende',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const products = row.products.map((p) => p.product.name).join(' · ') || '—';
                const subStatus = row.subscription?.status ?? 'NONE';
                return (
                  <tr
                    key={row.organization.id}
                    className="border-t border-border/50 hover:bg-muted/20 cursor-pointer"
                    onClick={() => onSelectOrg(row)}
                  >
                    <td className="px-3 py-2.5 text-xs font-semibold text-foreground">
                      {row.organization.companyName}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate">
                      {products}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${subscriptionStatusTone(subStatus)}`}
                      >
                        {subscriptionStatusLabel(subStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{row.connectedVehicleCount}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{row.billableVehicleCount}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${priceStatusTone(row.priceStatus)}`}
                      >
                        {priceStatusLabel(row.priceStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-medium">
                      {row.projectedMonthlyAmountCents != null
                        ? formatMoneyCents(row.projectedMonthlyAmountCents)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${paymentMethodStatusTone(row.paymentMethodStatus)}`}
                      >
                        {paymentMethodStatusLabel(row.paymentMethodStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.lastInvoice
                        ? formatMoneyCents(row.lastInvoice.amountCents)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateDe(row.subscription?.currentPeriodEnd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
