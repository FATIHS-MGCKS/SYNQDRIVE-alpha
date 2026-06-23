import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminStripeStatusDto, AdminWebhookEventDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, parsePaginated } from './admin-billing.utils';

export function BillingStripeTab() {
  const [status, setStatus] = useState<AdminStripeStatusDto | null>(null);
  const [events, setEvents] = useState<AdminWebhookEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stripeRes, eventsRes] = await Promise.all([
        api.billing.adminStripeStatus(),
        api.billing.adminWebhookEvents({ limit: '50' }),
      ]);
      setStatus(stripeRes as AdminStripeStatusDto);
      setEvents(parsePaginated<AdminWebhookEventDto>(eventsRes).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Stripe-Status nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  const integrationLabel =
    status?.integrationStatus === 'CONNECTED'
      ? 'Verbunden'
      : status?.integrationStatus === 'PREPARED'
        ? 'Vorbereitet'
        : 'Nicht verbunden';

  const integrationTone =
    status?.integrationStatus === 'CONNECTED'
      ? 'sq-tone-success'
      : status?.integrationStatus === 'PREPARED'
        ? 'sq-tone-info'
        : 'sq-tone-neutral';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Integration', value: integrationLabel, tone: integrationTone },
          { label: 'Stripe Customers', value: String(status?.stripeCustomerMappingCount ?? 0) },
          { label: 'Webhook Events', value: String(status?.webhookEventCount ?? 0) },
          { label: 'Fehlgeschlagen', value: String(status?.failedWebhookCount ?? 0) },
        ].map((kpi) => (
          <div key={kpi.label} className="sq-card rounded-xl p-4 shadow-[var(--shadow-1)]">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {kpi.label}
            </p>
            <p
              className={`mt-2 text-xl font-semibold tabular-nums ${kpi.tone ? kpi.tone : 'text-foreground'}`}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Secret: {status?.stripeSecretConfigured ? 'konfiguriert' : 'fehlt'} · Webhook:{' '}
          {status?.stripeWebhookConfigured ? 'konfiguriert' : 'fehlt'}
        </p>
        <button
          type="button"
          disabled
          title="Stripe Sync wird vorbereitet"
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 text-muted-foreground cursor-not-allowed"
        >
          Stripe Sync prüfen
        </button>
      </div>

      <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <h3 className="text-[15px] font-semibold mb-3">Webhook Events</h3>
        {events.length === 0 ? (
          <EmptyState
            compact
            title="Noch keine Webhook-Events"
            description="Sobald Stripe verbunden ist, erscheinen Events hier."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-muted/40">
                  {['Typ', 'Status', 'Erstellt', 'Verarbeitet', 'Fehler'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-t border-border/50">
                    <td className="px-3 py-2.5 text-xs font-mono">{ev.type}</td>
                    <td className="px-3 py-2.5 text-xs">{ev.status}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateDe(ev.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateDe(ev.processedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                      {ev.errorMessage ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
