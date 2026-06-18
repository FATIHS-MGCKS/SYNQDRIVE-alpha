import { cn } from '../../../components/ui/utils';
import type { Locale } from '../../i18n/LanguageContext';
import type { DashboardTrustHint } from './dataTrustBuilder';
import { trustHintLabel } from './dataTrustBuilder';

interface DataTrustHintProps {
  hint?: DashboardTrustHint | null;
  locale: Locale | string;
  className?: string;
}

/** Subtle trust cue — hidden when data is fully live/fresh. */
export function DataTrustHint({ hint, locale, className }: DataTrustHintProps) {
  if (!hint || hint === 'live') return null;

  return (
    <p
      className={cn(
        'text-[9px] font-medium leading-snug text-muted-foreground/90',
        hint === 'financial-unavailable' || hint === 'booking-unavailable' || hint === 'insights-unavailable'
          ? 'text-[color:var(--status-critical)]/80'
          : '',
        className,
      )}
      title={trustHintLabel(hint, locale)}
    >
      {trustHintLabel(hint, locale)}
    </p>
  );
}
