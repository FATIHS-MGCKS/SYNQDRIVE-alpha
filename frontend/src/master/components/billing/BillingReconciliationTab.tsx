import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { BillingReconciliationDriftEnrichedDto } from '../../billing/types';
import { StatusChip } from '../../../components/patterns';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe } from './admin-billing.utils';

interface BillingReconciliationTabProps {
  onOpenSubscription?: (organizationId: string) => void;
}

export function BillingReconciliationTab({ onOpenSubscription }: BillingReconciliationTabProps) {
  const [drifts, setDrifts] = useState<BillingReconciliationDriftEnrichedDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.adminReconciliationDriftsOperational(
        severityFilter === 'all' ? undefined : { severity: severityFilter },
      );
      setDrifts(Array.isArray(res) ? res : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [severityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReconciliation = async () => {
    setRunning(true);
    setMessage(null);
    try {
      await api.billing.adminReconciliationRun({});
      setMessage('Reconciliation-Lauf gestartet.');
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const resolveDrift = async (driftId: string, autoFix: boolean) => {
    setMessage(null);
    try {
      if (autoFix) {
        await api.billing.adminAutoFixReconciliationDrift(driftId);
        setMessage('Abweichung automatisch behoben — Status wird nach Backend-Bestätigung aktualisiert.');
      } else {
        await api.billing.adminResolveReconciliationDrift(driftId);
        setMessage('Abweichung als gelöst markiert.');
      }
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return (
      <ErrorState title="Abgleich nicht verfügbar" description={error} onRetry={() => void load()} />
    );
  }

  return (
    <div className="space-y-4" data-testid="master-reconciliation-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Schweregrad filtern"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          >
            <option value="all">Alle Schweregrade</option>
            <option value="CRITICAL">Kritisch</option>
            <option value="WARNING">Warnung</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => void runReconciliation()}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
        >
          Abgleich starten
        </button>
      </div>

      {message ? <p className="text-xs rounded-lg px-3 py-2 bg-muted/30">{message}</p> : null}

      {drifts.length === 0 ? (
        <EmptyState compact title="Keine offenen Abweichungen." description="System ist synchron." />
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40">
                  {['Organisation', 'Typ', 'Lokal', 'Stripe', 'Schwere', 'Erkannt', 'Aktion'].map((header) => (
                    <th
                      key={header}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drifts.map((drift) => (
                  <tr key={drift.id} className="border-t border-border/50">
                    <td className="px-3 py-2.5 text-xs">
                      <button
                        type="button"
                        className="font-semibold text-foreground hover:underline"
                        onClick={() => onOpenSubscription?.(drift.organizationId)}
                      >
                        {drift.organizationName}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{drift.driftTypeLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{drift.localValue ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{drift.stripeValue ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <StatusChip
                        tone={drift.severity === 'CRITICAL' ? 'critical' : drift.severity === 'WARNING' ? 'warning' : 'info'}
                        className="!text-xs"
                      >
                        {drift.severity}
                      </StatusChip>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateDe(drift.detectedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void resolveDrift(drift.id, false)}
                          className="text-[var(--brand)] font-semibold"
                        >
                          Gelöst
                        </button>
                        {drift.autoFixable ? (
                          <button
                            type="button"
                            onClick={() => void resolveDrift(drift.id, true)}
                            className="text-[var(--brand)] font-semibold"
                          >
                            Auto-Fix
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {drifts.map((drift) => (
              <div key={drift.id} className="rounded-xl border border-border p-4 space-y-2">
                <button
                  type="button"
                  className="font-semibold text-sm"
                  onClick={() => onOpenSubscription?.(drift.organizationId)}
                >
                  {drift.organizationName}
                </button>
                <p className="text-xs">{drift.driftTypeLabel}</p>
                <p className="text-xs text-muted-foreground">Lokal: {drift.localValue ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Stripe: {drift.stripeValue ?? '—'}</p>
                <StatusChip
                  tone={drift.severity === 'CRITICAL' ? 'critical' : 'warning'}
                  className="!text-xs"
                >
                  {drift.severity}
                </StatusChip>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
