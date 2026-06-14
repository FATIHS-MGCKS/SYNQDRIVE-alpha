
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import type { VehicleExteriorEffectiveImageDto, VehicleExteriorViewKey } from '../../lib/api';

interface DamagesViewProps {
  isDarkMode: boolean;
  vehicleId?: string;
}

type DamageFilter = 'total' | 'active' | 'solved';

// V4.7.50 — five canonical exterior views for the damage-map carousel.
// Front is the entry view; users can cycle left/right or jump via the
// inline tabs. Each view renders the effective photo from Master-Admin:
// vehicle override first, model template fallback second, otherwise a
// neutral SVG blueprint of that view.
const DAMAGE_MAP_VIEWS: { key: VehicleExteriorViewKey; label: string; iconName: string }[] = [
  { key: 'FRONT', label: 'Front', iconName: 'arrow-up' },
  { key: 'LEFT',  label: 'Left',  iconName: 'arrow-left' },
  { key: 'RIGHT', label: 'Right', iconName: 'arrow-right' },
  { key: 'REAR',  label: 'Rear',  iconName: 'arrow-down' },
  { key: 'ROOF',  label: 'Roof',  iconName: 'square' },
];

export function DamagesView({ isDarkMode, vehicleId }: DamagesViewProps) {
  const [activeTab, setActiveTab] = useState<DamageFilter>('active');
  const [selectedDamages, setSelectedDamages] = useState<string[]>([]);
  const [activeDamages, setActiveDamages] = useState<any[]>([]);
  const [solvedDamages, setSolvedDamages] = useState<any[]>([]);
  // V4.7.50 — damage map carousel
  const [activeView, setActiveView] = useState<VehicleExteriorViewKey>('FRONT');
  const [exteriorImages, setExteriorImages] = useState<Record<string, VehicleExteriorEffectiveImageDto>>({});
  const [exteriorImagesLoading, setExteriorImagesLoading] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.damages(vehicleId)
      .then((res: any) => {
        const all = Array.isArray(res) ? res : res?.data ?? [];
        setActiveDamages(all.filter((d: any) => d.status !== 'REPAIRED').map((d: any) => ({
          id: d.id,
          date: d.reportedAt ? new Date(d.reportedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
          type: d.damageType ?? 'Unknown',
          severity: d.severity ?? 'Minor',
          status: 'Unresolved',
        })));
        setSolvedDamages(all.filter((d: any) => d.status === 'REPAIRED').map((d: any) => ({
          id: d.id,
          date: d.reportedAt ? new Date(d.reportedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
          type: d.damageType ?? 'Unknown',
          severity: d.severity ?? 'Minor',
          status: 'Resolved',
          resolvedDate: d.repairedAt ? new Date(d.repairedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
        })));
      })
      .catch(() => {
        setActiveDamages([]);
        setSolvedDamages([]);
      });
  }, [vehicleId]);

  // V4.7.58 — load effective exterior photos: vehicle override → model fallback
  useEffect(() => {
    if (!vehicleId) {
      setExteriorImages({});
      return;
    }
    let cancelled = false;
    setExteriorImagesLoading(true);
    api.vehicles.exteriorImages
      .listEffective(vehicleId)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, VehicleExteriorEffectiveImageDto> = {};
        response.effective.forEach((r) => { map[r.view] = r; });
        setExteriorImages(map);
      })
      .catch(() => { if (!cancelled) setExteriorImages({}); })
      .finally(() => { if (!cancelled) setExteriorImagesLoading(false); });
    return () => { cancelled = true; };
  }, [vehicleId]);

  const stepView = (delta: 1 | -1) => {
    const idx = DAMAGE_MAP_VIEWS.findIndex(v => v.key === activeView);
    if (idx < 0) return;
    const nextIdx = (idx + delta + DAMAGE_MAP_VIEWS.length) % DAMAGE_MAP_VIEWS.length;
    setActiveView(DAMAGE_MAP_VIEWS[nextIdx].key);
  };
  const activeViewConfig = useMemo(
    () => DAMAGE_MAP_VIEWS.find(v => v.key === activeView) ?? DAMAGE_MAP_VIEWS[0],
    [activeView],
  );
  const activeImage = exteriorImages[activeView] ?? null;
  // Damage pins per view: prefer real coordinates if a damage carries
  // `locationView` + `locationX/Y` (0-100). Otherwise distribute up to 3
  // demonstrative markers across FRONT/LEFT/RIGHT for legacy rows so the
  // carousel never feels empty when there are open damages.
  const pinsForActiveView = useMemo(() => {
    if (!activeDamages.length) return [] as { x: number; y: number; key: string }[];
    const real = activeDamages
      .filter((d: any) => typeof d.locationView === 'string' && d.locationView.toUpperCase() === activeView
        && typeof d.locationX === 'number' && typeof d.locationY === 'number')
      .map((d: any) => ({
        key: d.id,
        x: Math.max(4, Math.min(96, d.locationX as number)),
        y: Math.max(4, Math.min(96, d.locationY as number)),
      }));
    if (real.length) return real;
    if (activeView === 'FRONT' && activeDamages[0]) return [{ key: activeDamages[0].id, x: 72, y: 55 }];
    if (activeView === 'LEFT' && activeDamages[1])  return [{ key: activeDamages[1].id, x: 35, y: 60 }];
    if (activeView === 'RIGHT' && activeDamages[2]) return [{ key: activeDamages[2].id, x: 65, y: 60 }];
    return [];
  }, [activeDamages, activeView]);

  const toggleDamageSelection = (id: string) => {
    setSelectedDamages(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const currentDamages = activeTab === 'total' ? [...activeDamages, ...solvedDamages] : activeTab === 'active' ? activeDamages : solvedDamages;
  const totalDamages = activeDamages.length + solvedDamages.length;
  const canBookAppointment = activeTab !== 'solved' && selectedDamages.length > 0;

  return (
    <div className="space-y-5">
      {/* Repair queue summary */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="sq-tone-critical w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="alert-triangle" className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Damage repair queue</p>
              <p className="text-[11px] mt-0.5 text-muted-foreground">
                Track unresolved vehicle damages and prepare workshop appointments from one focused register.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[300px]">
            <DamageMetric
              label="Total"
              value={totalDamages}
              tone="neutral"
              active={activeTab === 'total'}
              onClick={() => setActiveTab('total')}
            />
            <DamageMetric
              label="Open"
              value={activeDamages.length}
              tone={activeDamages.length > 0 ? 'critical' : 'success'}
              active={activeTab === 'active'}
              onClick={() => setActiveTab('active')}
            />
            <DamageMetric
              label="Resolved"
              value={solvedDamages.length}
              tone="success"
              active={activeTab === 'solved'}
              onClick={() => setActiveTab('solved')}
            />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
        {/* Vehicle Damage Map — V4.7.50 carousel */}
        <div className={`${cardClass} p-4 flex flex-col`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h3 className={`text-[12px] font-semibold tracking-[-0.003em] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Vehicle damage map</h3>
              <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {activeImage
                  ? `Showing the ${activeImage.source === 'model' ? 'model-template' : 'vehicle'} ${activeViewConfig.label.toLowerCase()} photo. Use the arrows or tabs to switch views.`
                  : `No ${activeViewConfig.label.toLowerCase()} photo uploaded yet — showing a neutral blueprint. Upload in Master Admin → Vehicle → Exterior Photos.`}
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
              activeDamages.length > 0
                ? 'sq-tone-warning'
                : 'sq-tone-success'
            }`}>
              <Icon name={activeDamages.length > 0 ? 'alert-triangle' : 'check-circle-2'} className="w-3 h-3" />
              {activeDamages.length > 0 ? `${activeDamages.length} open` : 'Clear'}
            </span>
          </div>

          {/* Carousel viewport */}
          <div className={`relative rounded-xl border overflow-hidden flex items-center justify-center ${
            isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-100'
          }`} style={{ minHeight: 280, aspectRatio: '4 / 3' }}>
            {/* Image or fallback blueprint */}
            {activeImage ? (
              <img
                src={activeImage.imageData}
                alt={`${activeViewConfig.label} view`}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className={`relative w-full h-full flex items-center justify-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <DamageMapBlueprint view={activeView} />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full text-[10px] font-semibold bg-black/40 text-white backdrop-blur-sm">
                  Blueprint fallback
                </div>
              </div>
            )}

            {/* Damage pins overlay */}
            {pinsForActiveView.map(pin => (
              <DamageMarker key={pin.key} leftPercent={pin.x} topPercent={pin.y} />
            ))}

            {/* Prev / Next */}
            <button
              type="button"
              onClick={() => stepView(-1)}
              aria-label="Previous view"
              className={`absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md shadow-md transition-all ${
                isDarkMode ? 'bg-neutral-900/60 text-white hover:bg-neutral-900/80' : 'bg-white/80 text-gray-800 hover:bg-white'
              }`}
            >
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => stepView(1)}
              aria-label="Next view"
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md shadow-md transition-all ${
                isDarkMode ? 'bg-neutral-900/60 text-white hover:bg-neutral-900/80' : 'bg-white/80 text-gray-800 hover:bg-white'
              }`}
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>

            {/* View label badge */}
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-black/45 text-white backdrop-blur-sm">
              <Icon name={activeViewConfig.iconName} className="w-3 h-3" />
              {activeViewConfig.label} view
            </div>

            {/* Loading overlay */}
            {exteriorImagesLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 text-white text-[11px] font-semibold">
                  <span className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                  Loading photos…
                </div>
              </div>
            )}
          </div>

          {/* View tabs */}
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {DAMAGE_MAP_VIEWS.map(v => {
              const has = !!exteriorImages[v.key];
              const isActive = v.key === activeView;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setActiveView(v.key)}
                  aria-pressed={isActive}
                  className={`relative rounded-lg px-2 py-2 text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 ${
                    isActive
                      ? (isDarkMode ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40' : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300/60')
                      : (isDarkMode ? 'bg-neutral-800/60 text-gray-400 hover:bg-neutral-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100')
                  }`}
                >
                  <Icon name={v.iconName} className="w-3.5 h-3.5" />
                  <span>{v.label}</span>
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    has
                      ? 'bg-emerald-500'
                      : (isDarkMode ? 'bg-neutral-600' : 'bg-gray-300')
                  }`} />
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <p className={`mt-2 text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            <Icon name="camera" className="inline-block w-3 h-3 -mt-0.5 mr-1" />
            Photos uploaded by Master Admin in <span className="font-semibold">Vehicle → Exterior Photos</span>. Green dots = uploaded, grey = missing.
          </p>
        </div>

        {/* Damage register */}
        <div className={`${cardClass} p-4 flex flex-col min-w-0`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className={`text-[12px] font-semibold tracking-[-0.003em] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Damage register
              </h3>
              <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {activeTab === 'total'
                  ? 'Review all reported damages across the repair lifecycle.'
                  : activeTab === 'active'
                  ? 'Select open damages to prepare a workshop appointment.'
                  : 'Resolved damages are kept as a read-only service history.'}
              </p>
            </div>
            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
              activeTab === 'total' ? 'sq-tone-neutral' : activeTab === 'active' ? 'sq-tone-critical' : 'sq-tone-success'
            }`}>
              {activeTab === 'total' ? 'All damages' : activeTab === 'active' ? 'Open work' : 'Archive'}
            </span>
          </div>

          <div className="flex-1 min-h-[220px]">
            {currentDamages.length === 0 ? (
              <div className={`h-full min-h-[220px] rounded-xl border border-dashed flex flex-col items-center justify-center text-center px-6 ${
                isDarkMode ? 'border-neutral-700 bg-neutral-800/30' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                  activeTab === 'active' ? 'sq-tone-success' : 'sq-tone-neutral'
                }`}>
                  <Icon name={activeTab === 'active' ? 'check-circle-2' : 'clipboard-check'} className="w-5 h-5" />
                </div>
                <p className="text-[12px] font-semibold text-foreground">
                  {activeTab === 'total' ? 'No damages reported' : activeTab === 'active' ? 'No active damages' : 'No resolved damages yet'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
                  {activeTab === 'total'
                    ? 'This vehicle has no recorded damage history yet.'
                    : activeTab === 'active'
                    ? 'This vehicle is currently clear. New damages will appear here once reported.'
                    : 'Repaired damages will move into this archive once their status is resolved.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentDamages.map((damage) => {
                  const selected = selectedDamages.includes(damage.id);
                  const selectable = damage.status === 'Unresolved' && activeTab !== 'solved';
                  return (
                    <button
                      key={damage.id}
                      type="button"
                      onClick={() => selectable && toggleDamageSelection(damage.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-all group ${
                        selected
                          ? 'border-purple-400 bg-purple-500/10 shadow-sm'
                          : isDarkMode
                            ? 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                      } ${selectable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            damage.status === 'Unresolved' ? 'sq-tone-critical' : 'sq-tone-success'
                          }`}>
                            <Icon name={damage.status === 'Unresolved' ? 'alert-triangle' : 'check-circle-2'} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[12px] font-semibold text-foreground truncate">{damage.type}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                damage.severity === 'Minor'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {damage.severity}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Icon name="calendar" className="w-3 h-3" />
                                Reported {damage.date}
                              </span>
                              {damage.resolvedDate && (
                                <span className="inline-flex items-center gap-1">
                                  <Icon name="check-circle-2" className="w-3 h-3" />
                                  Resolved {damage.resolvedDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {selectable ? (
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${
                            selected
                              ? 'border-purple-500 bg-purple-500'
                              : isDarkMode
                                ? 'border-neutral-600 group-hover:border-purple-400'
                                : 'border-gray-300 group-hover:border-purple-400'
                          }`}>
                            {selected && <span className="w-2 h-2 bg-white rounded-full" />}
                          </span>
                        ) : (
                          <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Appointment CTA */}
          <div className={`mt-4 rounded-xl border p-3 ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${canBookAppointment ? 'sq-tone-brand' : 'sq-tone-neutral'}`}>
                  <Icon name="wrench" className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">Workshop appointment</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeTab !== 'solved'
                      ? selectedDamages.length > 0
                        ? `${selectedDamages.length} damage${selectedDamages.length === 1 ? '' : 's'} selected`
                        : 'Select open damages to enable booking'
                      : 'Switch to open damages to book a repair'}
                  </p>
                </div>
              </div>
              <button
                disabled={!canBookAppointment}
                className="relative px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200 shrink-0 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:shadow-sm"
              >
                Book appointment
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                  {selectedDamages.length}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DamageMetric({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'critical' | 'success';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === 'critical'
      ? 'sq-tone-critical'
      : tone === 'success'
        ? 'sq-tone-success'
        : 'sq-tone-neutral';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-3 py-2 text-left transition-all duration-200 ${toneClass} ${
        active
          ? 'shadow-[inset_0_0_0_1px_currentColor,0_6px_14px_rgba(15,23,42,0.12)]'
          : 'opacity-75 hover:opacity-100 hover:shadow-sm'
      }`}
    >
      <p className="text-[16px] leading-none font-bold tabular-nums">{value}</p>
      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">{label}</p>
    </button>
  );
}

interface DamageMarkerProps {
  /** Optional legacy props (right/top as CSS strings) — kept so older
   *  call-sites continue to work. */
  right?: string;
  top?: string;
  /** Preferred V4.7.50 percent positioning (0-100, relative to viewport). */
  leftPercent?: number;
  topPercent?: number;
}

function DamageMarker({ right, top, leftPercent, topPercent }: DamageMarkerProps) {
  const style: React.CSSProperties = leftPercent != null || topPercent != null
    ? {
        left: leftPercent != null ? `${leftPercent}%` : undefined,
        top: topPercent != null ? `${topPercent}%` : undefined,
        transform: 'translate(-50%, -50%)',
      }
    : { right, top };
  return (
    <div className="absolute z-10" style={style}>
      <div className="relative">
        <span className="absolute inset-0 -m-1 rounded-full bg-red-500/30 animate-ping" />
        <div className="relative w-5 h-5 rounded-full bg-red-500/30 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * V4.7.50 — Neutral SVG blueprint shown inside the damage-map carousel
 * when no vehicle-specific photo has been uploaded for the active view.
 * Each view renders a recognizable outline so the carousel still feels
 * useful and damage pins remain meaningful even before any uploads.
 */
function DamageMapBlueprint({ view }: { view: VehicleExteriorViewKey }) {
  const stroke = 'currentColor';
  if (view === 'FRONT') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4">
        <path d="M40,110 L40,65 Q40,45 55,40 L80,30 Q100,24 120,30 L145,40 Q160,45 160,65 L160,110" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,35 Q100,20 135,35" fill="none" stroke={stroke} strokeWidth="1.4" />
        <path d="M60,42 L70,55 L130,55 L140,42" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M55,75 L145,75 L145,90 L55,90 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <line x1="100" y1="75" x2="100" y2="90" stroke={stroke} strokeWidth="0.7" />
        <ellipse cx="50" cy="75" rx="8" ry="12" fill="none" stroke={stroke} strokeWidth="1.1" />
        <ellipse cx="150" cy="75" rx="8" ry="12" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M45,95 L155,95 L155,108 Q100,112 45,108 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
      </svg>
    );
  }
  if (view === 'REAR') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4">
        <path d="M40,110 L40,65 Q40,45 55,40 L80,32 Q100,26 120,32 L145,40 Q160,45 160,65 L160,110" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,37 Q100,22 135,37" fill="none" stroke={stroke} strokeWidth="1.4" />
        <path d="M62,44 L72,58 L128,58 L138,44" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="42" y="68" width="14" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="144" y="68" width="14" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M60,65 L140,65 L140,90 L60,90 Z" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="75" y="92" width="50" height="12" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="65" cy="110" rx="6" ry="4" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="135" cy="110" rx="6" ry="4" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
      </svg>
    );
  }
  if (view === 'ROOF') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4">
        <path d="M60,15 Q100,8 140,15 L150,35 Q155,70 150,105 L140,125 Q100,132 60,125 L50,105 Q45,70 50,35 Z" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,38 Q100,32 135,38 L130,50 Q100,47 70,50 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M70,95 Q100,92 130,95 L135,108 Q100,112 65,108 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M70,50 Q100,47 130,50 L130,95 Q100,92 70,95 Z" fill="none" stroke={stroke} strokeWidth="0.7" />
        <ellipse cx="45" cy="42" rx="5" ry="3" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="155" cy="42" rx="5" ry="3" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="42" y="28" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="150" y="28" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="42" y="95" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="150" y="95" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <line x1="100" y1="15" x2="100" y2="125" stroke={stroke} strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
      </svg>
    );
  }
  // LEFT or RIGHT — same side profile, RIGHT renders mirrored via CSS
  const sideOutline = (
    <svg viewBox="0 0 320 140" className="w-3/4 h-3/4">
      <path d="M40,95 L40,75 Q40,65 50,62 L95,52 Q110,48 120,38 L180,28 Q195,26 210,28 L250,35 Q270,40 280,55 L285,70 Q290,75 290,80 L290,95" fill="none" stroke={stroke} strokeWidth="1.6" />
      <path d="M120,38 Q150,25 180,28" fill="none" stroke={stroke} strokeWidth="1.4" />
      <line x1="55" y1="95" x2="245" y2="95" stroke={stroke} strokeWidth="1.6" />
      <path d="M125,40 L135,52 L195,52 L210,35 Q200,30 185,30 L140,33 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
      <path d="M100,55 L125,40 L135,52 L100,55 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
      <circle cx="90" cy="95" r="22" fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx="90" cy="95" r="14" fill="none" stroke={stroke} strokeWidth="0.9" />
      <circle cx="90" cy="95" r="4" fill={stroke} opacity="0.3" />
      <circle cx="235" cy="95" r="22" fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx="235" cy="95" r="14" fill="none" stroke={stroke} strokeWidth="0.9" />
      <circle cx="235" cy="95" r="4" fill={stroke} opacity="0.3" />
      <line x1="140" y1="52" x2="140" y2="90" stroke={stroke} strokeWidth="0.9" />
      <line x1="190" y1="52" x2="190" y2="90" stroke={stroke} strokeWidth="0.9" />
      <ellipse cx="50" cy="72" rx="8" ry="5" fill="none" stroke={stroke} strokeWidth="1.1" />
      <ellipse cx="283" cy="72" rx="5" ry="8" fill="none" stroke={stroke} strokeWidth="1.1" />
      <line x1="155" y1="65" x2="165" y2="65" stroke={stroke} strokeWidth="1.4" />
    </svg>
  );
  return (
    <div className={view === 'RIGHT' ? 'w-full h-full flex items-center justify-center scale-x-[-1]' : 'w-full h-full flex items-center justify-center'}>
      {sideOutline}
    </div>
  );
}