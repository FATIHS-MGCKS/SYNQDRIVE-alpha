import { Disc3, Gauge, Fuel } from 'lucide-react';
import type { HandoverDialogBookingInfo, HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import {
  operatorFieldClass,
  operatorTextareaClass,
  OperatorHandoverField,
  OperatorToggleRow,
} from './operatorHandoverUi';
import { OperatorHandoverTechnicalObservationsSection } from './OperatorHandoverTechnicalObservationsSection';

interface Props {
  kind: HandoverDialogKind;
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
  onTireMeasure?: () => void;
  tireMeasureHint?: string;
}

export function OperatorHandoverStepCondition({
  kind,
  booking,
  form,
  onTireMeasure,
  tireMeasureHint,
}: Props) {
  const fuelLabel = form.state.fuelFull ? 'Voll' : `${form.state.fuelPercent}%`;
  const odometerError =
    kind === 'RETURN' &&
    booking.pickupOdometerKm != null &&
    form.state.odometerKm &&
    Number(form.state.odometerKm) < booking.pickupOdometerKm
      ? `Mindestens ${booking.pickupOdometerKm.toLocaleString('de-DE')} km (Pickup)`
      : undefined;

  return (
    <div className="space-y-4">
      <OperatorHandoverField label="Kilometerstand *" error={odometerError}>
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <input
            type="number"
            inputMode="numeric"
            value={form.state.odometerKm}
            onChange={(e) => form.patchState({ odometerKm: e.target.value })}
            placeholder="z. B. 48500"
            className={operatorFieldClass}
          />
          <span className="text-sm font-semibold text-muted-foreground">km</span>
        </div>
        {kind === 'RETURN' && booking.pickupOdometerKm != null && (
          <p className="text-[11px] text-muted-foreground">
            Pickup: {booking.pickupOdometerKm.toLocaleString('de-DE')} km
          </p>
        )}
        {form.telemetryPrefill.odometerFromTelemetry && (
          <p className="text-[11px] text-muted-foreground">
            Automatisch aus aktueller Fahrzeugtelemetrie übernommen — bei Abweichung anpassbar.
          </p>
        )}
      </OperatorHandoverField>

      <div className="rounded-2xl border border-border/60 surface-premium p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Fuel className="h-4 w-4" />
            Tank / SoC *
          </span>
          <span className="text-sm font-bold tabular-nums">{fuelLabel}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={form.state.fuelPercent}
          onChange={(e) => {
            const v = Number(e.target.value);
            form.patchState({ fuelPercent: v, fuelFull: v >= 98 });
          }}
          className="w-full accent-[color:var(--brand)]"
        />
        <OperatorToggleRow
          label="Tank voll / vollständig geladen"
          checked={form.state.fuelFull}
          onChange={() =>
            form.patchState({
              fuelFull: !form.state.fuelFull,
              fuelPercent: !form.state.fuelFull ? 100 : form.state.fuelPercent,
            })
          }
        />
        {form.telemetryPrefill.fuelFromTelemetry && (
          <p className="text-[11px] text-muted-foreground">
            Tank / SoC aus aktueller Fahrzeugtelemetrie übernommen.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fahrzeugkontrolle
        </p>
        <OperatorToggleRow
          label="Außen sauber"
          checked={form.state.checks.exteriorClean}
          onChange={() => form.toggleCheck('exteriorClean')}
        />
        <OperatorToggleRow
          label="Innen sauber"
          checked={form.state.checks.interiorClean}
          onChange={() => form.toggleCheck('interiorClean')}
        />
        <OperatorToggleRow
          label="Reifen saisonal okay"
          checked={form.state.checks.tiresSeasonOk}
          onChange={() => form.toggleCheck('tiresSeasonOk')}
        />
        <OperatorToggleRow
          label="Warnleuchten aktiv"
          checked={form.state.checks.warningLightsOn}
          onChange={() => form.toggleCheck('warningLightsOn')}
          danger
        />
      </div>

      {form.state.checks.warningLightsOn && (
        <OperatorHandoverField label="Warnleuchten — Beschreibung *">
          <textarea
            value={form.state.warningLightsNotes}
            onChange={(e) => form.patchState({ warningLightsNotes: e.target.value })}
            placeholder="Welche Warnleuchten / Meldungen?"
            className={operatorTextareaClass}
          />
        </OperatorHandoverField>
      )}

      {(kind === 'RETURN' || !form.state.checks.tiresSeasonOk) && onTireMeasure && (
        <button
          type="button"
          onClick={onTireMeasure}
          className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border surface-premium px-4 text-left"
        >
          <Disc3 className="h-5 w-5 text-muted-foreground" />
          <span>
            <span className="block text-sm font-semibold">Reifenprofil messen</span>
            <span className="text-[11px] text-muted-foreground">
              Optional — gespeichert über Tire-Health-Pipeline
            </span>
          </span>
        </button>
      )}

      {form.state.tireMeasurementCaptured && (
        <p className="rounded-xl border border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] px-3 py-2 text-xs text-[color:var(--status-success)]">
          {tireMeasureHint ?? 'Reifenprofilmessung erfasst — wird im Protokoll vermerkt.'}
        </p>
      )}

      <OperatorHandoverTechnicalObservationsSection form={form} />

      <OperatorHandoverField label="Notizen">
        <textarea
          value={form.state.notes}
          onChange={(e) => form.patchState({ notes: e.target.value })}
          placeholder="Zusätzliche Bemerkungen"
          className={operatorTextareaClass}
        />
      </OperatorHandoverField>
    </div>
  );
}
