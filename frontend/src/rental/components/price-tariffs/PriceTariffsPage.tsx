import { useMemo, useState, useId } from 'react';
import {
  AlertTriangle,
  Calculator,
  Car,
  Clock,
  FilePen,
  Layers,
  Package,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useRentalOrg } from '../../RentalContext';
import { usePriceTariffs } from '../../hooks/usePriceTariffs';
import { PageHeader } from '../../../components/patterns';
import { EmptyState, ErrorState, SkeletonMetricGrid } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { computeTariffCatalogKpis } from '../../pricing/tariff-catalog-metrics';
import { catalogCurrency } from '../../pricing/pricingUtils';
import { TariffGroupsTab } from './TariffGroupsTab';
import { VehicleAssignmentsTab } from './VehicleAssignmentsTab';
import { ExtrasInsuranceTab } from './ExtrasInsuranceTab';
import { PricingSimulatorTab } from './PricingSimulatorTab';
import { TariffGroupDrawer } from './TariffGroupDrawer';
import { CreateTariffGroupDialog } from './CreateTariffGroupDialog';
import type { PriceTariffGroup } from '../../pricing/pricingTypes';

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
              isInfo && 'text-foreground',
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
            isInfo && 'bg-muted text-muted-foreground',
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
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const { catalog, loading, error, reload } = usePriceTariffs(orgId);
  const [tab, setTab] = useState<TabId>('groups');
  const [drawerGroup, setDrawerGroup] = useState<PriceTariffGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const tabListId = useId();

  const catalogCcy = catalogCurrency(catalog);
  const kpis = useMemo(() => computeTariffCatalogKpis(catalog), [catalog]);
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-GB';

  const tabs: Array<{
    id: TabId;
    labelKey: string;
    icon: typeof Layers;
    disabled?: boolean;
    badge?: string;
  }> = [
    { id: 'groups', labelKey: 'priceTariffs.tabs.groups', icon: Layers },
    { id: 'assignments', labelKey: 'priceTariffs.tabs.assignments', icon: Car },
    { id: 'extras', labelKey: 'priceTariffs.tabs.extras', icon: Package },
    { id: 'simulator', labelKey: 'priceTariffs.tabs.simulator', icon: Calculator },
    {
      id: 'rules',
      labelKey: 'priceTariffs.tabs.rules',
      icon: Sparkles,
      disabled: true,
      badge: t('priceTariffs.tabs.planned'),
    },
  ];

  const openGroupEditor = (group: PriceTariffGroup) => {
    setDrawerGroup(group);
    setTab('groups');
  };

  const handleGroupCreated = async (group: PriceTariffGroup) => {
    const fresh = await reload();
    const refreshed = fresh?.groups.find((g) => g.id === group.id) ?? group;
    setDrawerGroup(refreshed);
  };

  if (loading && !catalog) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('priceTariffs.loading')}</p>
        <SkeletonMetricGrid count={4} />
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <ErrorState
        title={t('priceTariffs.error.title')}
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
              {t('priceTariffs.actions.simulate')}
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden min-[440px]:inline">{t('priceTariffs.actions.createGroup')}</span>
              <span className="min-[440px]:hidden">{t('priceTariffs.actions.createShort')}</span>
            </Button>
          </div>
        )}
      />

      {catalog?.priceBook ? (
        <p className="text-xs text-muted-foreground">
          {t('priceTariffs.priceBookSummary', {
            name: catalog.priceBook.name,
            currency: catalogCcy ?? catalog.priceBook.currency,
          })}
          {kpis.lastUpdatedAt ? (
            <>
              {' · '}
              {t('priceTariffs.lastUpdated')}:{' '}
              {new Date(kpis.lastUpdatedAt).toLocaleString(dateLocale)}
            </>
          ) : null}
        </p>
      ) : null}

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4">
        <TariffKpiCard
          label={t('priceTariffs.kpi.activeGroups')}
          value={kpis.activeGroups}
          icon={Layers}
          tone="success"
          accent={kpis.activeGroups > 0}
        />
        <TariffKpiCard
          label={t('priceTariffs.kpi.openDrafts')}
          value={kpis.openDrafts}
          icon={FilePen}
          tone="info"
          accent={kpis.openDrafts > 0}
        />
        <TariffKpiCard
          label={t('priceTariffs.kpi.unassignedVehicles')}
          value={kpis.unassignedVehicles}
          icon={AlertTriangle}
          tone="watch"
          accent={kpis.unassignedVehicles > 0}
        />
        <TariffKpiCard
          label={t('priceTariffs.kpi.scheduledChanges')}
          value={kpis.scheduledChanges}
          icon={Clock}
          tone="info"
          accent={kpis.scheduledChanges > 0}
          subdued={kpis.scheduledChanges === 0}
        />
      </div>

      <div
        role="tablist"
        aria-label={t('priceTariffs.title')}
        className="flex gap-1 overflow-x-auto border-b border-border/50 pb-1"
      >
        {tabs.map((tabDef) => {
          const Icon = tabDef.icon;
          const isActive = tab === tabDef.id;
          return (
            <button
              key={tabDef.id}
              type="button"
              role="tab"
              id={`${tabListId}-tab-${tabDef.id}`}
              aria-selected={isActive}
              aria-controls={`${tabListId}-panel-${tabDef.id}`}
              disabled={tabDef.disabled}
              onClick={() => {
                if (!tabDef.disabled) setTab(tabDef.id);
              }}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                tabDef.disabled && 'cursor-not-allowed opacity-60',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                tabDef.disabled && 'hover:bg-transparent hover:text-muted-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(tabDef.labelKey as never)}
              {tabDef.badge ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  {tabDef.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {!catalog?.groups?.length ? (
        <EmptyState
          title={t('priceTariffs.empty.title')}
          description={t('priceTariffs.empty.description')}
          action={(
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-[color:var(--brand)] px-4 py-2 text-xs font-semibold text-white"
            >
              {t('priceTariffs.actions.createGroup')}
            </button>
          )}
        />
      ) : (
        <>
          {tab === 'groups' && (
            <div
              role="tabpanel"
              id={`${tabListId}-panel-groups`}
              aria-labelledby={`${tabListId}-tab-groups`}
            >
            <TariffGroupsTab
              isDarkMode={isDarkMode}
              catalog={catalog}
              onSelectGroup={openGroupEditor}
            />
            </div>
          )}
          {tab === 'assignments' && (
            <div
              role="tabpanel"
              id={`${tabListId}-panel-assignments`}
              aria-labelledby={`${tabListId}-tab-assignments`}
            >
            <VehicleAssignmentsTab catalog={catalog} onReload={() => void reload()} />
            </div>
          )}
          {tab === 'extras' && (
            <div
              role="tabpanel"
              id={`${tabListId}-panel-extras`}
              aria-labelledby={`${tabListId}-tab-extras`}
            >
            <ExtrasInsuranceTab catalog={catalog} onEditGroup={openGroupEditor} />
            </div>
          )}
          {tab === 'simulator' && (
            <div
              role="tabpanel"
              id={`${tabListId}-panel-simulator`}
              aria-labelledby={`${tabListId}-tab-simulator`}
            >
            <PricingSimulatorTab />
            </div>
          )}
        </>
      )}

      {orgId ? (
        <CreateTariffGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          catalog={catalog}
          onCreated={handleGroupCreated}
        />
      ) : null}

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
            } else {
              setDrawerGroup(null);
            }
          }}
        />
      )}
    </div>
  );
}
