import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Station } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
type AssignVehicleRow = {
  id: string;
  license: string;
  make: string;
  model: string;
  year: number | null;
  stationId: string | null;
  stationName: string | null;
  latitude: number | null;
  longitude: number | null;
};

interface StationAssignVehicleModalProps {
  station: Station | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function StationAssignVehicleModal({ station, onClose, onSaved }: StationAssignVehicleModalProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();
  const [vehicles, setVehicles] = useState<AssignVehicleRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'here' | 'elsewhere' | 'unassigned'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !station) return;
    setLoading(true);
    setError(null);
    try {
      const all: AssignVehicleRow[] = [];
      let page = 1;
      const pageSize = 100;
      let total = Infinity;
      while (all.length < total) {
        const vehicleRes = await api.vehicles.listByOrg(orgId, { limit: pageSize, page });
        const rows = ((vehicleRes as { data?: unknown[]; total?: number })?.data ?? []).map((v) => {
          const row = v as Record<string, unknown>;
          return {
            id: String(row.id),
            license: String(row.license ?? row.licensePlate ?? ''),
            make: String(row.make ?? ''),
            model: String(row.model ?? ''),
            year: typeof row.year === 'number' ? row.year : null,
            stationId: (row.homeStationId ?? row.stationId ?? null) as string | null,
            stationName: (row.stationName ?? row.station ?? null) as string | null,
            latitude: typeof row.latitude === 'number' ? row.latitude : null,
            longitude: typeof row.longitude === 'number' ? row.longitude : null,
          };
        });
        total = typeof (vehicleRes as { meta?: { total?: number } }).meta?.total === 'number'
          ? (vehicleRes as { meta: { total: number } }).meta.total
          : rows.length;
        all.push(...rows);
        if (rows.length < pageSize) break;
        page += 1;
      }
      all.sort((a, b) => a.license.localeCompare(b.license, 'de'));
      setVehicles(all);
      setSelected(new Set(all.filter((v) => v.stationId === station.id).map((v) => v.id)));
    } catch (e) {
      setError((e as Error).message || t('stations.assign.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [orgId, station, t]);

  useEffect(() => {
    if (station) void load();
    else {
      setVehicles([]);
      setSelected(new Set());
      setSearch('');
      setFilter('all');
      setError(null);
    }
  }, [station, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (filter === 'here' && v.stationId !== station?.id) return false;
      if (filter === 'elsewhere' && (!v.stationId || v.stationId === station?.id)) return false;
      if (filter === 'unassigned' && v.stationId) return false;
      if (!q) return true;
      const hay = [v.license, v.make, v.model, v.stationName].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, filter, station?.id]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!orgId || !station) return;
    setSaving(true);
    setError(null);
    try {
      await api.stations.setVehicles(orgId, station.id, Array.from(selected));
      toast.success(t('stations.assign.saved'));
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message || t('stations.assign.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  if (!station) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} aria-label={t('common.close')} />
      <div className="relative w-full sm:max-w-xl max-h-[90vh] surface-premium rounded-t-2xl sm:rounded-2xl border border-border shadow-xl flex flex-col animate-fade-up">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border/60">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('stations.assign.title')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{station.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-muted/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-border/60">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('stations.assign.search')}
            className="w-full px-3 py-2 rounded-lg border border-border surface-premium text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'here', 'elsewhere', 'unassigned'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  filter === key ? 'sq-tone-brand' : 'bg-muted text-muted-foreground'
                }`}
              >
                {t(`stations.assign.filter.${key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-[color:var(--status-critical)]">{error}</p>
              <button type="button" onClick={() => void load()} className="text-xs font-semibold sq-tone-brand px-3 py-1.5 rounded-lg">
                {t('stations.assign.retry')}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">{t('stations.assign.empty')}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((v) => {
                const checked = selected.has(v.id);
                return (
                  <li key={v.id}>
                    <label className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${checked ? 'bg-[color:var(--brand-soft)]/40' : 'hover:bg-muted/40'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(v.id)} className="rounded" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold font-mono">{v.license || '—'}</span>
                        <p className="text-xs text-muted-foreground truncate">
                          {[v.make, v.model, v.year].filter(Boolean).join(' ')}
                          {v.stationName ? ` · ${v.stationName}` : ` · ${t('stations.assign.unassigned')}`}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-border/60 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {t('stations.assign.selected')}: {selected.size}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-xl text-xs font-semibold border border-border">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void submit()} disabled={saving || loading} className="sq-3d-btn sq-3d-btn--primary px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
