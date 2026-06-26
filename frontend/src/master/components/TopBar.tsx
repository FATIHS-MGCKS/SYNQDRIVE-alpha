import { Moon, Sun, Bell, Search, Settings, LogOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { OperatorEntryButton } from '../../operator/components/OperatorEntryButton';

// ISO-2 code pills instead of emoji flags (anti-emoji design policy,
// consistent with the rental TopBar).
const languages = [
  { code: 'de', name: 'Deutsch', short: 'DE' },
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'fr', name: 'Français', short: 'FR' },
  { code: 'it', name: 'Italiano', short: 'IT' },
  { code: 'pl', name: 'Polski', short: 'PL' },
];

interface TopBarProps {
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
}

function formatLoggedInLabel(user: ReturnType<typeof getStoredUser>): string {
  if (!user) return 'Eingeloggt';
  const name = user.name?.trim();
  if (name) return `Eingeloggt als ${name}`;
  const email = user.email?.trim();
  if (email) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) return `Eingeloggt als ${localPart}`;
  }
  return 'Eingeloggt als Nutzer';
}

export function TopBar({ isDarkMode, setIsDarkMode }: TopBarProps) {
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(languages[1]);
  const [searchQuery, setSearchQuery] = useState('');

  const currentUser = getStoredUser();
  const loggedInLabel = useMemo(() => formatLoggedInLabel(currentUser), [currentUser]);

  return (
    <div className="flex items-center justify-between mb-4 z-10 relative">
      <div className="min-w-0 shrink">
        <p
          className="hidden sm:block truncate text-[12px] leading-none text-muted-foreground sm:text-[13px]"
          title={loggedInLabel}
        >
          {loggedInLabel}
        </p>
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
        <OperatorEntryButton />
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
          {(currentUser?.name || 'SA').slice(0, 2).toUpperCase()}
        </button>
      </div>
    </div>
  );
}
