import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useRentalOrg } from '../../RentalContext';
import { useFleetVehicles } from '../../FleetContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { PriceTariffCatalog } from '../../pricing/pricingTypes';
import {
  catalogCurrency,
  extractPricingApiError,
  formatNetAsGross,
  getVehicleTariffFromCatalog,
} from '../../pricing/pricingUtils';

interface VehicleAssignmentsTabProps {
  catalog: PriceTariffCatalog;
  onReload: () => void;
}

export function VehicleAssignmentsTab({ catalog, onReload }: VehicleAssignmentsTabProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;
  const currency = catalogCurrency(catalog);

  const rows = useMemo(() => {
    return fleetVehicles.map((v) => {
      const ctx = getVehicleTariffFromCatalog(catalog, v.id);
      const assignment = catalog.assignments.find((a) => a.isActive && a.vehicleId === v.id);
      return {
        id: v.id,
        label: `${v.make ?? ''} ${v.model}`.trim() || v.model,
        plate: v.license || '—',
        fuel: v.fuelType,
        groupName: ctx?.group.name ?? '—',
        groupId: assignment?.tariffGroupId,
        dailyGross: ctx?.version.rate && currency
          ? formatNetAsGross(ctx.version.rate.dailyRateCents, taxRate, currency)
          : '—',
        assigned: Boolean(assignment),
      };
    });
  }, [fleetVehicles, catalog, taxRate, currency]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (q && !r.label.toLowerCase().includes(q) && !r.plate.toLowerCase().includes(q)) return false;
    if (filter === 'assigned' && !r.assigned) return false;
    if (filter === 'unassigned' && r.assigned) return false;
    if (groupFilter !== 'all' && r.groupId !== groupFilter) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const bulkAssign = async () => {
    if (!orgId || !bulkGroupId || selected.length === 0) return;
    setAssigning(true);
    let ok = 0;
    const failed: string[] = [];
    for (const vehicleId of selected) {
      try {
        await api.pricing.assignVehicle(orgId, { vehicleId, tariffGroupId: bulkGroupId });
        ok++;
      } catch (e: unknown) {
        const row = rows.find((r) => r.id === vehicleId);
        const structured = extractPricingApiError(e);
        failed.push(structured?.message ?? row?.label ?? vehicleId);
      }
    }
    if (ok > 0) {
      toast.success(t('priceTariffs.assignments.bulkSuccess', { count: ok }));
    }
    if (failed.length > 0) {
      toast.error(t('priceTariffs.assignments.bulkFailed', { count: failed.length }), {
        description: failed.slice(0, 3).join(' · '),
      });
    }
    setSelected([]);
    setAssigning(false);
    onReload();
  };

  const searchId = 'tariff-assignments-search';
  const filterId = 'tariff-assignments-filter';
  const groupFilterId = 'tariff-assignments-group-filter';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={searchId} className="sr-only">
          {t('priceTariffs.assignments.search')}
        </label>
        <input
          id={searchId}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('priceTariffs.assignments.search')}
          className="min-h-11 min-w-[min(100%,200px)] flex-1 rounded-xl border border-border bg-popover px-3 py-2 text-xs"
        />
        <label htmlFor={filterId} className="sr-only">
          {t('priceTariffs.assignments.filterAll')}
        </label>
        <select
          id={filterId}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="min-h-11 rounded-xl border border-border surface-premium px-3 py-2 text-xs"
        >
          <option value="all">{t('priceTariffs.assignments.filterAll')}</option>
          <option value="assigned">{t('priceTariffs.assignments.filterAssigned')}</option>
          <option value="unassigned">{t('priceTariffs.assignments.filterUnassigned')}</option>
        </select>
        <label htmlFor={groupFilterId} className="sr-only">
          {t('priceTariffs.assignments.filterGroup')}
        </label>
        <select
          id={groupFilterId}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="min-h-11 rounded-xl border border-border surface-premium px-3 py-2 text-xs"
        >
          <option value="all">{t('priceTariffs.assignments.filterGroup')}</option>
          {catalog.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
          <span className="text-xs font-semibold">
            {t('priceTariffs.assignments.selected', { count: selected.length })}
          </span>
          <select
            value={bulkGroupId}
            onChange={(e) => setBulkGroupId(e.target.value)}
            aria-label={t('priceTariffs.assignments.chooseGroup')}
            className="min-h-11 rounded-lg border border-border surface-premium px-2 py-1.5 text-xs"
          >
            <option value="">{t('priceTariffs.assignments.chooseGroup')}</option>
            {catalog.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!bulkGroupId || assigning}
            onClick={() => void bulkAssign()}
          >
            {t('priceTariffs.assignments.bulkAssign')}
          </Button>
        </div>
      )}

      <div className="space-y-2 md:hidden" role="list" aria-label={t('priceTariffs.assignments.mobileList')}>
        {filtered.map((r) => {
          const checkboxId = `assign-select-${r.id}`;
          return (
            <article
              key={r.id}
              role="listitem"
              className="surface-premium rounded-xl border border-border/50 p-3"
            >
              <div className="flex items-start gap-3">
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={selected.includes(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  aria-label={t('priceTariffs.assignments.selectVehicle', { vehicle: r.label })}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{r.plate}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                    <div>
                      <dt className="text-muted-foreground">{t('priceTariffs.assignments.colGroup')}</dt>
                      <dd className="truncate font-medium">{r.groupName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('priceTariffs.assignments.colDaily')}</dt>
                      <dd className="truncate font-medium tabular-nums">{r.dailyGross}</dd>
                    </div>
                  </dl>
                  <span
                    className={cn(
                      'mt-2 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold',
                      r.assigned ? 'sq-tone-success' : 'sq-tone-warning',
                    )}
                  >
                    {r.assigned
                      ? t('priceTariffs.assignments.statusAssigned')
                      : t('priceTariffs.assignments.statusUnassigned')}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="surface-premium hidden overflow-hidden rounded-2xl border border-border/50 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th scope="col" className="w-10 px-3 py-2">
                  <span className="sr-only">{t('priceTariffs.assignments.selectVehicle', { vehicle: '' })}</span>
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colVehicle')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colPlate')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colFuel')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colGroup')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colDaily')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  {t('priceTariffs.assignments.colStatus')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const checkboxId = `assign-table-${r.id}`;
                return (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={t('priceTariffs.assignments.selectVehicle', { vehicle: r.label })}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2 font-mono">{r.plate}</td>
                    <td className="px-3 py-2">{r.fuel}</td>
                    <td className="px-3 py-2">{r.groupName}</td>
                    <td className="px-3 py-2 tabular-nums">{r.dailyGross}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded-lg px-2 py-0.5 text-[10px] font-semibold',
                          r.assigned ? 'sq-tone-success' : 'sq-tone-warning',
                        )}
                      >
                        {r.assigned
                          ? t('priceTariffs.assignments.statusAssigned')
                          : t('priceTariffs.assignments.statusUnassigned')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
