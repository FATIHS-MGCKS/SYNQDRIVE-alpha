import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminBillingReconciliationDriftDto } from '../../types/admin-billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { formatDateDe } from './admin-billing.utils';

export function BillingReconciliationTab() {
  const [drifts, setDrifts] = useState<AdminBillingReconciliationDriftDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.adminReconciliationDrifts();
      setDrifts(Array.isArray(res) ? res : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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
        setMessage('Drift automatisch behoben.');
      } else {
        await api.billing.adminResolveReconciliationDrift(driftId);
        setMessage('Drift als gelöst markiert.');
      }
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (loading) return <SkeletonCard className="h-64" />;
  if (error) {
    return (
      <ErrorState title="Reconciliation nicht verfügbar" description={error} onRetry={() => void load()} />
    );
  }

  return (
    <div className="space-y-4" data-testid="master-reconciliation-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Abgleich zwischen SynqDrive und Stripe inkl. Drift-Erkennung.
        </p>
        <button
          type="button"
          disabled={running}
          onClick={() => void runReconciliation()}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
        >
          Reconciliation starten
        </button>
      </div>

      {message ? <p className="text-xs rounded-lg px-3 py-2 bg-muted/30">{message}</p> : null}

      {drifts.length === 0 ? (
        <EmptyState compact title="Keine offenen Drifts." description="System ist synchron." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="bg-muted/40">
                {['Organisation', 'Typ', 'Schwere', 'Erkannt', 'Aktion'].map((header) => (
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
                  <td className="px-3 py-2.5 text-xs font-mono">{drift.organizationId}</td>
                  <td className="px-3 py-2.5 text-xs">{drift.driftType}</td>
                  <td className="px-3 py-2.5 text-xs">{drift.severity}</td>
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
      )}
    </div>
  );
}
