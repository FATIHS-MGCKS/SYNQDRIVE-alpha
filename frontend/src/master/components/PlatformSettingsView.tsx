import { Settings, Globe, Save, CreditCard, AlertTriangle, Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PlatformEmailSettingsPanel } from './PlatformEmailSettingsPanel';
import { MasterPageHeader, type MasterPageTab } from '../shell';
import { Button } from '../../components/ui/button';

type SettingsTab = 'general' | 'email' | 'integrations';

const SETTINGS_TABS: MasterPageTab<SettingsTab>[] = [
  { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
  { id: 'email', label: 'E-Mail', icon: <Mail className="w-4 h-4" /> },
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
  dimoConnected,
  onDimoToggle,
}: PlatformSettingsViewProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [dimoApiKey, setDimoApiKey] = useState('dimo_test_a8f2b3c4d5e6f7g8');
  const [dimoEnv, setDimoEnv] = useState<'Production' | 'Sandbox'>('Sandbox');
  const [dimoTesting, setDimoTesting] = useState(false);

  const resolvedTab: SettingsTab =
    activeTab === 'email' || activeTab === 'integrations' ? activeTab : 'general';

  const cardClass = `rounded-3xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-background border-neutral-700 text-gray-200 focus:border-brand/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-brand placeholder:text-gray-400'}`;
  const labelClass = `block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  const testDimo = () => {
    setDimoTesting(true);
    setTimeout(() => {
      setDimoTesting(false);
      if (!dimoConnected) {
        onDimoToggle();
      }
      toast.success('DIMO connection successful! Vehicles loaded.');
    }, 1500);
  };

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
            <Button type="button" onClick={() => toast.success('Settings saved successfully')}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {resolvedTab === 'email' && <PlatformEmailSettingsPanel isDarkMode={isDarkMode} />}

      {resolvedTab === 'integrations' && (
        <div className={`${cardClass} p-8`}>
          <div className="flex items-start gap-4 mb-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'surface-premium' : 'bg-gray-100'}`}>
              <CreditCard className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Stripe</h2>
              <p className={`text-sm ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                Platform billing & Connect are configured via server environment and Master Billing Control Center — not via this demo toggle.
              </p>
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">No live Stripe connection on this screen</p>
                <p className="mt-1 opacity-90">
                  SynqDrive subscription Stripe status and webhooks are managed under Master → Billing → Stripe / Webhooks.
                  Tenant Connect onboarding is under Administration → Billing → Customer payments & payouts.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
