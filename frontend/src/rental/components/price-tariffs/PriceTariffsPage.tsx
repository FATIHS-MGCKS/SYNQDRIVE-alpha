import { useMemo, useState } from 'react';
import { Calculator, Car, Layers, Package, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { usePriceTariffs } from '../../hooks/usePriceTariffs';
import { EmptyState, ErrorState, SkeletonMetricGrid } from '../../../components/patterns/states';
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

export function PriceTariffsPage({ isDarkMode }: PriceTariffsPageProps) {
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Price Tariffs</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Manage rental rates, mileage, insurance, extras and deposits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="sq-press flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-[10px] font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setTab('simulator')}
            className="sq-press flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-[10px] font-semibold text-foreground hover:bg-muted"
          >
            <Calculator className="h-3.5 w-3.5" />
            Simulate
          </button>
          <button
            type="button"
            disabled={creatingGroup}
            onClick={() => void handleCreateGroup()}
            className="sq-press flex items-center gap-1.5 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Create tariff group
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {[
          { label: 'Active groups', value: kpis.activeGroups },
          { label: 'Vehicles assigned', value: kpis.assigned },
          { label: 'Without tariff', value: kpis.unassigned, warn: kpis.unassigned > 0 },
          {
            label: 'Avg. daily rate',
            value: kpis.avgDailyGross > 0 ? formatPriceCents(kpis.avgDailyGross) : '—',
          },
          { label: 'Incomplete', value: kpis.incomplete, warn: kpis.incomplete > 0 },
          {
            label: 'Last updated',
            value: kpis.lastUpdated
              ? new Date(kpis.lastUpdated).toLocaleDateString('de-DE')
              : '—',
          },
        ].map((k) => (
          <div key={k.label} className="sq-card rounded-2xl border border-border/50 p-3 shadow-[var(--shadow-1)]">
            <p className="text-[10px] font-semibold text-muted-foreground">{k.label}</p>
            <p
              className={`mt-1 text-[18px] font-bold tabular-nums ${
                k.warn ? 'text-[color:var(--status-warning)]' : 'text-foreground'
              }`}
            >
              {k.value}
            </p>
          </div>
        ))}
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
            await reload();
            setDrawerGroup(null);
          }}
        />
      )}
    </div>
  );
}
