import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { StatusDot } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import {
  operatorShellHeaderAppLinkLabel,
  operatorShellHeaderAriaLabel,
  operatorShellHeaderEyebrow,
  operatorShellHeaderOrgLoadingLabel,
  operatorShellHeaderRefreshTitle,
  operatorShellHeaderSyncLabel,
} from '../lib/operator-shell-top-chrome-i18n';

export function OperatorHeader() {
  const { orgName, loading: orgLoading } = useRentalOrg();
  const { syncState, triggerRefresh } = useOperatorShell();
  const { locale, formattingLocale, localeMetadata } = useLanguage();

  const syncLabel = operatorShellHeaderSyncLabel(locale, syncState, formattingLocale);

  return (
    <header
      className="sticky top-0 z-20 border-b border-border/50 surface-frosted"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      aria-label={operatorShellHeaderAriaLabel(locale, localeMetadata.nativeName)}
      lang={formattingLocale}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {operatorShellHeaderEyebrow(locale)}
          </p>
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground">
            {orgLoading ? operatorShellHeaderOrgLoadingLabel(locale) : orgName || 'SynqDrive'}
          </h1>
        </div>

        <button
          type="button"
          onClick={triggerRefresh}
          className="sq-press flex h-11 min-w-[44px] items-center gap-1.5 rounded-xl border border-border/70 bg-popover px-2.5 text-[10px] font-semibold text-muted-foreground"
          title={operatorShellHeaderRefreshTitle(locale)}
        >
          <StatusDot
            tone={syncState.error ? 'critical' : syncState.loading ? 'watch' : 'success'}
            pulse={syncState.loading}
          />
          <span className="hidden xs:inline">{syncLabel}</span>
          <RefreshCw className={`h-3.5 w-3.5 ${syncState.loading ? 'animate-spin' : ''}`} />
        </button>

        <Link
          to="/rental"
          className="sq-press flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-border/70 bg-popover px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          {operatorShellHeaderAppLinkLabel(locale)}
        </Link>
      </div>
    </header>
  );
}
