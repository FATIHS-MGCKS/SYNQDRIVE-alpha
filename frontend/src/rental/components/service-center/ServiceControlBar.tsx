import { AlertTriangle, CalendarClock, Car, ClipboardList, Shield, Wrench } from 'lucide-react';
import { sc } from './service-center-ui';
import { formatKpiValue } from './service-center.utils';
import type { ServiceKpiSnapshot, ServiceTaskFilter } from './service-center.types';

interface ServiceControlBarProps {
  kpis: ServiceKpiSnapshot;
  loading?: boolean;
  activeFilter?: ServiceTaskFilter | null;
  onFilterSelect?: (filter: ServiceTaskFilter) => void;
}

interface KpiDef {
  key: ServiceTaskFilter;
  label: string;
  subtitle: string;
  value: number | null;
  icon: typeof Wrench;
  accent?: 'default' | 'watch' | 'critical';
}

export function ServiceControlBar({
  kpis,
  loading,
  activeFilter,
  onFilterSelect,
}: ServiceControlBarProps) {
  const items: KpiDef[] = [
    {
      key: 'overdue',
      label: 'Überfällig',
      subtitle: 'Fälligkeit überschritten',
      value: kpis.overdue,
      icon: AlertTriangle,
      accent: 'critical',
    },
    {
      key: 'due-soon',
      label: 'Bald fällig',
      subtitle: 'Nächste 7 Tage',
      value: kpis.dueSoon,
      icon: CalendarClock,
      accent: 'watch',
    },
    {
      key: 'in-progress',
      label: 'In Werkstatt',
      subtitle: 'Aktiv in Bearbeitung',
      value: kpis.inProgress,
      icon: Wrench,
    },
    {
      key: 'waiting-vendor',
      label: 'Wartet Partner',
      subtitle: 'Rückmeldung ausstehend',
      value: kpis.waitingVendor,
      icon: ClipboardList,
      accent: 'watch',
    },
    {
      key: 'urgent',
      label: 'Kritisch / Blockiert',
      subtitle: 'Miete oder Priorität kritisch',
      value: kpis.urgent,
      icon: Car,
      accent: 'critical',
    },
    {
      key: 'tuv',
      label: 'TÜV/HU',
      subtitle: 'Prüfung & Inspektion',
      value: kpis.tuvDue,
      icon: Shield,
      accent: 'watch',
    },
    {
      key: 'repairs',
      label: 'Reparaturen',
      subtitle: 'Offene Reparaturfälle',
      value: kpis.openRepairs,
      icon: Wrench,
    },
    {
      key: 'service',
      label: 'Service offen',
      subtitle: 'Wartung & Checks',
      value: kpis.openService,
      icon: Wrench,
    },
  ];

  return (
    <section className={sc.controlBar} aria-label="Service-Kennzahlen">
      <div className="mb-3 flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className={sc.sectionEyebrow}>Instandhaltung</p>
          <h2 className={sc.sectionTitle}>Operative Service-Steuerung</h2>
        </div>
        {loading && (
          <span className="text-[10px] text-muted-foreground animate-pulse">Wird geladen…</span>
        )}
        {!kpis.dataReady && !loading && (
          <span className="text-[10px] text-muted-foreground">Keine KPI-Daten verfügbar</span>
        )}
      </div>

      <div className={sc.kpiGrid}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeFilter === item.key;
          const hasValue = (item.value ?? 0) > 0;
          const valueClass =
            item.accent === 'critical' && hasValue
              ? 'text-red-600 dark:text-red-400'
              : item.accent === 'watch' && hasValue
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-foreground';

          return (
            <button
              key={item.key}
              type="button"
              disabled={!onFilterSelect}
              onClick={() => onFilterSelect?.(item.key)}
              className={`${sc.kpiTile} ${isActive ? sc.kpiTileActive : ''} disabled:cursor-default`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground truncate">{item.label}</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums tracking-[-0.03em] ${valueClass}`}>
                    {loading && !kpis.dataReady ? '…' : formatKpiValue(item.value)}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground/90 leading-snug line-clamp-2">
                    {item.subtitle}
                  </p>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
