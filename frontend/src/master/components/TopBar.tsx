import { Moon, Sun, Bell, Home, Search, Settings, LogOut } from 'lucide-react';
import { useState } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';

// ISO-2 code pills instead of emoji flags (anti-emoji design policy,
// consistent with the rental TopBar).
const languages = [
  { code: 'de', name: 'Deutsch', short: 'DE' },
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'fr', name: 'Français', short: 'FR' },
  { code: 'it', name: 'Italiano', short: 'IT' },
  { code: 'pl', name: 'Polski', short: 'PL' },
];

type ViewType = 'dashboard' | 'organizations' | 'users' | 'vehicles' | 'prospects' | 'subscriptions' | 'activity-log' | 'support' | 'settings' | 'fleet-connection';

interface TopBarProps {
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  currentView?: ViewType;
  settingsTab?: string;
}

const viewLabels: Record<ViewType, string> = {
  'dashboard': 'Dashboard',
  'organizations': 'Organizations',
  'users': 'Users',
  'vehicles': 'Vehicles',
  'prospects': 'Prospects',
  'subscriptions': 'Subscriptions & Billing',
  'activity-log': 'Activity Log',
  'support': 'Support',
  'settings': 'Settings',
  'fleet-connection': 'Fleet Connection',
};

const viewCategories: Record<ViewType, string> = {
  'dashboard': 'Overview',
  'organizations': 'Management',
  'users': 'Management',
  'vehicles': 'Management',
  'prospects': 'Management',
  'subscriptions': 'Platform',
  'activity-log': 'Platform',
  'support': 'Support',
  'settings': 'Configuration',
  'fleet-connection': 'Configuration',
};

const settingsTabLabels: Record<string, string> = {
  'general': 'General',
  'security': 'Security',
  'api': 'API & Webhooks',
  'notifications': 'Notifications',
  'integrations': 'Integrations',
  'monitoring': 'API & Worker Monitoring',
};

export function TopBar({ isDarkMode, setIsDarkMode, currentView = 'dashboard', settingsTab }: TopBarProps) {
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(languages[1]);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex items-center justify-between mb-4 z-10 relative">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs min-w-0 overflow-hidden font-medium">
        <Home className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="hidden sm:inline text-muted-foreground">{viewCategories[currentView]}</span>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        {currentView === 'settings' && settingsTab ? (
          <>
            <span className="hidden md:inline text-muted-foreground">Settings</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-sm font-semibold truncate text-foreground">{settingsTabLabels[settingsTab] || 'General'}</span>
          </>
        ) : (
          <span className="text-sm font-semibold truncate text-foreground">{viewLabels[currentView]}</span>
        )}
      </div>

      {/* Search */}
      <div className="hidden md:flex flex-1 max-w-xs">
        <div className="flex items-center gap-3 w-full px-3 py-1.5 rounded-lg border transition-all bg-muted border-border focus-within:border-foreground/20">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search organizations, users, vehicles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm font-medium placeholder:text-muted-foreground text-foreground"
          />
          <div className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-foreground/5 text-muted-foreground">
            <span>⌘</span><span>K</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground">
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground">
          <Settings className="w-4 h-4" />
        </button>

        <div className="relative hidden sm:block">
          <button
            onClick={() => setIsLanguageOpen(!isLanguageOpen)}
            className="flex h-8 min-w-[36px] items-center justify-center rounded-md px-2 font-mono tabular text-[10.5px] font-semibold tracking-[0.06em] transition-colors hover:bg-muted text-muted-foreground hover:text-foreground sq-press"
            aria-label={`Language: ${selectedLanguage.name}`}
          >
            {selectedLanguage.short}
          </button>
          {isLanguageOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 sq-overlay overflow-hidden z-[9999] animate-fade-up">
              {languages.map((lang) => (
                <button key={lang.code} onClick={() => { setSelectedLanguage(lang); setIsLanguageOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-[12.5px] hover:bg-muted ${selectedLanguage.code === lang.code ? 'bg-muted' : ''}`}
                >
                  <span className="inline-flex items-center justify-center h-5 min-w-[28px] px-1.5 rounded-sm font-mono tabular text-[10px] font-semibold tracking-[0.06em] bg-muted text-muted-foreground">
                    {lang.short}
                  </span>
                  <span className="text-foreground">{lang.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="relative p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground sq-press">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ring-2 ring-background bg-[color:var(--status-critical)]"></span>
        </button>

        <div className="hidden sm:block w-px h-6 mx-1.5 bg-border" />

        <button
          onClick={() => { clearAuth(); window.location.href = '/login'; }}
          title="Logout"
          className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground sq-press"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <button className="w-8 h-8 ml-1 sq-tone-critical ring-1 ring-[color:var(--status-critical-soft)] rounded-lg flex items-center justify-center text-xs font-bold transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_var(--status-critical-soft)]">
          {(getStoredUser()?.name || 'SA').slice(0, 2).toUpperCase()}
        </button>
      </div>
    </div>
  );
}