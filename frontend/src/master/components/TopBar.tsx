import { LogOut, Moon, Plug, Sun } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { useAppTheme } from '../../context/AppThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { getStoredUser } from '../../lib/auth';
import { cn } from '../../components/ui/utils';
import { tMasterNav } from '../navigation/master-nav-i18n';

interface TopBarProps {
  onNavigate?: (view: string) => void;
  onLogout?: () => void;
}

export function TopBar({ onNavigate, onLogout }: TopBarProps) {
  const user = getStoredUser();
  const { isDarkMode, cycleThemePreference } = useAppTheme();
  const { localeMetadata, formattingLocale } = useLanguage();

  const welcomeLabel = useMemo(() => {
    const name = user?.name?.trim();
    if (name) return tMasterNav('master.topBar.welcomeNamed').replace('{{name}}', name);
    return tMasterNav('master.topBar.welcome');
  }, [user?.name]);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6',
        'border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80',
      )}
      aria-label={`Master admin — ${localeMetadata.nativeName}`}
      lang={formattingLocale}
    >
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{welcomeLabel}</p>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {onNavigate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onNavigate('platform-integrations')}
            aria-label={tMasterNav('master.nav.platformIntegrations')}
            title={tMasterNav('master.nav.platformIntegrations')}
          >
            <Plug className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={cycleThemePreference}
          aria-label={isDarkMode ? tMasterNav('master.topBar.themeLight') : tMasterNav('master.topBar.themeDark')}
        >
          {isDarkMode ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </Button>

        {onLogout ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onLogout}
            aria-label={tMasterNav('master.topBar.logout')}
            title={tMasterNav('master.topBar.logout')}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
