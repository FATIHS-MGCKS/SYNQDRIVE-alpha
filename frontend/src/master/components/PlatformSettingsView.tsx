import { Settings, Globe, Save, CreditCard, AlertTriangle, Radio } from 'lucide-react';
import { MasterPageHeader, type MasterPageTab } from '../shell';
import { PlatformEmailSettingsPanel } from './PlatformEmailSettingsPanel';

type SettingsTab = 'general' | 'email' | 'integrations';

const SETTINGS_TABS: MasterPageTab<SettingsTab>[] = [
  { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
  { id: 'email', label: 'E-Mail', icon: <Settings className="w-4 h-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <Globe className="w-4 h-4" /> },
];

interface PlatformSettingsViewProps {
  isDarkMode: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  dimoConnected: boolean;
  onDimoToggle: () => void;
  onPrune?: () => Promise<void>;
}

export function PlatformSettingsView({
  isDarkMode,
  activeTab = 'general',
  onTabChange,
}: PlatformSettingsViewProps) {
  const resolvedTab: SettingsTab =
    activeTab === 'email' || activeTab === 'integrations' ? activeTab : 'general';

  const cardClass = `rounded-3xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-background border-neutral-700 text-gray-200 focus:border-brand/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-brand placeholder:text-gray-400'}`;
  const labelClass = `block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  return (
    <>
      <MasterPageHeader
        title="Settings"
        description="Configure your SynqDrive platform"
        tabs={SETTINGS_TABS}
        activeTabId={resolvedTab}
        onTabChange={(tab) => onTabChange?.(tab)}
        tabsAriaLabel="Einstellungen"
        tabsTestIdPrefix="platform-settings"
      />

      {resolvedTab === 'general' && (
        <div className={`${cardClass} p-8`}>
          <h2 className={`text-lg font-semibold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Company Information</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div><label className={labelClass}>Company Name</label><input type="text" defaultValue="SynqDrive GmbH" className={inputClass} /></div>
            <div><label className={labelClass}>Legal Entity</label><input type="text" defaultValue="GmbH" className={inputClass} /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Address</label><input type="text" defaultValue="Musterstraße 42, 10115 Berlin" className={inputClass} /></div>
            <div><label className={labelClass}>Country</label><input type="text" defaultValue="Germany" className={inputClass} /></div>
            <div><label className={labelClass}>Email</label><input type="email" defaultValue="admin@synqdrive.io" className={inputClass} /></div>
            <div><label className={labelClass}>Support Contact</label><input type="text" defaultValue="support@synqdrive.io" className={inputClass} /></div>
          </div>
          <div className="mt-8 flex justify-end">
            <button type="button" className="sq-cta flex items-center gap-2 px-4 py-2 text-sm font-semibold" onClick={() => {}}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </button>
          </div>
        </div>
      )}

      {resolvedTab === 'email' && <PlatformEmailSettingsPanel isDarkMode={isDarkMode} />}

      {resolvedTab === 'integrations' && (
        <div className="space-y-6">
          <div className={`${cardClass} p-8`}>
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'surface-premium' : 'bg-gray-100'}`}>
                <CreditCard className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Stripe</h2>
                <p className={`text-sm ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                  Plattform-Abrechnung und Connect werden über Server-Umgebung und Master Billing verwaltet — nicht in diesem Bildschirm.
                </p>
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Keine Live-Stripe-Verbindung auf diesem Bildschirm</p>
                  <p className="mt-1 opacity-90">
                    SynqDrive-Abonnement-Status und Webhooks: Master → Abrechnung → Stripe / Webhooks.
                    Mandanten-Connect: Administration → Abrechnung → Kundenzahlungen.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`${cardClass} p-8`}>
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'surface-premium' : 'bg-gray-100'}`}>
                <Radio className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>DIMO</h2>
                <p className={`text-sm ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                  Telematik-Integration wird über Backend-Konfiguration und Fahrzeug-Konnektivität betrieben — keine API-Schlüssel in den Einstellungen.
                </p>
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-border bg-muted/30 text-muted-foreground' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
              <p className="font-semibold text-foreground">Keine Credential-Verwaltung in den Plattform-Einstellungen</p>
              <p className="mt-1">
                DIMO-Status und Fahrzeugverbindungen finden Sie unter Master → Verbundene Fahrzeuge bzw. Plattform & Betrieb.
                API-Schlüssel gehören in die Server-Umgebung, nicht in die UI.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
