import { AlertTriangle } from 'lucide-react';
import type { OperatorTirePlausibilityWarning, OperatorTireTreadForm } from './operatorTireMeasure.types';
import { TREAD_MAX_MM, TREAD_MIN_MM } from './operatorTireMeasure.utils';

const WHEELS: { key: keyof OperatorTireTreadForm; short: string; long: string }[] = [
  { key: 'fl', short: 'VL', long: 'Vorne links' },
  { key: 'fr', short: 'VR', long: 'Vorne rechts' },
  { key: 'rl', short: 'HL', long: 'Hinten links' },
  { key: 'rr', short: 'HR', long: 'Hinten rechts' },
];

interface Props {
  tread: OperatorTireTreadForm;
  onChange: (tread: OperatorTireTreadForm) => void;
  warnings: OperatorTirePlausibilityWarning[];
}

export function OperatorTireMeasureTreadGrid({ tread, onChange, warnings }: Props) {
  const set = (key: keyof OperatorTireTreadForm, value: string) => {
    onChange({ ...tread, [key]: value });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Profiltiefe in mm — Dezimalwerte erlaubt (z. B. 5,8). Mindestens ein Reifen erforderlich.
      </p>

      <div className="relative mx-auto max-w-md rounded-3xl border border-border/60 bg-muted/20 px-4 py-6">
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-border/40" />
        <div className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-px -translate-x-1/2 bg-border/40" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-border/50 bg-background/40" />

        <div className="relative grid grid-cols-2 gap-x-6 gap-y-10">
          {WHEELS.map(({ key, short, long }) => (
            <label key={key} className="block">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums text-foreground">{short}</span>
                <span className="text-[10px] font-medium text-muted-foreground">{long}</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                autoComplete="off"
                className="h-14 min-h-[56px] w-full rounded-2xl border border-border surface-premium px-4 text-center text-xl font-semibold tabular-nums shadow-sm"
                value={tread[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder="—"
                aria-label={`${long} Profiltiefe in Millimeter`}
                aria-describedby={`tire-${key}-unit`}
              />
              <p id={`tire-${key}-unit`} className="mt-1 text-center text-[10px] font-semibold text-muted-foreground">
                mm
              </p>
            </label>
          ))}
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Plausibilität: {TREAD_MIN_MM}–{TREAD_MAX_MM} mm (Backend-Grenzen)
      </p>

      {warnings.length > 0 && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plausibilitätshinweise
          </p>
          {warnings.map((w) => (
            <div
              key={w.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
