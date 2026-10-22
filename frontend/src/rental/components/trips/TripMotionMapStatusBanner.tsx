import type { TripMotionMapPayload } from './motion-map.types';
import { isMotionMapActive } from './motion-map.utils';

export function TripMotionMapStatusBanner({
  payload,
  loading,
  error,
}: {
  payload: TripMotionMapPayload | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        S4 Motion wird geladen…
      </div>
    );
  }
  if (error) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 backdrop-blur-sm">
        Motion-Auswertung konnte nicht geladen werden.
      </div>
    );
  }
  if (!payload) return null;
  if (isMotionMapActive(payload)) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-brand/25 bg-background/90 px-2.5 py-1.5 text-[10px] text-foreground backdrop-blur-sm">
        <span className="font-semibold text-brand">{payload.previewLabel}</span>
        {payload.status === 'SUCCEEDED_EMPTY' && (
          <span className="mt-0.5 block text-muted-foreground">Auswertung ohne Ereignisse</span>
        )}
        {payload.geometryNote && (
          <span className="mt-0.5 block text-muted-foreground">{payload.geometryNote}</span>
        )}
      </div>
    );
  }
  if (payload.status === 'PENDING') {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        Motion-Auswertung läuft…
      </div>
    );
  }
  if (payload.status === 'FAILED') {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-700 dark:text-red-300 backdrop-blur-sm">
        Motion-Auswertung fehlgeschlagen
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/40 bg-background/80 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      Keine Motion-Auswertung für diese Fahrt
    </div>
  );
}
