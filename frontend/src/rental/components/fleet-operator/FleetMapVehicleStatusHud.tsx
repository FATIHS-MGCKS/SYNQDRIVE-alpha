import { LiquidGlassLens } from '../../../components/surface';
import { StatusChip } from '../../../components/patterns';
import type { FleetVehicleContext } from '../../lib/fleet-operator-panel';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';

export interface FleetMapVehicleStatusHudProps {
  ctx: FleetVehicleContext | null;
  locale?: string;
  timeZone?: string;
}

export function FleetMapVehicleStatusHud({
  ctx,
  locale = 'de',
  timeZone,
}: FleetMapVehicleStatusHudProps) {
  if (!ctx) return null;

  const display = resolveFleetVehicleDisplayState(ctx.vehicle, {
    rentalHealth: ctx.health,
    visual: ctx.visual,
    locale,
    timeZone,
    compact: true,
  });

  const { statusBadge, bookingSupplement } = display;
  const supplementText =
    bookingSupplement?.short ?? statusBadge.dataQualityHint ?? null;
  const supplementTitle =
    bookingSupplement?.detail ?? statusBadge.dataQualityHint ?? undefined;

  return (
    <div className="pointer-events-none absolute bottom-11 left-1/2 z-10 w-[min(100%-2rem,320px)] -translate-x-1/2 sm:bottom-12">
      <LiquidGlassLens
        variant="fleetMiniPill"
        renderMode="shell"
        intensity="medium"
        className="pointer-events-auto"
      >
        <div className="px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-semibold text-foreground">
              {ctx.vehicle.license}
            </p>
            <StatusChip
              tone={statusBadge.tone}
              className="shrink-0 px-1.5 py-0.5 text-[9.5px] font-semibold"
              title={bookingSupplement?.detail ?? statusBadge.dataQualityHint ?? statusBadge.label}
            >
              {statusBadge.label}
            </StatusChip>
          </div>
          {supplementText ? (
            <p
              className="mt-1 truncate text-[10px] text-muted-foreground"
              title={supplementTitle}
            >
              {supplementText}
            </p>
          ) : null}
        </div>
      </LiquidGlassLens>
    </div>
  );
}
