import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useFleetVehicles } from '../../FleetContext';
import type { PriceTariffCatalog } from '../../pricing/pricingTypes';
import { formatNetAsGross, getActiveVersion, getVehicleTariffFromCatalog } from '../../pricing/pricingUtils';

interface VehicleAssignmentsTabProps {
  catalog: PriceTariffCatalog;
  onReload: () => void;
}

export function VehicleAssignmentsTab({ catalog, onReload }: VehicleAssignmentsTabProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;

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
        dailyGross: ctx?.version.rate
          ? formatNetAsGross(ctx.version.rate.dailyRateCents, taxRate)
          : '—',
        assigned: Boolean(assignment),
      };
    });
  }, [fleetVehicles, catalog, taxRate]);

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
    for (const vehicleId of selected) {
      try {
        await api.pricing.assignVehicle(orgId, { vehicleId, tariffGroupId: bulkGroupId });
        ok++;
      } catch {
        /* skip conflict */
      }
    }
    toast.success(`${ok} Fahrzeug(e) zugewiesen`);
    setSelected([]);
    setAssigning(false);
    onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vehicle or plate…"
          className="rounded-xl border border-border bg-popover px-3 py-2 text-xs min-w-[200px]"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-xl border border-border surface-premium px-3 py-2 text-xs"
        >
          <option value="all">All</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-xl border border-border surface-premium px-3 py-2 text-xs"
        >
          <option value="all">All tariff groups</option>
          {catalog.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
          <span className="text-xs font-semibold">{selected.length} selected</span>
          <select
            value={bulkGroupId}
            onChange={(e) => setBulkGroupId(e.target.value)}
            className="rounded-lg border border-border surface-premium px-2 py-1.5 text-xs"
          >
            <option value="">Tariff group…</option>
            {catalog.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bulkGroupId || assigning}
            onClick={() => void bulkAssign()}
            className="rounded-lg bg-[color:var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Bulk assign
          </button>
        </div>
      )}

      <div className="surface-premium overflow-hidden rounded-2xl border border-border/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Vehicle</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Plate</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Fuel</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Tariff group</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Daily rate</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 font-mono">{r.plate}</td>
                  <td className="px-3 py-2">{r.fuel}</td>
                  <td className="px-3 py-2">{r.groupName}</td>
                  <td className="px-3 py-2 tabular-nums">{r.dailyGross}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                        r.assigned ? 'sq-tone-success' : 'sq-tone-warning'
                      }`}
                    >
                      {r.assigned ? 'Assigned' : 'No tariff'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
