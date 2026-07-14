import { Settings, Globe, Save, CreditCard, AlertTriangle, Activity, Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SystemMonitoringView } from './SystemMonitoringView';
import { PlatformEmailSettingsPanel } from './PlatformEmailSettingsPanel';

interface PlatformSettingsViewProps {
  isDarkMode: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  dimoConnected: boolean;
  onDimoToggle: () => void;
  onPrune?: () => Promise<void>;
}

export function PlatformSettingsView({ isDarkMode, activeTab = 'general', onTabChange, dimoConnected, onDimoToggle, onPrune }: PlatformSettingsViewProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [dimoApiKey, setDimoApiKey] = useState('dimo_test_a8f2b3c4d5e6f7g8');
  const [dimoEnv, setDimoEnv] = useState<'Production' | 'Sandbox'>('Sandbox');
  const [dimoTesting, setDimoTesting] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'email', label: 'E-Mail', icon: Mail },
    { id: 'integrations', label: 'Integrations', icon: Globe },
    { id: 'monitoring', label: 'API & Worker Monitoring', icon: Activity },
  ];

  const cardClass = `rounded-3xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-background border-neutral-700 text-gray-200 focus:border-brand/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-brand placeholder:text-gray-400'}`;
  const labelClass = `block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  const testDimo = () => {
    setDimoTesting(true);
    setTimeout(() => {
      setDimoTesting(false);
      if (!dimoConnected) { onDimoToggle(); }
      toast.success('DIMO connection successful! Vehicles loaded.');
    }, 1500);
  };

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Settings</h1>
        <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>Configure your SynqDrive platform</p>
      </div>

      <div className={`flex gap-1 p-1.5 rounded-2xl overflow-x-auto w-fit ${isDarkMode ? 'surface-premium' : 'bg-gray-100'}`}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => onTabChange?.(tab.id)} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* GENERAL */}
      {activeTab === 'general' && (
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
            <button onClick={() => toast.success('Settings saved successfully')} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all"><Save className="w-4 h-4" />Save Changes</button>
          </div>

        </div>
      )}

      {activeTab === 'email' && <PlatformEmailSettingsPanel isDarkMode={isDarkMode} />}

      {/* INTEGRATIONS (Stripe — platform config is env-driven, not toggled here) */}
      {activeTab === 'integrations' && (
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

      {/* API & Worker Monitoring */}
      {activeTab === 'monitoring' && (
        <SystemMonitoringView />
      )}
    </div>
  );
}
