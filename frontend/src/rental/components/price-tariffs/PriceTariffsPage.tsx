import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Car,
  Clock,
  Layers,
  Package,
  Plus,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { usePriceTariffs } from '../../hooks/usePriceTariffs';
import { PageHeader } from '../../../components/patterns';
import { EmptyState, ErrorState, SkeletonMetricGrid } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { TariffGroupsTab } from './TariffGroupsTab';
import { VehicleAssignmentsTab } from './VehicleAssignmentsTab';
import { ExtrasInsuranceTab } from './ExtrasInsuranceTab';
import { PricingSimulatorTab } from './PricingSimulatorTab';
import { TariffGroupDrawer } from './TariffGroupDrawer';
import { RulesPlaceholderTab } from './RulesPlaceholderTab';
import type { PriceTariffGroup } from '../../pricing/pricingTypes';
import {
  countVehiclesInGroup,
  formatPriceCents,
  getActiveVersion,
  grossFromNetCents,
  resolveGroupStatus,
  STATUS_BADGE,
} from '../../pricing/pricingUtils';

type TabId = 'groups' | 'assignments' | 'extras' | 'simulator' | 'rules';

interface PriceTariffsPageProps {
  isDarkMode: boolean;
}

interface TariffKpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'critical' | 'watch' | 'success' | 'info';
  subdued?: boolean;
  accent?: boolean;
}

function TariffKpiCard({
  label,
  value,
  icon: MetricIcon,
  tone,
  subdued = false,
  accent,
}: TariffKpiCardProps) {
  const hasAccent = accent ?? (typeof value === 'number' ? value > 0 : false);
  const isCritical = tone === 'critical' && hasAccent;
  const isWatch = tone === 'watch' && hasAccent;
  const isSuccess = tone === 'success' && hasAccent;
  const isInfo = tone === 'info' && hasAccent;
  const isEmpty = value === '—';

  return (
    <div
      className={cn(
        'relative overflow-hidden border text-left',
        'min-h-[96px] rounded-lg surface-premium/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 surface-premium/55',
        isSuccess && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
        isInfo && 'border-border/45 surface-premium/55',
        !isCritical && !isWatch && !isSuccess && !isInfo && 'border-border/45',
      )}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 truncate text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              (subdued || isEmpty) && 'text-muted-foreground',
              isCritical && 'text-[color:var(--status-critical)]',
              isSuccess && 'text-[color:var(--status-positive)]',
              isWatch && 'text-[color:var(--status-watch)]',
              isInfo && 'text-[color:var(--status-info)]',
              !subdued && !isEmpty && !isCritical && !isSuccess && !isWatch && !isInfo && 'text-foreground',
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isSuccess && 'sq-tone-success',
            isInfo && 'sq-tone-info',
            !isCritical && !isWatch && !isSuccess && !isInfo && 'bg-muted text-muted-foreground',
          )}
        >
          <MetricIcon className="h-3 w-3" />
        </div>
      </div>
      {isWatch ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-watch)]"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

export function PriceTariffsPage({ isDarkMode }: PriceTariffsPageProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const { catalog, loading, error, reload } = usePriceTariffs(orgId);
  const [tab, setTab] = useState<TabId>('groups');
  const [drawerGroup, setDrawerGroup] = useState<PriceTariffGroup | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const taxRate = catalog?.priceBook?.taxRatePercent ?? 19;

  const kpis = useMemo(() => {
    const groups = catalog?.groups ?? [];
    const activeGroups = groups.filter((g) => getActiveVersion(g)?.rate);
    const rates = activeGroups
      .map((g) => getActiveVersion(g)?.rate?.dailyRateCents ?? 0)
      .filter((r) => r > 0);
    const avgDailyGross =
      rates.length > 0
        ? Math.round(
            rates.reduce((s, r) => s + grossFromNetCents(r, taxRate), 0) / rates.length,
          )
        : 0;
    const incomplete = groups.filter((g) => {
      const v = getActiveVersion(g);
      return !v?.rate || v.rate.dailyRateCents <= 0;
    }).length;
    const assigned = catalog?.assignments.filter((a) => a.isActive).length ?? 0;
    return {
      activeGroups: activeGroups.length,
      assigned,
      unassigned: catalog?.unassignedVehicleCount ?? 0,
      avgDailyGross,
      incomplete,
      lastUpdated: groups[0]?.updatedAt,
    };
  }, [catalog, taxRate]);

  const handleCreateGroup = async () => {
    if (!orgId) return;
    const name = window.prompt('Name der Tarifgruppe:', 'Neue Gruppe');
    if (!name?.trim()) return;
    setCreatingGroup(true);
    try {
      await api.pricing.createGroup(orgId, { name: name.trim(), category: name.trim() });
      toast.success('Tarifgruppe erstellt');
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreatingGroup(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: typeof Layers }[] = [
    { id: 'groups', label: 'Tariff Groups', icon: Layers },
    { id: 'assignments', label: 'Vehicle Assignments', icon: Car },
    { id: 'extras', label: 'Extras & Insurance', icon: Package },
    { id: 'simulator', label: 'Pricing Simulator', icon: Calculator },
    { id: 'rules', label: 'Rules / Seasons', icon: Sparkles },
  ];

  if (loading && !catalog) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Tarife werden geladen…</p>
        <SkeletonMetricGrid count={6} />
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <ErrorState
        title="Tarife konnten nicht geladen werden"
        description={error}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('priceTariffs.title')}
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setTab('simulator')}>
              <Calculator className="h-3.5 w-3.5" />
              Simulate
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={creatingGroup}
              onClick={() => void handleCreateGroup()}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden min-[440px]:inline">Create tariff group</span>
              <span className="min-[440px]:hidden">Create</span>
            </Button>
          </div>
        )}
      />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-6">
        <TariffKpiCard label="Active groups" value={kpis.activeGroups} icon={Layers} tone="info" accent={kpis.activeGroups > 0} />
        <TariffKpiCard label="Vehicles assigned" value={kpis.assigned} icon={Car} tone="success" accent={kpis.assigned > 0} />
        <TariffKpiCard
          label="Without tariff"
          value={kpis.unassigned}
          icon={AlertTriangle}
          tone="watch"
          accent={kpis.unassigned > 0}
        />
        <TariffKpiCard
          label="Avg. daily rate"
          value={kpis.avgDailyGross > 0 ? formatPriceCents(kpis.avgDailyGross) : '—'}
          icon={TrendingUp}
          tone="info"
          accent={kpis.avgDailyGross > 0}
          subdued={kpis.avgDailyGross <= 0}
        />
        <TariffKpiCard
          label="Incomplete"
          value={kpis.incomplete}
          icon={Sparkles}
          tone="watch"
          accent={kpis.incomplete > 0}
        />
        <TariffKpiCard
          label="Last updated"
          value={kpis.lastUpdated ? new Date(kpis.lastUpdated).toLocaleDateString('de-DE') : '—'}
          icon={Clock}
          subdued={!kpis.lastUpdated}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/50 pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {!catalog?.groups?.length ? (
        <EmptyState
          title="Noch keine Tarifgruppen"
          description="Erstellen Sie eine Tarifgruppe oder warten Sie auf die automatische Migration aus Fahrzeugdaten."
          action={
            <button
              type="button"
              onClick={() => void handleCreateGroup()}
              className="rounded-xl bg-[color:var(--brand)] px-4 py-2 text-xs font-semibold text-white"
            >
              Create tariff group
            </button>
          }
        />
      ) : (
        <>
          {tab === 'groups' && (
            <TariffGroupsTab
              isDarkMode={isDarkMode}
              catalog={catalog}
              onSelectGroup={setDrawerGroup}
            />
          )}
          {tab === 'assignments' && (
            <VehicleAssignmentsTab catalog={catalog} onReload={() => void reload()} />
          )}
          {tab === 'extras' && <ExtrasInsuranceTab catalog={catalog} />}
          {tab === 'simulator' && <PricingSimulatorTab catalog={catalog} />}
          {tab === 'rules' && <RulesPlaceholderTab />}
        </>
      )}

      {drawerGroup && orgId && (
        <TariffGroupDrawer
          isDarkMode={isDarkMode}
          orgId={orgId}
          group={drawerGroup}
          catalog={catalog}
          onClose={() => setDrawerGroup(null)}
          onSaved={async () => {
            const freshCatalog = await reload();
            const groupId = drawerGroup.id;
            const refreshedGroup = freshCatalog?.groups.find((g) => g.id === groupId);
            if (refreshedGroup) {
              setDrawerGroup(refreshedGroup);
            }
          }}
        />
      )}
    </div>
  );
}
