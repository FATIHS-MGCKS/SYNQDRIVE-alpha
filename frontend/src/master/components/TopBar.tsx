import { Moon, Sun, Bell, Home, Search, Settings, LogOut } from 'lucide-react';
import { useState } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';

const languages = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
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
          <button onClick={() => setIsLanguageOpen(!isLanguageOpen)} className="flex items-center gap-1.5 p-1.5 rounded-md transition-colors hover:bg-muted">
            <span className="text-base leading-none">{selectedLanguage.flag}</span>
          </button>
          {isLanguageOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg shadow-lg border overflow-hidden z-[9999] bg-card border-border">
              {languages.map((lang) => (
                <button key={lang.code} onClick={() => { setSelectedLanguage(lang); setIsLanguageOpen(false); }}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-sm font-medium hover:bg-muted ${selectedLanguage.code === lang.code ? 'bg-muted' : ''}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-foreground">{lang.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="relative p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-background"></span>
        </button>

        <div className="hidden sm:block w-px h-6 mx-1.5 bg-border" />

        <button
          onClick={() => { clearAuth(); window.location.href = '/login'; }}
          title="Logout"
          className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <button className="w-8 h-8 ml-1 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md hover:shadow-lg transition-all hover:scale-105">
          {(getStoredUser()?.name || 'SA').slice(0, 2).toUpperCase()}
        </button>
      </div>
    </div>
  );
}