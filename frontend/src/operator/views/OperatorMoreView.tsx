import { CalendarPlus, ExternalLink, Sparkles, Disc3, Info, Car } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useAppTheme } from '../../context/AppThemeContext';
import { themePreferenceLabel } from '../../lib/theme';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorGatedSheet } from '../hooks/useOperatorGatedSheet';
import { useOperatorPermissions } from '../hooks/useOperatorPermissions';
import { useOperatorVehiclesData } from '../hooks/useOperatorVehiclesData';
import { useState } from 'react';

export function OperatorMoreView() {
  const { setActiveTab, setScanQuery } = useOperatorShell();
  const openSheet = useOperatorGatedSheet();
  const { gate } = useOperatorPermissions();
  const bookingCreateGate = gate('operator.booking.create');
  const documentUploadGate = gate('operator.document.upload');
  const tireMeasureGate = gate('operator.tire_measurement.create');
  const { preference, cycleThemePreference } = useAppTheme();
  const { allVehicles } = useOperatorVehiclesData();
  const [pickerOpen, setPickerOpen] = useState<'ai' | 'tire' | null>(null);

  const pickVehicle = (type: 'ai' | 'tire') => {
    const gate = type === 'ai' ? documentUploadGate : tireMeasureGate;
    if (!gate.allowed) return;
    if (allVehicles.length === 1) {
      const v = allVehicles[0];
      const label = `${v.model} · ${v.license}`;
      openSheet({
        type: type === 'ai' ? 'ai-upload' : 'tire-measure',
        vehicleId: v.id,
        vehicleLabel: label,
        ...(type === 'ai' ? { contextMode: 'general' as const } : {}),
      });
      return;
    }
    setPickerOpen(type);
  };

  return (
    <div className="space-y-4 pb-4">
      <section>
        <h2 className="sq-section-label mb-2 px-0.5">Aktionen</h2>
        <div className="grid gap-2">
          <OperatorGlassCard
            as="button"
            onClick={() => bookingCreateGate.allowed && openSheet({ type: 'booking-create' })}
            className={`flex min-h-[56px] items-center gap-3 p-4 ${!bookingCreateGate.allowed ? 'opacity-45 cursor-not-allowed' : ''}`}
            title={bookingCreateGate.reason}
            aria-disabled={!bookingCreateGate.allowed || undefined}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold">Buchung aufnehmen</span>
              <span className="text-xs text-muted-foreground">Neue Mietbuchung anlegen</span>
            </span>
          </OperatorGlassCard>
          <OperatorGlassCard
            as="button"
            onClick={() => pickVehicle('ai')}
            className={`flex min-h-[56px] items-center gap-3 p-4 ${!documentUploadGate.allowed ? 'opacity-45 cursor-not-allowed' : ''}`}
            title={documentUploadGate.reason}
            aria-disabled={!documentUploadGate.allowed || undefined}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold">AI Upload</span>
              <span className="text-xs text-muted-foreground">Dokumente am Fahrzeug erfassen</span>
            </span>
          </OperatorGlassCard>
          <OperatorGlassCard
            as="button"
            onClick={() => pickVehicle('tire')}
            className={`flex min-h-[56px] items-center gap-3 p-4 ${!tireMeasureGate.allowed ? 'opacity-45 cursor-not-allowed' : ''}`}
            title={tireMeasureGate.reason}
            aria-disabled={!tireMeasureGate.allowed || undefined}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Disc3 className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold">Reifenprofil messen</span>
              <span className="text-xs text-muted-foreground">Profiltiefe manuell erfassen</span>
            </span>
          </OperatorGlassCard>
        </div>
      </section>

      {pickerOpen && (
        <section className="rounded-2xl border border-border surface-premium p-4">
          <p className="mb-3 text-sm font-semibold">Fahrzeug wählen</p>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {allVehicles.map((v) => {
              const label = `${v.model} · ${v.license}`;
              return (
                <button
                  key={v.id}
                  type="button"
                  className="sq-press flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-border/60 px-3 text-left text-sm"
                  onClick={() => {
                    openSheet({
                      type: pickerOpen === 'ai' ? 'ai-upload' : 'tire-measure',
                      vehicleId: v.id,
                      vehicleLabel: label,
                      ...(pickerOpen === 'ai' ? { contextMode: 'general' as const } : {}),
                    });
                    setPickerOpen(null);
                  }}
                >
                  <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-muted-foreground"
            onClick={() => {
              setPickerOpen(null);
              setActiveTab('vehicles');
            }}
          >
            In Fahrzeuge suchen →
          </button>
        </section>
      )}

      <section>
        <h2 className="sq-section-label mb-2 px-0.5">Navigation</h2>
        <OperatorGlassCard
          as="button"
          onClick={() => {
            setScanQuery('');
            setActiveTab('scan');
          }}
          className="flex min-h-[48px] w-full items-center justify-between p-4"
        >
          <span className="text-sm font-semibold">Fahrzeug suchen / Scan</span>
        </OperatorGlassCard>
      </section>

      <section>
        <h2 className="sq-section-label mb-2 px-0.5">Darstellung</h2>
        <OperatorGlassCard className="flex min-h-[56px] items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Design</p>
            <p className="text-xs text-muted-foreground">{themePreferenceLabel(preference)}</p>
          </div>
          <ThemeToggleButton preference={preference} onCycle={cycleThemePreference} />
        </OperatorGlassCard>
      </section>

      <section>
        <h2 className="sq-section-label mb-2 px-0.5">SynqDrive</h2>
        <Link
          to="/rental"
          className="sq-press flex min-h-[48px] items-center justify-between rounded-2xl border border-border/60 surface-premium p-4"
        >
          <span className="text-sm font-semibold">Zur Web-App</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <OperatorGlassCard className="flex gap-3 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Operator ist für mobile Endgeräte und Tablets optimiert. Status und Aufgaben stammen aus den
          kanonischen SynqDrive-APIs — keine separaten Berechnungen.
        </p>
      </OperatorGlassCard>
    </div>
  );
}
