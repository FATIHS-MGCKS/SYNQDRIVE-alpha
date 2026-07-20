import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CircleDot,
  Clock,
  Loader2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { StatusTone } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { FleetHealthKpis, OperatorStatusFilter } from '../../lib/fleet-health-control-center';
import type { ServiceTaskFilter } from '../service-center/service-center.types';
import type { FleetHealthServiceExecutionGroups } from './fleet-health-service.view-model';
import { fhs } from './fleet-health-service-shell';

export type FleetHealthServiceKpiUnit = 'vehicles' | 'tasks';

export type FleetHealthServiceKpiDomain = 'health' | 'execution';

export interface FleetHealthServiceKpiItem {
  key: string;
  domain: FleetHealthServiceKpiDomain;
  label: string;
  value: number | null;
  unit: FleetHealthServiceKpiUnit;
  hint: string;
  tone: StatusTone;
  icon: LucideIcon;
  vehicleStatusFilter?: OperatorStatusFilter;
  taskFilter?: ServiceTaskFilter;
  workSection?: 'tasks' | 'schedule' | 'vendors';
}

export interface FleetHealthServiceKpiGroup {
  key: FleetHealthServiceKpiDomain;
  title: string;
  items: FleetHealthServiceKpiItem[];
  unavailable: boolean;
}

export interface BuildFleetHealthServiceKpiGroupsInput {
  healthKpis: FleetHealthKpis;
  execution: FleetHealthServiceExecutionGroups;
  healthError?: string | null;
  serviceError?: string | null;
  healthLoading?: boolean;
  serviceLoading?: boolean;
}

function healthValue(
  count: number,
  healthError: string | null | undefined,
  healthLoading: boolean | undefined,
): number | null {
  if (healthError) return null;
  if (healthLoading) return null;
  return count;
}

function executionValue(
  count: number,
  serviceError: string | null | undefined,
  serviceLoading: boolean | undefined,
): number | null {
  if (serviceError) return null;
  if (serviceLoading) return null;
  return count;
}

export function buildFleetHealthServiceKpiGroups(
  input: BuildFleetHealthServiceKpiGroupsInput,
): FleetHealthServiceKpiGroup[] {
  const {
    healthKpis,
    execution,
    healthError,
    serviceError,
    healthLoading,
    serviceLoading,
  } = input;

  const healthUnavailable = Boolean(healthError) || Boolean(healthLoading);
  const executionUnavailable = Boolean(serviceError) || Boolean(serviceLoading);

  return [
    {
      key: 'health',
      title: 'Fahrzeugzustand',
      unavailable: Boolean(healthError),
      items: [
        {
          key: 'blocked',
          domain: 'health',
          label: 'Technisch blockiert',
          value: healthValue(healthKpis.blocked, healthError, healthLoading),
          unit: 'vehicles',
          hint: 'Vermietung gesperrt',
          tone: 'critical',
          icon: Ban,
          vehicleStatusFilter: 'blocked',
        },
        {
          key: 'review',
          domain: 'health',
          label: 'Technisch prüfen',
          value: healthValue(healthKpis.needsReview, healthError, healthLoading),
          unit: 'vehicles',
          hint: 'Warnsignale',
          tone: 'warning',
          icon: AlertTriangle,
          vehicleStatusFilter: 'review',
        },
        {
          key: 'limited',
          domain: 'health',
          label: 'Nicht bewertbar',
          value: healthValue(healthKpis.limited, healthError, healthLoading),
          unit: 'vehicles',
          hint:
            healthKpis.naModuleVehicles > 0
              ? `${healthKpis.naModuleVehicles} ohne Tracking`
              : 'Daten unvollständig',
          tone: 'noData',
          icon: CircleDot,
          vehicleStatusFilter: 'limited',
        },
        {
          key: 'healthy',
          domain: 'health',
          label: 'Technisch unauffällig',
          value: healthValue(healthKpis.healthy, healthError, healthLoading),
          unit: 'vehicles',
          hint: 'ohne Warnsignale',
          tone: 'success',
          icon: ShieldCheck,
          vehicleStatusFilter: 'good',
        },
      ],
    },
    {
      key: 'execution',
      title: 'Ausführung',
      unavailable: Boolean(serviceError),
      items: [
        {
          key: 'overdue',
          domain: 'execution',
          label: 'Überfällig',
          value: executionValue(
            execution.overdueServiceTasks.length,
            serviceError,
            serviceLoading,
          ),
          unit: 'tasks',
          hint: 'Fälligkeit überschritten',
          tone: 'critical',
          icon: Clock,
          taskFilter: 'overdue',
          workSection: 'tasks',
        },
        {
          key: 'due_today',
          domain: 'execution',
          label: 'Heute fällig',
          value: executionValue(
            execution.dueTodayServiceTasks.length,
            serviceError,
            serviceLoading,
          ),
          unit: 'tasks',
          hint: 'Fälligkeit heute',
          tone: 'warning',
          icon: CalendarClock,
          taskFilter: 'due-today',
          workSection: 'tasks',
        },
        {
          key: 'in_progress',
          domain: 'execution',
          label: 'In Bearbeitung',
          value: executionValue(
            execution.inProgressServiceTasks.length,
            serviceError,
            serviceLoading,
          ),
          unit: 'tasks',
          hint: 'aktive Aufgaben',
          tone: 'info',
          icon: Loader2,
          taskFilter: 'in-progress',
          workSection: 'tasks',
        },
        {
          key: 'vendor',
          domain: 'execution',
          label: 'Wartet Partner',
          value: executionValue(
            execution.vendorWaitingTasks.length,
            serviceError,
            serviceLoading,
          ),
          unit: 'tasks',
          hint: 'Werkstatt / Partner',
          tone: 'warning',
          icon: UserRound,
          taskFilter: 'waiting-vendor',
          workSection: 'vendors',
        },
      ],
    },
  ];
}

/** @deprecated Use {@link buildFleetHealthServiceKpiGroups} — flat list for legacy callers. */
export function buildFleetHealthServiceKpis(
  healthKpis: FleetHealthKpis,
  execution: FleetHealthServiceExecutionGroups,
): FleetHealthServiceKpiItem[] {
  return buildFleetHealthServiceKpiGroups({
    healthKpis,
    execution,
  }).flatMap((group) => group.items);
}

const TONE_VALUE: Partial<Record<StatusTone, string>> = {
  critical: 'text-[color:var(--status-critical)]',
  warning: 'text-[color:var(--status-watch)]',
  success: 'text-[color:var(--status-positive)]',
  noData: 'text-muted-foreground',
  info: 'text-[color:var(--brand-ink)]',
};

const UNIT_LABEL_KEYS: Record<FleetHealthServiceKpiUnit, TranslationKey> = {
  vehicles: 'fleetHealthService.kpi.unit.vehicles',
  tasks: 'fleetHealthService.kpi.unit.tasks',
};

function formatKpiValue(value: number | null): string {
  if (value === null) return '—';
  return String(value);
}

interface FleetHealthServiceKpiStripProps {
  groups: FleetHealthServiceKpiGroup[];
  onItemClick?: (item: FleetHealthServiceKpiItem) => void;
}

export function FleetHealthServiceKpiStrip({
  groups,
  onItemClick,
}: FleetHealthServiceKpiStripProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </h3>
            {group.unavailable ? (
              <span className="text-[10px] text-muted-foreground">
                {t('fleetHealthService.kpi.unavailable')}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {group.items.map((item) => {
              const IconCmp = item.icon;
              const Tag = onItemClick ? 'button' : 'div';
              const displayValue = formatKpiValue(item.value);
              return (
                <Tag
                  key={item.key}
                  type={onItemClick ? 'button' : undefined}
                  onClick={onItemClick ? () => onItemClick(item) : undefined}
                  className={cn(
                    fhs.kpiCard,
                    onItemClick && 'cursor-pointer',
                    item.tone === 'critical' &&
                      item.value != null &&
                      item.value > 0 &&
                      fhs.kpiCardCritical,
                    item.tone === 'warning' &&
                      item.value != null &&
                      item.value > 0 &&
                      fhs.kpiCardWarning,
                    item.tone === 'success' &&
                      item.value != null &&
                      item.value > 0 &&
                      fhs.kpiCardSuccess,
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 items-center gap-1">
                      <IconCmp className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <p className={cn(fhs.kpiTitle, 'truncate')}>{item.label}</p>
                    </div>
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(UNIT_LABEL_KEYS[item.unit])}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'mt-1 tabular-nums',
                      fhs.kpiNumber,
                      item.value === null
                        ? 'text-muted-foreground'
                        : (TONE_VALUE[item.tone] ?? 'text-foreground'),
                    )}
                  >
                    {displayValue}
                  </p>
                  <p className={cn('mt-0.5 truncate', fhs.kpiHint)}>{item.hint}</p>
                </Tag>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
