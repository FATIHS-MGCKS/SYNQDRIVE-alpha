import { LogOut, Settings, Shield } from 'lucide-react';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useAppTheme } from '../../context/AppThemeContext';
import { tMasterNav } from '../navigation/master-nav-i18n';

interface MasterAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenOwnSecurity?: () => void;
}

export function MasterAccountSheet({ open, onOpenChange, onOpenSettings, onOpenOwnSecurity }: MasterAccountSheetProps) {
  const { preference, cycleThemePreference } = useAppTheme();
  const user = getStoredUser();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 overlay-scrim"
        aria-label={tMasterNav('master.nav.mobileMenuClose')}
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative w-full max-w-sm rounded-t-dialog sm:rounded-dialog border border-border bg-card p-5 shadow-lg animate-fade-up motion-reduce:animate-none pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-account-sheet-title"
      >
        <h2 id="master-account-sheet-title" className="text-sm font-bold text-foreground mb-1">
          {tMasterNav('master.account.title')}
        </h2>
        <p className="text-[12px] text-muted-foreground mb-4 truncate">{user?.email}</p>

        <div className="space-y-1">
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-muted/50">
            <span className="text-[12px] font-medium text-foreground">{tMasterNav('master.account.profile')}</span>
            <span className="text-[12px] text-muted-foreground truncate max-w-[50%]">{user?.name}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenSettings();
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            {tMasterNav('master.nav.settings')}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              if (onOpenOwnSecurity) {
                onOpenOwnSecurity();
              } else {
                onOpenSettings();
              }
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            <Shield className="w-4 h-4 text-muted-foreground" />
            {tMasterNav('master.account.mfa')}
          </button>

          <div className="flex items-center justify-between rounded-lg px-3 py-2.5 min-h-[44px]">
            <span className="text-[12px] font-medium text-foreground">{tMasterNav('master.account.theme')}</span>
            <ThemeToggleButton preference={preference} onCycle={cycleThemePreference} />
          </div>

          <button
            type="button"
            onClick={() => {
              clearAuth();
              window.location.href = '/login';
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] font-semibold text-[color:var(--status-critical)] hover:bg-muted transition-colors min-h-[44px] mt-2"
          >
            <LogOut className="w-4 h-4" />
            {tMasterNav('master.nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
