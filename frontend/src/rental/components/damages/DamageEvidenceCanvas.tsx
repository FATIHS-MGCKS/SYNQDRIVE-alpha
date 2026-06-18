import { useMemo, useRef, useState } from 'react';
import type { VehicleExteriorEffectiveImageDto } from '../../../lib/api';
import type { VehicleExteriorViewKey } from '../../../lib/api';
import { DataCard } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { DamageResponse, HeatmapCell } from '../../lib/damage.types';
import { formatDamageType, hasValidMapPin, isActiveDamage } from '../../lib/damage.types';
import {
  DAMAGE_MAP_VIEWS,
  imageSourceLabel,
  pinVariantForDamage,
  PIN_VARIANT_CLASS,
  type PinVisualVariant,
} from './damage-control.utils';
import { DamageMapBlueprint } from './DamageMapBlueprint';
import { DamageHeatmapOverlay } from './DamageHeatmapOverlay';

interface DamageEvidenceCanvasProps {
  vehicleId: string;
  activeView: VehicleExteriorViewKey;
  onViewChange: (view: VehicleExteriorViewKey) => void;
  exteriorImages: Record<string, VehicleExteriorEffectiveImageDto>;
  exteriorLoading: boolean;
  damages: DamageResponse[];
  selectedDamageId: string | null;
  placingDamageId: string | null;
  onSelectDamage: (damage: DamageResponse) => void;
  onPlaceClick: (damageId: string) => void;
  onCanvasPlace?: (damageId: string, x: number, y: number, view: VehicleExteriorViewKey) => void;
  onCancelPlace?: () => void;
  placeBusy?: boolean;
  heatmapCells?: HeatmapCell[];
}

export function DamageEvidenceCanvas({
  activeView,
  onViewChange,
  exteriorImages,
  exteriorLoading,
  damages,
  selectedDamageId,
  placingDamageId,
  onSelectDamage,
  onPlaceClick,
  onCanvasPlace,
  onCancelPlace,
  placeBusy,
  heatmapCells = [],
}: DamageEvidenceCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeImage = exteriorImages[activeView] ?? null;
  const viewConfig = DAMAGE_MAP_VIEWS.find((v) => v.key === activeView) ?? DAMAGE_MAP_VIEWS[0];

  const imageSource = activeImage
    ? activeImage.source === 'model'
      ? 'model'
      : 'vehicle'
    : 'blueprint';

  const pins = useMemo(
    () =>
      damages
        .filter(
          (d) =>
            hasValidMapPin(d) &&
            d.locationView.toUpperCase() === activeView,
        )
        .map((d) => ({
          damage: d,
          x: Math.max(4, Math.min(96, d.locationX as number)),
          y: Math.max(4, Math.min(96, d.locationY as number)),
          variant: pinVariantForDamage(d),
        })),
    [damages, activeView],
  );

  const unplacedActive = useMemo(
    () => damages.filter((d) => isActiveDamage(d) && !hasValidMapPin(d)),
    [damages],
  );

  const stepView = (delta: 1 | -1) => {
    const idx = DAMAGE_MAP_VIEWS.findIndex((v) => v.key === activeView);
    const next = (idx + delta + DAMAGE_MAP_VIEWS.length) % DAMAGE_MAP_VIEWS.length;
    onViewChange(DAMAGE_MAP_VIEWS[next].key as VehicleExteriorViewKey);
  };

  const canPlaceOnView = !!activeImage && !exteriorLoading;

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingDamageId || !onCanvasPlace || !canvasRef.current || !canPlaceOnView || placeBusy) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onCanvasPlace(
      placingDamageId,
      Math.max(0, Math.min(100, x)),
      Math.max(0, Math.min(100, y)),
      activeView,
    );
  };

  return (
    <DataCard
      title="Evidence canvas"
      description="Vehicle views with positioned damage evidence. Pins reflect rental impact and repair status."
      actions={
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral border border-border/60 backdrop-blur-sm">
          <Icon name="image" className="w-3 h-3" />
          {imageSourceLabel(imageSource)}
        </span>
      }
      bodyClassName="p-0"
      flush
    >
      <div className="p-4 space-y-3">
        {placingDamageId && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground">
              {canPlaceOnView
                ? `Click on the ${viewConfig.label.toLowerCase()} photo to place this damage.`
                : `Upload a ${viewConfig.label.toLowerCase()} vehicle photo before placing (blueprint only).`}
            </p>
            <button
              type="button"
              onClick={onCancelPlace}
              disabled={placeBusy}
              className="sq-press text-[10px] font-semibold px-2 py-1 rounded-lg border border-border/70 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        <div
          ref={canvasRef}
          role={placingDamageId ? 'button' : undefined}
          tabIndex={placingDamageId ? 0 : undefined}
          onClick={handleCanvasClick}
          onKeyDown={(e) => {
            if (placingDamageId && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
            }
          }}
          className={`relative rounded-xl border overflow-hidden flex items-center justify-center bg-muted/30 border-border/70 ${
            placingDamageId && canPlaceOnView ? 'cursor-crosshair ring-2 ring-sky-500/40' : ''
          } ${placingDamageId && !canPlaceOnView ? 'ring-2 ring-amber-500/30' : ''}`}
          style={{ minHeight: 300, aspectRatio: '4 / 3' }}
        >
          {activeImage ? (
            <img
              src={activeImage.imageData}
              alt={`${viewConfig.label} view`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center text-muted-foreground">
              <DamageMapBlueprint view={activeView} />
            </div>
          )}

          {heatmapCells.length > 0 && <DamageHeatmapOverlay cells={heatmapCells} />}

          {pins.map(({ damage, x, y, variant }) => (
            <DamageMapPin
              key={damage.id}
              damage={damage}
              leftPercent={x}
              topPercent={y}
              variant={variant}
              selected={selectedDamageId === damage.id}
              hovered={hoveredId === damage.id}
              showPreview={hoveredId === damage.id || selectedDamageId === damage.id}
              onHover={(on) => setHoveredId(on ? damage.id : null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDamage(damage);
              }}
            />
          ))}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stepView(-1);
            }}
            aria-label="Previous view"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 bg-black/35 text-white hover:bg-black/50 transition-transform active:scale-95"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stepView(1);
            }}
            aria-label="Next view"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 bg-black/35 text-white hover:bg-black/50 transition-transform active:scale-95"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>

          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-black/45 text-white backdrop-blur-sm border border-white/10">
            <Icon name={viewConfig.iconName} className="w-3 h-3" />
            {viewConfig.label}
            {pins.length > 0 && <span className="opacity-80">· {pins.length}</span>}
          </div>

          {exteriorLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 text-white text-[11px] font-semibold">
                <span className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                Loading photos
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {DAMAGE_MAP_VIEWS.map((v) => {
            const has = !!exteriorImages[v.key];
            const isActive = v.key === activeView;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => onViewChange(v.key as VehicleExteriorViewKey)}
                aria-pressed={isActive}
                className={`relative rounded-lg px-2 py-2 text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 sq-press ${
                  isActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon name={v.iconName} className="w-3.5 h-3.5" />
                <span>{v.label}</span>
                <span
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    has ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {unplacedActive.length > 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-foreground">
              Unplaced damages ({unplacedActive.length})
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Open damages without a map position. Place them to appear on the canvas.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unplacedActive.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onPlaceClick(d.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold sq-press transition-colors ${
                    placingDamageId === d.id ? 'sq-tone-brand' : 'sq-tone-warning'
                  }`}
                >
                  <Icon name="map-pin" className="w-3 h-3" />
                  {formatDamageType(d.damageType)}
                  <span className="opacity-70">· Place</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          damages.some(isActiveDamage) && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Icon name="check-circle-2" className="w-3 h-3 text-emerald-500" />
              All open damages are positioned on the map.
            </p>
          )
        )}
      </div>
    </DataCard>
  );
}

function DamageMapPin({
  damage,
  leftPercent,
  topPercent,
  variant,
  selected,
  hovered,
  showPreview,
  onHover,
  onClick,
}: {
  damage: DamageResponse;
  leftPercent: number;
  topPercent: number;
  variant: PinVisualVariant;
  selected: boolean;
  hovered: boolean;
  showPreview: boolean;
  onHover: (on: boolean) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const pulse = selected || hovered;
  const colorClass = PIN_VARIANT_CLASS[variant];

  return (
    <div
      className="absolute z-10"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transform: 'translate(-50%, -50%)',
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button
        type="button"
        aria-label={`Damage ${formatDamageType(damage.damageType)}`}
        onClick={onClick}
        className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
      >
        {pulse && (
          <span className={`absolute inset-0 -m-1.5 rounded-full opacity-40 animate-ping ${colorClass.split(' ')[0]}`} />
        )}
        <div
          className={`relative w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-md transition-transform ${
            selected ? 'scale-125' : hovered ? 'scale-110' : ''
          } ${colorClass}`}
        >
          <div className="w-2 h-2 rounded-full bg-white/90" />
        </div>
        {damage.evidenceStatus === 'MISSING' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-white" />
        )}
      </button>
      {showPreview && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-max max-w-[180px] rounded-lg border border-border/80 bg-card/95 backdrop-blur-md px-2.5 py-1.5 shadow-lg pointer-events-none">
          <p className="text-[10px] font-semibold text-foreground truncate">
            {formatDamageType(damage.damageType)}
          </p>
          <p className="text-[9px] text-muted-foreground capitalize">
            {damage.rentalImpact.replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>
      )}
    </div>
  );
}
