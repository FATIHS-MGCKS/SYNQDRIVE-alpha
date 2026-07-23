import { Building2, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import { isVehicleAtHomeStation } from '../../lib/geospatial';
import { UsersRolesTab } from './UsersRolesTab';
import { DataAuthorizationTab } from './DataAuthorizationTab';
import { LegalDocumentsTab } from './LegalDocumentsTab';
import { EmailVersandTab } from './settings/email/EmailVersandTab';
import { RentalRulesTab } from './settings/rental-rules/RentalRulesTab';
import { AccountInformationTab } from './settings/AccountInformationTab';
import { CompanyInformationTab } from './settings/CompanyInformationTab';
import { BillingTab } from './billing/BillingTab';
import {
  PageHeader,
  DataCard,
  MetricCard,
  EmptyState,
  StatusChip,
  SectionHeader,
} from '../../components/patterns';
import { AdministrationTabBar } from './settings/AdministrationTabBar';
import { AdministrationTabPanel } from './settings/AdministrationTabPanel';
import type { SettingsTab } from './settings/settingsTypes';
import { useLanguage } from '../i18n/LanguageContext';

function useDocumentDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

interface SettingsViewProps {
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  onNavigateToStations?: () => void;
}

export type { SettingsTab } from './settings/settingsTypes';

// ============================================
// STATIONS & BRANCHES TAB â€” fully live-wired
// ============================================
// Reads from GET /organizations/:orgId/stations (and /stats), supports
// add/edit/delete/activate-deactivate, Mapbox Search Box autocomplete, and
// shows aggregate vehicle counts. Tenant-scoped via useRentalOrg.
// ============================================
// Geofence sliders are clamped to this range. Values outside get rejected
// by the backend (`stations.service.ts > buildWriteData`) too â€” keep these
// in sync with `RADIUS_MIN_M` / `RADIUS_MAX_M` there.
const STATION_RADIUS_MIN_M = 25;
const STATION_RADIUS_MAX_M = 5000;
const STATION_RADIUS_DEFAULT_M = 150;

type StationFormState = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  phone: string;
  email: string;
  managerName: string;
  openingHours: string;
  notes: string;
  googlePlaceId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};

const EMPTY_STATION_FORM: StationFormState = {
  name: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  latitude: null,
  longitude: null,
  radiusMeters: STATION_RADIUS_DEFAULT_M,
  phone: '',
  email: '',
  managerName: '',
  openingHours: '',
  notes: '',
  googlePlaceId: null,
  status: 'ACTIVE',
};

export function StationsTab() {
  const { orgId } = useRentalOrg();

  const [stations, setStations] = useState<import('../../lib/api').Station[]>([]);
  const [stats, setStats] = useState<import('../../lib/api').StationsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stationScope, setStationScope] = useState<'all' | 'active' | 'assigned' | 'setup'>('all');

  // Modal state (create or edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StationFormState>(EMPTY_STATION_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status toggle feedback
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Vehicle assignment modal â€” SET-semantics editor for the vehicle â†” station
  // mapping. We load all vehicles in the org once when the modal opens, then
  // post the resulting set back via api.stations.setVehicles(...).
  type AssignVehicleRow = {
    id: string;
    license: string;
    make: string;
    model: string;
    year: number | null;
    imageUrl: string | null;
    stationId: string | null;
    stationName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  const [assignStation, setAssignStation] = useState<import('../../lib/api').Station | null>(null);
  const [assignVehicles, setAssignVehicles] = useState<AssignVehicleRow[]>([]);
  const [assignSelected, setAssignSelected] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState<'all' | 'unassigned' | 'this' | 'other'>('all');

  // Place autocomplete
  const [suggestions, setSuggestions] = useState<
    Array<import('../../lib/api').StationMapboxSuggestion & { sessionToken: string }>
  >([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // V4.7.07 â€” One-shot Mapbox geocoding backfill state. Surfaced in the page
  // header as "Koordinaten nachziehen" whenever at least one station in the
  // org is missing latitude/longitude (= would render a UNKNOWN HOME/AWAY
  // pill on Dashboard / FleetView). Result banner stays visible until the
  // user dismisses it or runs the backfill again.
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] =
    useState<import('../../lib/api').StationGeocodingBackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ styling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cardClass = 'surface-premium rounded-xl p-4 shadow-[var(--shadow-1)]';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border/70 bg-background text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
  const labelClass =
    'block text-[11px] font-semibold mb-1.5 uppercase tracking-wider text-muted-foreground';

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, aggStats] = await Promise.all([
        api.stations.list(orgId),
        api.stations.stats(orgId).catch(() => null),
      ]);
      setStations(Array.isArray(list) ? list : []);
      setStats(aggStats ?? null);
    } catch (e) {
      setError((e as Error).message || 'Failed to load stations');
      setStations([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // V4.7.07 â€” Manually trigger the Mapbox geocoding backfill. Reloads the
  // station list afterwards so the cards / stats / HOME-AWAY badges in
  // Dashboard + FleetView reflect the freshly geocoded coordinates.
  const runBackfill = useCallback(async () => {
    if (!orgId || backfillRunning) return;
    setBackfillRunning(true);
    setBackfillError(null);
    try {
      const res = await api.stations.backfillCoordinates(orgId);
      setBackfillResult(res);
      await load();
    } catch (e) {
      setBackfillError((e as Error).message || 'Backfill fehlgeschlagen');
    } finally {
      setBackfillRunning(false);
    }
  }, [orgId, backfillRunning, load]);

  const stationsMissingCoords = useMemo(
    () => stations.filter((s) => s.latitude == null || s.longitude == null).length,
    [stations],
  );

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ filtering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (stationScope === 'active' && s.status !== 'ACTIVE') return false;
      if (stationScope === 'assigned' && (s.vehicleCount ?? 0) <= 0) return false;
      if (stationScope === 'setup' && s.latitude != null && s.longitude != null) return false;
      if (!q) return true;
      const haystack = [s.name, s.city, s.address, s.managerName, s.phone, s.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [stations, search, stationScope]);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ form helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_STATION_FORM);
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
    setModalOpen(true);
  };

  const openEdit = (station: import('../../lib/api').Station) => {
    setEditingId(station.id);
    setForm({
      name: station.name,
      address: station.address ?? '',
      city: station.city ?? '',
      postalCode: station.postalCode ?? '',
      country: station.country ?? '',
      latitude: station.latitude,
      longitude: station.longitude,
      radiusMeters: station.radiusMeters ?? STATION_RADIUS_DEFAULT_M,
      phone: station.phone ?? '',
      email: station.email ?? '',
      managerName: station.managerName ?? '',
      openingHours:
        typeof station.openingHours === 'string'
          ? station.openingHours
          : station.openingHours
            ? JSON.stringify(station.openingHours)
            : '',
      notes: station.notes ?? '',
      googlePlaceId: station.googlePlaceId,
      status: station.status,
    });
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_STATION_FORM);
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
  };

  const handleNameChange = (value: string) => {
    setForm((prev) => ({ ...prev, name: value }));
    if (!orgId) return;
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    setSuggestLoading(true);
    setSuggestOpen(true);
    suggestTimeout.current = setTimeout(() => {
      api.stations
        .searchMapbox(orgId, value.trim())
        .then((res) => {
          const token = res.sessionToken;
          setSuggestions(
            (res.suggestions ?? []).map((s) => ({ ...s, sessionToken: token })),
          );
        })
        .catch(() => setSuggestions([]))
        .finally(() => setSuggestLoading(false));
    }, 350);
  };

  const pickSuggestion = async (
    sug: import('../../lib/api').StationMapboxSuggestion & { sessionToken: string },
  ) => {
    if (!orgId || !sug.sessionToken) return;
    setSuggestOpen(false);
    setSuggestions([]);
    const details = await api.stations
      .mapboxRetrieve(orgId, sug.mapboxId, sug.sessionToken)
      .catch(() => null);
    setForm((prev) => ({
      ...prev,
      name: prev.name || details?.name || sug.name,
      address: details?.street ?? details?.formattedAddress ?? prev.address,
      city: details?.city ?? prev.city,
      postalCode: details?.postalCode ?? prev.postalCode,
      country: details?.country ?? prev.country,
      latitude: details?.latitude ?? prev.latitude,
      longitude: details?.longitude ?? prev.longitude,
      phone: details?.phone ?? prev.phone,
      googlePlaceId: details?.externalPlaceId ?? sug.mapboxId,
    }));
  };

  const submit = async () => {
    if (!orgId) return;
    const name = form.name.trim();
    if (!name) {
      setFormError('Stationsname ist erforderlich.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const radius =
        form.radiusMeters == null
          ? null
          : Math.max(
              STATION_RADIUS_MIN_M,
              Math.min(STATION_RADIUS_MAX_M, Math.round(form.radiusMeters)),
            );
      const payload = {
        name,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postalCode: form.postalCode.trim() || null,
        country: form.country.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        radiusMeters: radius,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        managerName: form.managerName.trim() || null,
        openingHours: (() => {
          const raw = form.openingHours.trim();
          if (!raw) return null;
          try {
            return JSON.parse(raw) as import('../../lib/api').StationOpeningHours;
          } catch {
            return { legacyText: raw } as import('../../lib/api').StationOpeningHours;
          }
        })(),
        notes: form.notes.trim() || null,
        googlePlaceId: form.googlePlaceId,
        status: form.status,
      };
      if (editingId) {
        await api.stations.update(orgId, editingId, payload);
      } else {
        await api.stations.create(orgId, payload);
      }
      await load();
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_STATION_FORM);
    } catch (e) {
      setFormError((e as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (station: import('../../lib/api').Station) => {
    if (!orgId) return;
    setTogglingId(station.id);
    try {
      const nextStatus = station.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await api.stations.update(orgId, station.id, { status: nextStatus });
      setStations((prev) =>
        prev.map((s) =>
          s.id === station.id
            ? { ...s, status: nextStatus, statusLabel: nextStatus === 'ACTIVE' ? 'Active' : 'Inactive' }
            : s,
        ),
      );
      // refresh stats in the background
      api.stations.stats(orgId).then(setStats).catch(() => undefined);
    } catch {
      /* no-op; UI remains */
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!orgId || !deletingId) return;
    setDeleting(true);
    try {
      await api.stations.delete(orgId, deletingId);
      await load();
      setDeletingId(null);
    } catch (e) {
      setError((e as Error).message || 'LÃ¶schen fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ vehicle assignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openAssign = useCallback(
    async (station: import('../../lib/api').Station) => {
      if (!orgId) return;
      setAssignStation(station);
      setAssignError(null);
      setAssignSearch('');
      setAssignFilter('all');
      setAssignVehicles([]);
      setAssignSelected(new Set());
      setAssignLoading(true);
      try {
        const res = await api.vehicles.listByOrg(orgId, { limit: 500 });
        const list: AssignVehicleRow[] = ((res as { data?: any[] })?.data ?? []).map((v) => ({
          id: v.id,
          license: v.license ?? v.licensePlate ?? '',
          make: v.make ?? '',
          model: v.model ?? '',
          year: typeof v.year === 'number' ? v.year : null,
          imageUrl: v.imageUrl ?? null,
          stationId: v.stationId ?? null,
          stationName: v.stationName ?? v.station ?? null,
          latitude: typeof v.latitude === 'number' ? v.latitude : null,
          longitude: typeof v.longitude === 'number' ? v.longitude : null,
        }));
        list.sort((a, b) => a.license.localeCompare(b.license, 'de'));
        setAssignVehicles(list);
        setAssignSelected(
          new Set(list.filter((v) => v.stationId === station.id).map((v) => v.id)),
        );
      } catch (e) {
        setAssignError((e as Error).message || 'Fahrzeuge konnten nicht geladen werden');
      } finally {
        setAssignLoading(false);
      }
    },
    [orgId],
  );

  const closeAssign = () => {
    if (assignSaving) return;
    setAssignStation(null);
    setAssignVehicles([]);
    setAssignSelected(new Set());
    setAssignError(null);
    setAssignSearch('');
    setAssignFilter('all');
  };

  const toggleAssignVehicle = (id: string) => {
    setAssignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAssign = async () => {
    if (!orgId || !assignStation) return;
    setAssignSaving(true);
    setAssignError(null);
    try {
      await api.stations.setVehicles(
        orgId,
        assignStation.id,
        Array.from(assignSelected),
      );
      await load();
      setAssignStation(null);
      setAssignVehicles([]);
      setAssignSelected(new Set());
    } catch (e) {
      setAssignError((e as Error).message || 'Zuweisung fehlgeschlagen');
    } finally {
      setAssignSaving(false);
    }
  };

  // Filtered + searched view of the vehicle list inside the assignment modal.
  // Computed each render â€” the list is bounded to ~500 rows so this is cheap
  // and avoids the staleness traps a memo would introduce when the assignment
  // set changes.
  const assignFiltered = (() => {
    const q = assignSearch.trim().toLowerCase();
    const stationId = assignStation?.id ?? null;
    return assignVehicles.filter((v) => {
      if (assignFilter === 'unassigned' && v.stationId !== null) return false;
      if (assignFilter === 'this' && v.stationId !== stationId) return false;
      if (assignFilter === 'other' && (v.stationId === null || v.stationId === stationId)) return false;
      if (!q) return true;
      const haystack = [v.license, v.make, v.model, v.stationName ?? '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  const assignChangeCount = (() => {
    if (!assignStation) return 0;
    let attaches = 0;
    let detaches = 0;
    for (const v of assignVehicles) {
      const wasHere = v.stationId === assignStation.id;
      const willBeHere = assignSelected.has(v.id);
      if (!wasHere && willBeHere) attaches += 1;
      if (wasHere && !willBeHere) detaches += 1;
    }
    return attaches + detaches;
  })();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalStations = stats?.totalStations ?? stations.length;
  const activeStations =
    stats?.activeStations ?? stations.filter((s) => s.status === 'ACTIVE').length;
  const totalVehicles =
    stats?.totalVehicles ?? stations.reduce((sum, s) => sum + s.vehicleCount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div className="animate-fade-up min-w-0">
          <h2 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
            Stations &amp; Branches
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Suche nach Name, Stadt, Managerâ€¦"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-60 pl-9`}
            />
          </div>
          {stationsMissingCoords > 0 && (
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfillRunning}
              title={`${stationsMissingCoords} Station${stationsMissingCoords === 1 ? '' : 'en'} ohne Koordinaten â€” jetzt automatisch Ã¼ber Mapbox geocodieren`}
              className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all disabled:opacity-50 sq-tone-warning hover:opacity-90"
            >
              {backfillRunning ? (
                <Icon name="loader-2" className="w-4 h-4 animate-spin" />
              ) : (
                <Icon name="refresh-cw" className="w-4 h-4" />
              )}
              Koordinaten nachziehen ({stationsMissingCoords})
            </button>
          )}
          <button
            onClick={openCreate}
            className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 surface-premium text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" /> Standort hinzufÃ¼gen
          </button>
        </div>
      </div>

      {/* V4.7.07 â€” Backfill result banner. Stays visible until the user
          clicks the X to dismiss. Lists every station that was checked
          along with the new coords (geocoded), the failure reason
          (failed) or the missing-data reason (skipped). */}
      {(backfillResult || backfillError) && (
        <div
          className={`rounded-xl border p-3 ${
            backfillError
              ? 'sq-tone-critical border border-border'
              : 'sq-tone-success border border-border'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {backfillError ? (
                <>
                  <p className={`text-xs font-semibold ${'text-[color:var(--status-critical)]'}`}>
                    Geocoding fehlgeschlagen
                  </p>
                  <p className={`text-[11px] mt-0.5 ${'text-[color:var(--status-critical)]'}`}>
                    {backfillError}
                  </p>
                </>
              ) : backfillResult ? (
                <>
                  <p className={`text-xs font-semibold ${'text-[color:var(--status-positive)]'}`}>
                    Backfill abgeschlossen â€” {backfillResult.totalGeocoded} geocodiert
                    {backfillResult.totalFailed > 0 && `, ${backfillResult.totalFailed} fehlgeschlagen`}
                    {backfillResult.totalSkipped > 0 && `, ${backfillResult.totalSkipped} Ã¼bersprungen`}
                  </p>
                  {backfillResult.results.length > 0 && (
                    <ul className={`mt-1.5 space-y-0.5 text-[10.5px] ${'text-[color:var(--status-positive)]'}`}>
                      {backfillResult.results.slice(0, 8).map((r) => (
                        <li key={r.stationId} className="flex items-center gap-2">
                          {r.status === 'geocoded' && <Icon name="check-circle" className="w-3 h-3 shrink-0" />}
                          {r.status === 'failed' && <Icon name="x-circle" className="w-3 h-3 shrink-0 text-red-400" />}
                          {r.status === 'skipped' && <Icon name="alert-circle" className="w-3 h-3 shrink-0 text-amber-400" />}
                          <span className="font-semibold">{r.stationName}</span>
                          {r.status === 'geocoded' && r.latitude != null && r.longitude != null && (
                            <span className="font-mono opacity-80">
                              {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                            </span>
                          )}
                          {r.reason && <span className="opacity-80">â€” {r.reason}</span>}
                        </li>
                      ))}
                      {backfillResult.results.length > 8 && (
                        <li className="opacity-70">â€¦ und {backfillResult.results.length - 8} weitere</li>
                      )}
                    </ul>
                  )}
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setBackfillResult(null);
                setBackfillError(null);
              }}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Hinweis schlieÃŸen"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Stats strip */}
      {!loading && stations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StationStatPill
            icon={<Icon name="map-pin" className="w-4 h-4" />}
            label="Alle"
            value={totalStations}
            tone="brand"
            active={stationScope === 'all'}
            onClick={() => setStationScope('all')}
          />
          <StationStatPill
            icon={<Icon name="check-circle" className="w-4 h-4" />}
            label="Aktiv"
            value={activeStations}
            tone="success"
            active={stationScope === 'active'}
            onClick={() => setStationScope('active')}
          />
          <StationStatPill
            icon={<Icon name="car" className="w-4 h-4" />}
            label="Fahrzeuge"
            value={totalVehicles}
            tone="neutral"
            active={stationScope === 'assigned'}
            onClick={() => setStationScope('assigned')}
          />
          <StationStatPill
            icon={<Icon name="alert-circle" className="w-4 h-4" />}
            label="Setup"
            value={stationsMissingCoords}
            tone={stationsMissingCoords > 0 ? 'warning' : 'neutral'}
            active={stationScope === 'setup'}
            onClick={() => setStationScope('setup')}
          />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
            'sq-tone-critical border border-border'
          }`}
        >
          <Icon name="alert-circle" className="w-4 h-4" />
          {error}
          <button
            onClick={load}
            className="ml-auto text-xs font-semibold underline-offset-2 hover:underline"
          >
            Erneut laden
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className={`${cardClass} flex items-center justify-center py-12`}>
          <Icon name="loader-2" className="w-5 h-5 animate-spin text-[color:var(--brand)] mr-2" />
          <span className={`text-xs ${textSecondary}`}>Standorte werden geladenâ€¦</span>
        </div>
      ) : stations.length === 0 ? (
        // Empty state
        <div className={`${cardClass} flex flex-col items-center justify-center py-16 px-6 text-center border-dashed`}>
          <div className="p-4 rounded-full mb-3 sq-tone-brand">
            <Icon name="map-pin" className="w-10 h-10" />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>Noch keine Standorte</p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            Legen Sie Ihren ersten Standort an, um Fahrzeuge und Benutzer geografisch zuzuordnen.
          </p>
          <button
            onClick={openCreate}
            className="sq-press mt-4 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 surface-premium text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" /> Standort hinzufÃ¼gen
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${cardClass} text-center py-10`}>
          <p className={`text-xs ${textSecondary}`}>Keine Treffer fÃ¼r &quot;{search}&quot;.</p>
        </div>
      ) : (
        // Station list
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              onEdit={() => openEdit(station)}
              onDelete={() => setDeletingId(station.id)}
              onToggleStatus={() => toggleStatus(station)}
              onAssign={() => openAssign(station)}
              toggling={togglingId === station.id}
            />
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div
          className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${
              'surface-premium border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${
                'surface-premium border-border'
              }`}
            >
              <div>
                <h3 className={`text-base font-semibold ${textPrimary}`}>
                  {editingId ? 'Standort bearbeiten' : 'Neuen Standort anlegen'}
                </h3>
                <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
                  {editingId
                    ? 'Aktualisieren Sie Adresse, Kontakt und Status dieses Standorts.'
                    : 'Tippen Sie den Namen oder die Adresse ein — Mapbox schlägt passende Standorte vor.'}
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={saving}
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                  'hover:bg-muted'
                }`}
              >
                <Icon name="x" className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name + place autocomplete */}
              <div className="relative">
                <label className={labelClass}>Stationsname / Adresse</label>
                <input
                  type="text"
                  placeholder="z.B. SynqDrive Berlin Mitte"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => form.name.trim().length >= 2 && suggestions.length > 0 && setSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                  className={inputClass}
                  autoComplete="off"
                />
                {suggestOpen && (suggestLoading || suggestions.length > 0) && (
                  <div
                    className={`absolute z-20 mt-1 w-full rounded-lg border shadow-2xl max-h-64 overflow-y-auto ${
                      'surface-premium border-border'
                    }`}
                  >
                    {suggestLoading ? (
                      <div className={`px-3 py-2.5 text-xs flex items-center gap-2 ${textSecondary}`}>
                        <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
                        Suche Standorteâ€¦
                      </div>
                    ) : (
                      suggestions.map((s) => (
                        <button
                          key={s.mapboxId}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 text-xs border-b border-border last:border-b-0 transition-colors hover:bg-muted text-foreground"
                        >
                          <div className="font-medium flex items-center gap-1.5">
                            <Icon name="map-pin" className="w-3.5 h-3.5 text-status-info" /> {s.name}
                          </div>
                          {(s.placeFormatted || s.fullAddress) && (
                            <div className={`${textSecondary} text-[11px] mt-0.5 ml-5`}>
                              {s.placeFormatted || s.fullAddress}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Address grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>StraÃŸe / Adresse</label>
                  <input
                    type="text"
                    placeholder="MusterstraÃŸe 12"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>PLZ</label>
                  <input
                    type="text"
                    placeholder="10115"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Stadt</label>
                  <input
                    type="text"
                    placeholder="Berlin"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Land</label>
                  <input
                    type="text"
                    placeholder="Deutschland"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* V4.7.07 â€” Manual Lat/Lng override. Auto-fills on save via
                  the backend Mapbox geocoder when left empty + an address
                  is set. Surfaced as an explicit override so the user can
                  paste coordinates from Google Maps if Mapbox returns the
                  wrong building (rare but possible for big complexes). */}
              <div
                className="rounded-xl border border-border bg-muted/40 p-3.5"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon name="map-pin" className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                      'text-foreground'
                    }`}>
                      Koordinaten {form.latitude != null && form.longitude != null && (
                        <span className="ml-2 text-[9px] font-normal normal-case tracking-normal text-emerald-500">
                          âœ“ gesetzt
                        </span>
                      )}
                    </label>
                    <p className={`text-[10.5px] mt-0.5 ${textSecondary}`}>
                      Beim Speichern automatisch aus der Adresse berechnet (Mapbox).
                      Optional manuell Ã¼berschreiben â€” z.B. aus Google Maps kopieren.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-semibold mb-1 uppercase tracking-wider ${textSecondary}`}>
                      Breitengrad (Lat)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min={-90}
                      max={90}
                      value={form.latitude ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, latitude: null });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n)) setForm({ ...form, latitude: n });
                      }}
                      placeholder="51.31657"
                      className={`${inputClass} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-semibold mb-1 uppercase tracking-wider ${textSecondary}`}>
                      LÃ¤ngengrad (Lng)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min={-180}
                      max={180}
                      value={form.longitude ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, longitude: null });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n)) setForm({ ...form, longitude: n });
                      }}
                      placeholder="9.49793"
                      className={`${inputClass} font-mono tabular-nums`}
                    />
                  </div>
                </div>
                {(form.latitude != null || form.longitude != null) && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, latitude: null, longitude: null, googlePlaceId: null })}
                    className={`mt-1.5 text-[10px] underline-offset-2 hover:underline ${textSecondary}`}
                  >
                    Koordinaten zurÃ¼cksetzen (beim nÃ¤chsten Speichern wird neu geocodiert)
                  </button>
                )}
              </div>

              {/* Geofence radius â€” defines the "at home" zone for this station */}
              <div
                className="rounded-xl border border-border bg-[color:var(--brand-soft)] p-3.5"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        'sq-tone-brand'
                      }`}
                    >
                      <Icon name="crosshair" className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                        'text-foreground'
                      }`}>
                        Geofence-Umkreis (Home-Zone)
                      </label>
                      <p className={`text-[10.5px] mt-0.5 ${textSecondary}`}>
                        Fahrzeuge gelten als <span className="font-semibold">vor Ort / Home</span>, sobald
                        ihre GPS-Position innerhalb dieses Radius liegt.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={STATION_RADIUS_MIN_M}
                      max={STATION_RADIUS_MAX_M}
                      step={5}
                      value={form.radiusMeters ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, radiusMeters: null });
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        setForm({
                          ...form,
                          radiusMeters: Math.max(
                            STATION_RADIUS_MIN_M,
                            Math.min(STATION_RADIUS_MAX_M, Math.round(n)),
                          ),
                        });
                      }}
                      placeholder={String(STATION_RADIUS_DEFAULT_M)}
                      className={`w-20 px-2 py-1.5 rounded-md border text-[11px] tabular-nums text-right transition-all duration-200 ${
                        'border-border/70 bg-background text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'
                      } outline-none`}
                    />
                    <span className={`text-[11px] font-semibold ${textSecondary}`}>m</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={STATION_RADIUS_MIN_M}
                  max={STATION_RADIUS_MAX_M}
                  step={5}
                  value={form.radiusMeters ?? STATION_RADIUS_DEFAULT_M}
                  onChange={(e) =>
                    setForm({ ...form, radiusMeters: Number(e.target.value) })
                  }
                  className={`w-full accent-blue-600 cursor-pointer ${
                    form.radiusMeters == null ? 'opacity-50' : ''
                  }`}
                />
                <div className={`flex items-center justify-between mt-1.5 text-[10px] ${textSecondary}`}>
                  <span>{STATION_RADIUS_MIN_M} m</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 100 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 100
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Parkplatz Â· 100m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 250 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 250
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Filiale Â· 250m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 1000 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 1000
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      GelÃ¤nde Â· 1km
                    </button>
                  </div>
                  <span>{STATION_RADIUS_MAX_M >= 1000 ? `${STATION_RADIUS_MAX_M / 1000} km` : `${STATION_RADIUS_MAX_M} m`}</span>
                </div>
                {(form.latitude == null || form.longitude == null) && (
                  <p
                    className={`mt-2 text-[10.5px] flex items-start gap-1.5 ${
                      'text-[color:var(--status-watch)]'
                    }`}
                  >
                    <Icon name="alert-circle" className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      Hinweis: Der Umkreis greift erst, wenn die Station Koordinaten hat.
                      Beim Speichern werden Lat/Lng automatisch aus der Adresse berechnet â€”
                      oder Sie tragen sie oben manuell ein.
                    </span>
                  </p>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Stationsleiter</label>
                  <input
                    type="text"
                    placeholder="Vor- und Nachname"
                    value={form.managerName}
                    onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input
                    type="tel"
                    placeholder="+49 30 1234567"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>E-Mail</label>
                  <input
                    type="email"
                    placeholder="station@firma.de"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Ã–ffnungszeiten</label>
                  <input
                    type="text"
                    placeholder="Moâ€“Fr 08:00â€“18:00"
                    value={form.openingHours}
                    onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>Notizen</label>
                <textarea
                  rows={3}
                  placeholder="Interne Notizen zum Standortâ€¦"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Status */}
              <div>
                <label className={labelClass}>Status</label>
                <div className="flex gap-2">
                  {(['ACTIVE', 'INACTIVE'] as const).map((st) => {
                    const active = form.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setForm({ ...form, status: st })}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? st === 'ACTIVE'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-neutral-500 text-white border-neutral-500'
                            : 'border border-border/60 surface-premium text-foreground hover:bg-muted'
                        }`}
                      >
                        {st === 'ACTIVE' ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.latitude !== null && form.longitude !== null && (
                <div className={`text-[11px] ${textSecondary}`}>
                  Koordinaten: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                  {form.googlePlaceId && <> Â· <span className="font-mono">{form.googlePlaceId.slice(0, 18)}â€¦</span></>}
                </div>
              )}

              {formError && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                    'sq-tone-critical border border-border'
                  }`}
                >
                  <Icon name="alert-circle" className="w-4 h-4" />
                  {formError}
                </div>
              )}
            </div>

            <div
              className={`sticky bottom-0 flex items-center justify-end gap-2 px-5 py-4 border-t ${
                'surface-premium border-border'
              }`}
            >
              <button
                onClick={closeModal}
                disabled={saving}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  'border border-border/60 surface-premium text-foreground hover:bg-muted'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand text-brand-foreground rounded-lg text-xs font-semibold hover:bg-brand-hover transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 animate-spin" /> Speichereâ€¦
                  </>
                ) : (
                  <>
                    <Icon name="save" className="w-4 h-4" />
                    {editingId ? 'Aktualisieren' : 'Standort anlegen'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div
          className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setDeletingId(null)}
        >
          <div
            className={`w-full max-w-md rounded-2xl shadow-2xl p-5 ${
              'surface-premium border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2.5 rounded-lg ${'sq-tone-critical'}`}>
                <Icon name="alert-circle" className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className={`text-sm font-semibold ${textPrimary}`}>Standort lÃ¶schen?</h3>
                <p className={`text-xs mt-1 ${textSecondary}`}>
                  {(() => {
                    const s = stations.find((x) => x.id === deletingId);
                    return s
                      ? s.vehicleCount > 0
                        ? `${s.vehicleCount} Fahrzeug(e) sind diesem Standort zugewiesen und werden entkoppelt. Diese Aktion kann nicht rÃ¼ckgÃ¤ngig gemacht werden.`
                        : 'Diese Aktion kann nicht rÃ¼ckgÃ¤ngig gemacht werden.'
                      : 'Diese Aktion kann nicht rÃ¼ckgÃ¤ngig gemacht werden.';
                  })()}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleting}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  'border border-border/60 surface-premium text-foreground hover:bg-muted'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 animate-spin" /> LÃ¶scheâ€¦
                  </>
                ) : (
                  <>
                    <Icon name="trash-2" className="w-4 h-4" /> LÃ¶schen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle assignment modal */}
      {assignStation && (
        <div
          className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeAssign}
        >
          <div
            className={`w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl ${
              'surface-premium border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`flex items-start justify-between px-5 py-4 border-b ${
                'border-border'
              }`}
            >
              <div className="min-w-0">
                <h3 className={`text-base font-semibold flex items-center gap-2 ${textPrimary}`}>
                  <Icon name="car" className="w-4 h-4 text-status-info" />
                  Fahrzeuge zuweisen
                </h3>
                <p className={`text-[11px] mt-0.5 truncate ${textSecondary}`}>
                  Standort: <span className={`font-medium ${textPrimary}`}>{assignStation.name}</span>
                  {' Â· '}
                  {assignSelected.size} ausgewÃ¤hlt
                  {assignChangeCount > 0 && (
                    <>
                      {' Â· '}
                      <span className="text-status-info font-semibold">{assignChangeCount} Ã„nderung(en)</span>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={closeAssign}
                disabled={assignSaving}
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                  'hover:bg-muted'
                }`}
              >
                <Icon name="x" className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>

            {/* Filter / search bar */}
            <div
              className={`px-5 py-3 border-b flex flex-wrap items-center gap-2 ${
                'border-border'
              }`}
            >
              <div className="relative flex-1 min-w-[220px]">
                <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                <input
                  type="text"
                  placeholder="Suche nach Kennzeichen, Modell, Standortâ€¦"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                    'border-border/70 bg-background text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'
                  } outline-none`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {([
                  { id: 'all', label: 'Alle' },
                  { id: 'this', label: 'Aktuell hier' },
                  { id: 'unassigned', label: 'Ohne Station' },
                  { id: 'other', label: 'Andere Station' },
                ] as const).map((opt) => {
                  const active = assignFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setAssignFilter(opt.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-brand text-brand-foreground border-brand'
                          : 'border border-border/60 surface-premium text-foreground hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3">
              {assignLoading ? (
                <div className={`flex items-center justify-center py-12 ${textSecondary}`}>
                  <Icon name="loader-2" className="w-5 h-5 animate-spin text-status-info mr-2" />
                  <span className="text-xs">Fahrzeuge werden geladenâ€¦</span>
                </div>
              ) : assignError ? (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                    'sq-tone-critical border border-border'
                  }`}
                >
                  <Icon name="alert-circle" className="w-4 h-4" /> {assignError}
                </div>
              ) : assignVehicles.length === 0 ? (
                <div className={`text-center py-10 text-xs ${textSecondary}`}>
                  Keine Fahrzeuge in dieser Organisation registriert.
                </div>
              ) : assignFiltered.length === 0 ? (
                <div className={`text-center py-10 text-xs ${textSecondary}`}>
                  Keine Treffer fÃ¼r die gewÃ¤hlten Filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {assignFiltered.map((v) => {
                    const checked = assignSelected.has(v.id);
                    const wasHere = v.stationId === assignStation.id;
                    const willMove =
                      checked && v.stationId !== null && v.stationId !== assignStation.id;
                    const willDetach = !checked && wasHere;
                    // Live geofence check â€” true â‡¢ vehicle's last GPS fix is
                    // inside this station's radius. Only useful when the
                    // station has lat/lng + radius configured.
                    const atHome = isVehicleAtHomeStation(v, assignStation);
                    return (
                      <label
                        key={v.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[color:var(--brand-soft)] border-[color:var(--brand)]/40'
                            : 'surface-premium border-border hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignVehicle(v.id)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          'bg-muted'
                        }`}>
                          <Icon name="car" className={`w-3.5 h-3.5 ${textSecondary}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold tabular-nums ${textPrimary}`}>
                              {v.license || 'â€”'}
                            </span>
                            <span className={`text-[11px] truncate ${textSecondary}`}>
                              {[v.make, v.model].filter(Boolean).join(' ')}
                              {v.year ? ` Â· ${v.year}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[10px]">
                            <span className={textSecondary}>Aktuell:</span>
                            {v.stationId === null ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-watch"
                              >
                                ohne Station
                              </span>
                            ) : v.stationId === assignStation.id ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-success"
                              >
                                <Icon name="check-circle" className="w-2.5 h-2.5" />
                                {assignStation.name}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-neutral"
                              >
                                <Icon name="map-pin" className="w-2.5 h-2.5" />
                                {v.stationName ?? 'Andere'}
                              </span>
                            )}
                            {atHome === true && (
                              <span
                                title={`GPS-Position im ${assignStation.radiusMeters}m-Radius dieser Station`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-brand"
                              >
                                <Icon name="crosshair" className="w-2.5 h-2.5" />
                                vor Ort
                              </span>
                            )}
                          </div>
                        </div>
                        {willMove && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              'sq-tone-brand'
                            }`}
                          >
                            Wird verschoben
                          </span>
                        )}
                        {willDetach && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              'sq-tone-watch'
                            }`}
                          >
                            Wird entfernt
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`flex items-center justify-between gap-2 px-5 py-3 border-t ${
                'border-border'
              }`}
            >
              <span className={`text-[11px] ${textSecondary}`}>
                {assignChangeCount === 0
                  ? 'Keine ausstehenden Ã„nderungen'
                  : `${assignChangeCount} ausstehende Ã„nderung(en)`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeAssign}
                  disabled={assignSaving}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                    'border border-border/60 surface-premium text-foreground hover:bg-muted'
                  }`}
                >
                  Abbrechen
                </button>
                <button
                  onClick={submitAssign}
                  disabled={assignSaving || assignLoading || assignChangeCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-brand-foreground rounded-lg text-xs font-semibold hover:bg-brand-hover transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assignSaving ? (
                    <>
                      <Icon name="loader-2" className="w-4 h-4 animate-spin" /> Speichereâ€¦
                    </>
                  ) : (
                    <>
                      <Icon name="save" className="w-4 h-4" /> Zuweisung speichern
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StationStatPill({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'brand' | 'success' | 'warning' | 'critical' | 'neutral';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === 'brand'
      ? 'sq-tone-brand'
      : tone === 'success'
        ? 'sq-tone-success'
        : tone === 'warning'
          ? 'sq-tone-warning'
          : tone === 'critical'
            ? 'sq-tone-critical'
            : 'sq-tone-neutral';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-3 text-left transition-all duration-200 ${toneClass} ${
        active
          ? 'shadow-[inset_0_0_0_1px_currentColor,0_6px_14px_rgba(15,23,42,0.12)]'
          : 'opacity-80 hover:opacity-100 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3 w-full">
        <div>
          <div className="text-[18px] leading-none font-bold tabular-nums">
            {value}
          </div>
          <div className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">
            {label}
          </div>
        </div>
        <div className="shrink-0 opacity-80">
          {icon}
        </div>
      </div>
    </button>
  );
}

function StationCard({
  station,
  onEdit,
  onDelete,
  onToggleStatus,
  onAssign,
  toggling,
}: {
  station: import('../../lib/api').Station;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onAssign: () => void;
  toggling: boolean;
}) {
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';

  const isActive = station.status === 'ACTIVE';
  const addressLine = [station.address, station.postalCode, station.city]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="rounded-xl p-4 border border-border/60 surface-premium hover:bg-muted/40 hover:border-border transition-all duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: identity */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-3 rounded-lg shrink-0 sq-tone-brand">
            <Icon name="map-pin" className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-semibold truncate ${textPrimary}`}>{station.name}</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? 'sq-tone-success'
                    : 'sq-tone-neutral'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                  }`}
                />
                {isActive ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
            {addressLine && (
              <p className={`text-xs mt-0.5 truncate ${textSecondary}`}>{addressLine}</p>
            )}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
              {station.openingHours && (
                <span className={`text-[11px] flex items-center gap-1 ${textSecondary}`}>
                  <Icon name="clock" className="w-3 h-3" />{' '}
                  {typeof station.openingHours === 'string'
                    ? station.openingHours
                    : String(station.openingHours)}
                </span>
              )}
              {station.radiusMeters != null && (
                <span
                  title={
                    station.latitude != null && station.longitude != null
                      ? `Fahrzeuge innerhalb von ${station.radiusMeters} m gelten als â€žvor Ort"`
                      : 'Umkreis konfiguriert â€” wirkt erst, wenn die Station Koordinaten hat.'
                  }
                  className={`text-[11px] flex items-center gap-1 ${
                    station.latitude != null && station.longitude != null
                      ? textSecondary
                      : 'text-[color:var(--status-attention)]'
                  }`}
                >
                  <Icon name="crosshair" className="w-3 h-3" />
                  Umkreis{' '}
                  <span className="font-semibold tabular-nums">
                    {station.radiusMeters >= 1000
                      ? `${(station.radiusMeters / 1000).toFixed(station.radiusMeters % 1000 === 0 ? 0 : 1)} km`
                      : `${station.radiusMeters} m`}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Middle: contact + vehicles */}
        <div className="flex flex-wrap items-center gap-4 lg:gap-5">
          <div className="flex flex-col">
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
              Fahrzeuge
            </span>
            <span className={`text-sm font-bold ${textPrimary}`}>{station.vehicleCount}</span>
          </div>
          {station.managerName && (
            <div className="flex flex-col min-w-0 max-w-[180px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                Manager
              </span>
              <span className={`text-xs truncate ${textPrimary}`}>{station.managerName}</span>
            </div>
          )}
          {station.phone && (
            <div className="flex flex-col min-w-0 max-w-[160px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                Telefon
              </span>
              <a
                href={`tel:${station.phone}`}
                className={`text-xs hover:underline truncate ${textPrimary}`}
              >
                {station.phone}
              </a>
            </div>
          )}
          {station.email && (
            <div className="flex flex-col min-w-0 max-w-[200px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                E-Mail
              </span>
              <a
                href={`mailto:${station.email}`}
                className={`text-xs hover:underline truncate ${textPrimary}`}
              >
                {station.email}
              </a>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAssign}
            title="Fahrzeuge zu diesem Standort zuweisen"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors mr-1 sq-tone-brand hover:opacity-90"
          >
            <Icon name="car" className="w-3.5 h-3.5" /> Fahrzeuge zuweisen
          </button>
          <button
            onClick={onToggleStatus}
            disabled={toggling}
            title={isActive ? 'Deaktivieren' : 'Aktivieren'}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:bg-muted"
          >
            {toggling ? (
              <Icon name="loader-2" className={`w-4 h-4 animate-spin ${textSecondary}`} />
            ) : isActive ? (
              <Icon name="toggle-right" className={`w-5 h-5 text-emerald-500`} />
            ) : (
              <Icon name="toggle-left" className={`w-5 h-5 ${textSecondary}`} />
            )}
          </button>
          <button
            onClick={onEdit}
            title="Bearbeiten"
            className="p-2 rounded-lg transition-colors hover:bg-muted"
          >
            <Icon name="edit-3" className={`w-4 h-4 ${textSecondary}`} />
          </button>
          <button
            onClick={onDelete}
            title="LÃ¶schen"
            className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors"
          >
            <Icon name="trash-2" className={`w-4 h-4 ${textSecondary}`} />
          </button>
        </div>
      </div>

      {station.notes && (
        <p
          className={`text-[11px] mt-3 pt-3 border-t italic ${
            'border-border/50 text-muted-foreground'
          }`}
        >
          {station.notes}
        </p>
      )}
    </div>
  );
}

function formatLastActive(iso: string | null): string {
  if (!iso) return 'â€“';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);
  if (diffMin < 1) return 'Jetzt online';
  if (diffMin < 60) return `Vor ${diffMin} Min`;
  if (diffH < 24) return `Vor ${diffH}h`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return `Vor ${Math.floor(diffDays / 7)} Woche(n)`;
}

// UsersRolesTab is now imported from './UsersRolesTab'

// ============================================
// MAIN SETTINGS VIEW
// ============================================
export function SettingsView({
  activeTab: controlledTab = 'company',
  onTabChange,
  onNavigateToStations,
}: SettingsViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { t } = useLanguage();
  const activeTab = controlledTab;
  const canWriteDataAuth = hasPermission('data-authorization', 'write');
  const canManageDataAuth = hasPermission('data-authorization', 'manage');
  const canWriteRentalRules = hasPermission('company-info', 'write');
  const bridgeDark = useDocumentDark();

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <header className="space-y-3">
        <PageHeader title={t('nav.administration')} />
        {onTabChange ? (
          <AdministrationTabBar activeTab={activeTab} onTabChange={onTabChange} />
        ) : null}
      </header>

      {activeTab === 'account' && (
        <AdministrationTabPanel tab="account" activeTab={activeTab}>
          <AccountInformationTab onNavigateToUsers={() => onTabChange?.('users')} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'company' && (
        <AdministrationTabPanel tab="company" activeTab={activeTab}>
          <CompanyInformationTab
            onNavigateToLegalDocuments={() => onTabChange?.('legal-documents')}
            onNavigateToStations={onNavigateToStations}
          />
        </AdministrationTabPanel>
      )}
      {activeTab === 'users' && (
        <AdministrationTabPanel tab="users" activeTab={activeTab}>
          <UsersRolesTab orgId={orgId} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'billing' && (
        <AdministrationTabPanel tab="billing" activeTab={activeTab}>
          <BillingTab />
        </AdministrationTabPanel>
      )}
      {activeTab === 'data-authorization' && (
        <AdministrationTabPanel tab="data-authorization" activeTab={activeTab}>
          <DataAuthorizationTab canWrite={canWriteDataAuth} canManage={canManageDataAuth} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'legal-documents' && (
        <AdministrationTabPanel tab="legal-documents" activeTab={activeTab}>
          <LegalDocumentsTab isDarkMode={bridgeDark} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'email-versand' && (
        <AdministrationTabPanel tab="email-versand" activeTab={activeTab}>
          <EmailVersandTab isDarkMode={bridgeDark} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'rental-rules' && (
        <AdministrationTabPanel tab="rental-rules" activeTab={activeTab}>
          <RentalRulesTab canWrite={canWriteRentalRules} />
        </AdministrationTabPanel>
      )}
    </div>
  );
}
