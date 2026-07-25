import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { StatusDot } from '../../components/patterns';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorShell } from '../context/OperatorShellContext';

function formatSyncTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function OperatorHeader() {
  const { orgName, loading: orgLoading } = useRentalOrg();
  const { syncState, triggerRefresh } = useOperatorShell();

  const syncLabel = syncState.loading
    ? 'Synchronisation läuft'
    : syncState.error
      ? 'Synchronisation fehlgeschlagen'
      : syncState.lastSyncAt
        ? `Zuletzt synchronisiert um ${formatSyncTime(syncState.lastSyncAt)}`
        : 'Noch nicht synchronisiert';

  const syncShort = syncState.loading
    ? 'Sync…'
    : syncState.error
      ? 'Fehler'
      : syncState.lastSyncAt
        ? formatSyncTime(syncState.lastSyncAt)
        : '—';

  return (
    <header
      className="sticky top-0 z-20 border-b border-border/50 surface-frosted"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Operator
          </p>
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground">
            {orgLoading ? 'Laden…' : orgName || 'SynqDrive'}
          </h1>
        </div>

        <button
          type="button"
          onClick={triggerRefresh}
          aria-label={syncLabel}
          className="sq-press flex h-11 min-w-[44px] items-center gap-1.5 rounded-xl border border-border/70 bg-popover px-2.5 text-[10px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        >
          <StatusDot
            tone={syncState.error ? 'critical' : syncState.loading ? 'watch' : 'success'}
            pulse={syncState.loading}
          />
          <span className="hidden xs:inline" aria-hidden>
            {syncShort}
          </span>
          <RefreshCw
            className={`h-3.5 w-3.5 ${syncState.loading ? 'motion-safe:animate-spin' : ''}`}
            aria-hidden
          />
        </button>
        <span className="sr-only" aria-live="polite">
          {syncLabel}
        </span>

        <Link
          to="/rental"
          aria-label="Zur SynqDrive App wechseln"
          className="sq-press flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-border/70 bg-popover px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        >
          App
        </Link>
      </div>
    </header>
  );
}
