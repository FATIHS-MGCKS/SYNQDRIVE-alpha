import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  dataTrustStatusLabel,
  dataTrustStatusTone,
  type DataTrustDomainSummary,
} from './dataTrustBuilder';
import {
  DashboardPanelHeader,
  PANEL_BODY_CLASS,
  panelShellClass,
} from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';

interface DataFreshnessIndicatorProps {
  vm: DashboardViewModel;
}

export function DataFreshnessIndicator({ vm }: DataFreshnessIndicatorProps) {
  const { dataTrust, vehicleTelemetryFreshness: tlm, locale } = vm;
  const de = locale === 'de';

  return (
    <section
      className={panelShellClass('secondary', 'h-full')}
      aria-label={de ? 'Datenvertrauen' : 'Data trust'}
    >
      <DashboardPanelHeader
        icon={<Icon name="shield-check" className="h-4 w-4" />}
        iconToneClass="sq-tone-info"
        title={de ? 'Datenvertrauen' : 'Data trust'}
        subtitle={
          de
            ? 'Verlässlichkeit der Dashboard-Quellen'
            : 'Reliability of dashboard data sources'
        }
        trailing={
          <StatusChip tone={dataTrustStatusTone(dataTrust.overallStatus)}>
            {dataTrustStatusLabel(dataTrust.overallStatus, locale)}
          </StatusChip>
        }
      />

      <div className={cn(PANEL_BODY_CLASS, 'flex flex-1 flex-col gap-3')}>
        <ul className="space-y-1.5" aria-label={de ? 'Datenbereiche' : 'Data domains'}>
          {dataTrust.domains.map((domain) => (
            <TrustDomainRow key={domain.id} domain={domain} locale={locale} />
          ))}
        </ul>

        {tlm.totalInScope > 0 && tlm.hasReliableTimestamps ? (
          <div className="rounded-xl border border-border/45 bg-card/30 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {de ? 'Telemetrie im Scope' : 'Telemetry in scope'}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <MiniStat label={de ? 'Frisch' : 'Fresh'} value={tlm.freshCount} tone="success" />
              <MiniStat label="Stale" value={tlm.staleCount} tone={tlm.staleCount > 0 ? 'watch' : 'neutral'} />
              <MiniStat
                label={de ? 'Offline' : 'Offline'}
                value={tlm.offlineCount}
                tone={tlm.offlineCount > 0 ? 'critical' : 'neutral'}
              />
              <MiniStat label="?" value={tlm.unknownCount} />
            </div>
          </div>
        ) : null}

        <div className="mt-auto border-t border-border/40 pt-3 text-[10px] text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{de ? 'Letzter Refresh' : 'Last refresh'}</span>
            <span className="font-medium tabular-nums text-foreground">{dataTrust.lastRefreshLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustDomainRow({
  domain,
  locale,
}: {
  domain: DataTrustDomainSummary;
  locale: string;
}) {
  const de = locale === 'de';

  return (
    <li className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/25 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-semibold text-foreground">{domain.label}</p>
          <StatusChip tone={dataTrustStatusTone(domain.status)} className="text-[8px]">
            {dataTrustStatusLabel(domain.status, locale)}
          </StatusChip>
          {!domain.computable ? (
            <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
              {de ? 'eingeschränkt' : 'limited'}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{domain.detail}</p>
        <p className="mt-0.5 text-[9px] tabular-nums text-muted-foreground/80">{domain.timestampLabel}</p>
      </div>
    </li>
  );
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'success' | 'watch' | 'critical' | 'neutral';
}) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-bold tabular-nums leading-none',
          tone === 'success' && 'text-[color:var(--status-positive)]',
          tone === 'watch' && 'text-[color:var(--status-watch)]',
          tone === 'critical' && 'text-[color:var(--status-critical)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}
