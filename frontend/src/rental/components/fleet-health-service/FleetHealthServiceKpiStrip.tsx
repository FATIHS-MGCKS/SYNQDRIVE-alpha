import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CircleDot,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { StatusTone } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { FleetHealthKpis } from '../../lib/fleet-health-control-center';
import type { FleetHealthServiceExecutionGroups } from './fleet-health-service.view-model';
import { fhs } from './fleet-health-service-shell';

export interface FleetHealthServiceKpiItem {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone: StatusTone;
  icon: LucideIcon;
  emphasize?: boolean;
}

export function buildFleetHealthServiceKpis(
  healthKpis: FleetHealthKpis,
  execution: FleetHealthServiceExecutionGroups,
): FleetHealthServiceKpiItem[] {
  return [
    {
      key: 'action',
      label: 'Handlungsbedarf',
      value: healthKpis.actionRequired,
      hint:
        healthKpis.blocked > 0
          ? `${healthKpis.blocked} blockiert`
          : 'kritisch oder gesperrt',
      tone: 'critical',
      icon: ShieldAlert,
      emphasize: true,
    },
    {
      key: 'review',
      label: 'Prüfen',
      value: healthKpis.needsReview,
      hint: 'Warnsignale',
      tone: 'warning',
      icon: AlertTriangle,
    },
    {
      key: 'in_progress',
      label: 'In Bearbeitung',
      value: execution.inProgressServiceTasks.length,
      hint: 'aktive Aufgaben',
      tone: 'info',
      icon: Loader2,
    },
    {
      key: 'overdue',
      label: 'Überfällig',
      value: execution.overdueServiceTasks.length,
      hint: 'Fälligkeit überschritten',
      tone: 'critical',
      icon: Clock,
    },
    {
      key: 'vendor',
      label: 'Wartet Partner',
      value: execution.vendorWaitingTasks.length,
      hint: 'Werkstatt / Partner',
      tone: 'warning',
      icon: UserRound,
    },
    {
      key: 'limited',
      label: 'Daten begrenzt',
      value: healthKpis.limited,
      hint:
        healthKpis.naModuleVehicles > 0
          ? `${healthKpis.naModuleVehicles} ohne Tracking`
          : 'nicht voll bewertbar',
      tone: 'noData',
      icon: CircleDot,
    },
    {
      key: 'healthy',
      label: 'Gesund',
      value: healthKpis.healthy,
      hint: 'vermietungsbereit',
      tone: 'success',
      icon: ShieldCheck,
    },
  ];
}

const TONE_VALUE: Partial<Record<StatusTone, string>> = {
  critical: 'text-[color:var(--status-critical)]',
  warning: 'text-[color:var(--status-watch)]',
  success: 'text-[color:var(--status-positive)]',
  noData: 'text-muted-foreground',
  info: 'text-[color:var(--brand-ink)]',
};

interface FleetHealthServiceKpiStripProps {
  items: FleetHealthServiceKpiItem[];
  loading?: boolean;
  onItemClick?: (key: string) => void;
}

export function FleetHealthServiceKpiStrip({
  items,
  loading,
  onItemClick,
}: FleetHealthServiceKpiStripProps) {
  return (
    <div className={fhs.kpiGrid}>
      {items.map((item) => {
        const IconCmp = item.icon;
        const Tag = onItemClick ? 'button' : 'div';
        return (
          <Tag
            key={item.key}
            type={onItemClick ? 'button' : undefined}
            onClick={onItemClick ? () => onItemClick(item.key) : undefined}
            className={cn(
              fhs.kpiCard,
              onItemClick && 'cursor-pointer',
              item.tone === 'critical' && item.value > 0 && fhs.kpiCardCritical,
              item.tone === 'warning' && item.value > 0 && fhs.kpiCardWarning,
              item.tone === 'success' && item.value > 0 && fhs.kpiCardSuccess,
              item.emphasize && item.value > 0 && 'ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_22%,transparent)]',
            )}
          >
            <div className="flex items-center gap-1">
              <IconCmp className="h-3 w-3 shrink-0 text-muted-foreground" />
              <p className={fhs.kpiTitle}>{item.label}</p>
            </div>
            <p
              className={cn(
                'mt-1',
                fhs.kpiNumber,
                TONE_VALUE[item.tone] ?? 'text-foreground',
              )}
            >
              {loading && item.value === 0 ? '—' : item.value}
            </p>
            <p className={cn('mt-0.5 truncate', fhs.kpiHint)}>{item.hint}</p>
          </Tag>
        );
      })}
    </div>
  );
}
