import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import type { AdminStripeStatusDto, AdminWebhookEventDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe, parsePaginated } from './admin-billing.utils';

export function BillingStripeTab({ mode = 'full' }: { mode?: 'full' | 'api' | 'webhooks' }) {
  const [status, setStatus] = useState<AdminStripeStatusDto | null>(null);
  const [events, setEvents] = useState<AdminWebhookEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventParams: Record<string, string> = { limit: '50' };
      if (failedOnly) eventParams.status = 'FAILED';
      const [stripeRes, eventsRes] = await Promise.all([
        api.billing.adminStripeStatus(),
        api.billing.adminWebhookEvents(eventParams),
      ]);
      setStatus(stripeRes as AdminStripeStatusDto);
      setEvents(parsePaginated<AdminWebhookEventDto>(eventsRes).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [failedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReconciliation = async () => {
    setReconcileMessage(null);
    try {
      await api.billing.adminReconciliationRun({});
      setReconcileMessage('Reconciliation-Lauf gestartet.');
    } catch (e) {
      setReconcileMessage((e as Error).message);
    }
  };

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return <ErrorState title="Stripe-Status nicht verfügbar" description={error} onRetry={() => void load()} />;
  }

  const showApi = mode === 'full' || mode === 'api';
  const showWebhooks = mode === 'full' || mode === 'webhooks';

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

  const communicationConfigured =
    Boolean(status?.lastWebhookAt) ||
    (status?.webhookEventCount ?? 0) > 0 ||
    status?.integrationStatus === 'CONNECTED';

  return (
    <div className="space-y-5" data-testid={`master-stripe-tab-${mode}`}>
      {showApi ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Integration', value: integrationLabel, tone: integrationTone },
              {
                label: 'Modus',
                value: status?.runtimeStripeMode ?? '—',
              },
              { label: 'Stripe-Kunden', value: String(status?.stripeCustomerMappingCount ?? 0) },
              { label: 'Fehlgeschlagene Webhooks', value: String(status?.failedWebhookCount ?? 0) },
            ].map((kpi) => (
              <div key={kpi.label} className="surface-premium rounded-xl p-4 shadow-[var(--shadow-1)]">
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

          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Secret: {status?.stripeSecretConfigured ? 'konfiguriert' : 'fehlt'} · Webhook:{' '}
              {status?.stripeWebhookConfigured ? 'konfiguriert' : 'fehlt'}
            </p>
            <p className="text-xs text-muted-foreground">
              Letzter Webhook: {formatDateDe(status?.lastWebhookAt)} · Letzter erfolgreicher:{' '}
              {formatDateDe(status?.lastSuccessfulWebhookAt)}
            </p>
            <p className="text-xs">
              Kommunikationsstatus:{' '}
              <span className={communicationConfigured ? 'sq-tone-success' : 'sq-tone-warning'}>
                {communicationConfigured ? 'Aktiv (echte Events)' : 'Nur Konfiguration, keine Events'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={() => void runReconciliation()}>
                Reconciliation starten
              </Button>
            </div>
            {reconcileMessage ? (
              <p className="text-xs rounded-lg px-3 py-2 bg-background/60">{reconcileMessage}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {showWebhooks ? (
        <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-[15px] font-semibold">Webhook-Events</h3>
            <button
              type="button"
              onClick={() => setFailedOnly((current) => !current)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                failedOnly
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              Nur fehlgeschlagen
            </button>
          </div>
          {events.length === 0 ? (
            <EmptyState
              compact
              title="Keine Webhook-Events"
              description="Sobald Stripe Events liefert, erscheinen sie hier."
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
      ) : null}
    </div>
  );
}
