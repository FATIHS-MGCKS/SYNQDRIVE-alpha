import type { PlatformIntegrationsFlagsDto } from '../types';
import { PlatformEmailSettingsSection } from '../components/PlatformEmailSettingsSection';
import type { SettingsCategory } from '../types';

interface PlatformIntegrationsSettingsTabProps {
  category: SettingsCategory;
  flags: PlatformIntegrationsFlagsDto | null;
  onNavigateCategory: (category: SettingsCategory) => void;
}

const CATEGORIES: Array<{ id: SettingsCategory; label: string }> = [
  { id: 'communication', label: 'Kommunikation' },
  { id: 'billing', label: 'Abrechnung' },
  { id: 'vehicles', label: 'Fahrzeuge & Telemetrie' },
  { id: 'flags', label: 'Plattform-Flags' },
  { id: 'operations', label: 'Betrieb' },
];

export function PlatformIntegrationsSettingsTab({
  category,
  flags,
  onNavigateCategory,
}: PlatformIntegrationsSettingsTabProps) {
  return (
    <div className="space-y-5" data-testid="platform-integrations-settings">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onNavigateCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
              category === cat.id
                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'bg-muted/40 text-muted-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {category === 'communication' && <PlatformEmailSettingsSection />}

      {category === 'billing' && (
        <div className="surface-premium p-5 text-sm text-muted-foreground">
          Stripe-Konfiguration und Abgleich werden im Master-Abrechnungszentrum verwaltet. Die
          Integrations-Übersicht zeigt TEST/LIVE und Webhook-Health.
        </div>
      )}

      {category === 'vehicles' && (
        <div className="surface-premium p-5 text-sm text-muted-foreground">
          DIMO-Plattform-Health und Fahrzeug-Konnektivität werden unter Verbundene Fahrzeuge und
          Plattform & Betrieb verwaltet — nicht hier dupliziert.
        </div>
      )}

      {category === 'flags' && (
        <div className="surface-premium p-5 space-y-3">
          <h3 className="font-semibold">Plattform-Flags (nur Lesen)</h3>
          <p className="text-sm text-muted-foreground">
            Änderungen erfolgen über Deployment/ENV — kein Bearbeiten in der UI.
          </p>
          <dl className="space-y-3">
            {(flags?.flags ?? []).map((flag) => (
              <div key={flag.key} className="border-b border-border/50 pb-3">
                <dt className="font-medium">{flag.label}</dt>
                <dd className="text-sm text-muted-foreground mt-1">{flag.description}</dd>
                <dd className="text-sm font-semibold mt-2">{flag.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {category === 'operations' && (
        <div className="surface-premium p-5 text-sm text-muted-foreground">
          Infrastruktur, Worker und Alerts: Plattform & Betrieb (`platform-ops`).
        </div>
      )}
    </div>
  );
}
