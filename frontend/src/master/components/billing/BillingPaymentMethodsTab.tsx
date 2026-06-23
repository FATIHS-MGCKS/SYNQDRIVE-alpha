import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminOrgBillingRowDto, AdminPaymentMethodRowDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import {
  paymentMethodLabel,
  paymentMethodStatusLabel,
  paymentMethodStatusTone,
} from './admin-billing.utils';

interface BillingPaymentMethodsTabProps {
  organizations?: AdminOrgBillingRowDto[];
}

export function BillingPaymentMethodsTab({ organizations = [] }: BillingPaymentMethodsTabProps) {
  const [methods, setMethods] = useState<AdminPaymentMethodRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await api.billing.adminPaymentMethods()) as AdminPaymentMethodRowDto[];
      setMethods(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const withPm = methods;
    const missingOrgs = organizations
      .filter((o) => o.warnings.includes('PAYMENT_METHOD_MISSING'))
      .filter((o) => !withPm.some((m) => m.organizationId === o.organization.id))
      .map((o) => ({
        id: `missing-${o.organization.id}`,
        organizationId: o.organization.id,
        organizationName: o.organization.companyName,
        hasPaymentMethod: false,
        type: 'NONE',
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        status: 'MISSING',
        isDefault: false,
        stripeCustomerId: null,
        warnings: ['PAYMENT_METHOD_MISSING'],
      })) as AdminPaymentMethodRowDto[];

    return [...withPm, ...missingOrgs].sort((a, b) =>
      a.organizationName.localeCompare(b.organizationName),
    );
  }, [methods, organizations]);

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Zahlungsmethoden nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  if (rows.length === 0) {
    return <EmptyState compact title="Keine Zahlungsmethoden-Daten" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="bg-muted/40">
            {['Organisation', 'Vorhanden', 'Typ', 'Karte', 'Ablauf', 'Status', 'Stripe Customer'].map(
              (h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2.5 text-xs font-semibold">{row.organizationName}</td>
              <td className="px-3 py-2.5 text-xs">{row.hasPaymentMethod ? 'Ja' : 'Nein'}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {row.hasPaymentMethod ? paymentMethodLabel(row.type) : '—'}
              </td>
              <td className="px-3 py-2.5 text-xs">
                {row.brand && row.last4 ? `${row.brand} •••• ${row.last4}` : '—'}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {row.expMonth && row.expYear
                  ? `${String(row.expMonth).padStart(2, '0')}/${row.expYear}`
                  : '—'}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${paymentMethodStatusTone(row.status)}`}
                >
                  {paymentMethodStatusLabel(row.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                {row.stripeCustomerId ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
