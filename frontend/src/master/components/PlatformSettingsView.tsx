import { Settings, Globe, Zap, CheckCircle, Copy, Eye, EyeOff, Save, Wifi, WifiOff, RefreshCw, CreditCard, AlertTriangle, Trash2, Activity } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SystemMonitoringView } from './SystemMonitoringView';

interface PlatformSettingsViewProps {
  isDarkMode: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  dimoConnected: boolean;
  onDimoToggle: () => void;
  stripeConnected: boolean;
  onStripeToggle: () => void;
  onPrune?: () => Promise<void>;
}

export function PlatformSettingsView({ isDarkMode, activeTab = 'general', onTabChange, dimoConnected, onDimoToggle, stripeConnected, onStripeToggle, onPrune }: PlatformSettingsViewProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [dimoApiKey, setDimoApiKey] = useState('dimo_test_a8f2b3c4d5e6f7g8');
  const [dimoEnv, setDimoEnv] = useState<'Production' | 'Sandbox'>('Sandbox');
  const [dimoTesting, setDimoTesting] = useState(false);
  const [stripeTesting, setStripeTesting] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'integrations', label: 'Integrations', icon: Globe },
    { id: 'monitoring', label: 'API & Worker Monitoring', icon: Activity },
  ];

  const cardClass = `rounded-3xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200 focus:border-indigo-500/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-indigo-300 placeholder:text-gray-400'}`;
  const labelClass = `block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  const testDimo = () => {
    setDimoTesting(true);
    setTimeout(() => {
      setDimoTesting(false);
      if (!dimoConnected) { onDimoToggle(); }
      toast.success('DIMO connection successful! Vehicles loaded.');
    }, 1500);
  };

  const testStripe = () => {
    setStripeTesting(true);
    setTimeout(() => {
      setStripeTesting(false);
      toast.success('Stripe test payment successful (€1.00)');
    }, 1200);
  };

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Settings</h1>
        <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Configure your SynqDrive platform</p>
      </div>

      <div className={`flex gap-1 p-1.5 rounded-2xl overflow-x-auto w-fit ${isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-100'}`}>
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

      {/* INTEGRATIONS (Stripe) */}
      {activeTab === 'integrations' && (
        <div className={`${cardClass} p-8`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stripeConnected ? 'bg-purple-50' : isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                <CreditCard className={`w-7 h-7 ${stripeConnected ? 'text-purple-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Stripe</h2>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Payment processing & billing</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${stripeConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>{stripeConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          {stripeConnected && (
            <div className="space-y-3 mb-6">
              <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Account ID</span><span className={`text-sm font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>acct_1SqD2025XyZ</span></div>
              <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Payment Status</span><span className="text-sm font-semibold text-green-600">Active</span></div>
              <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last Payment</span><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Mar 7, 2026</span></div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onStripeToggle} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${stripeConnected ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gradient-to-br from-purple-500 to-purple-600 text-white hover:shadow-lg'}`}>
              {stripeConnected ? <><WifiOff className="w-4 h-4" /> Disconnect Stripe</> : <><Wifi className="w-4 h-4" /> Connect Stripe</>}
            </button>
            {stripeConnected && (
              <button onClick={testStripe} disabled={stripeTesting} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <RefreshCw className={`w-4 h-4 ${stripeTesting ? 'animate-spin' : ''}`} /> Test Payment
              </button>
            )}
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
