import { cn } from '../../../../components/ui/utils';

export const accountFieldLabelClass =
  'block text-[11px] font-medium mb-1 text-muted-foreground';

export const accountInputClass =
  'w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';

export const accountSelectClass = accountInputClass;

export type AccountKpiTone = 'neutral' | 'success' | 'info' | 'watch' | 'critical';

export function accountKpiCardClass(tone: AccountKpiTone = 'neutral'): string {
  return cn(
    'sq-press relative overflow-hidden border text-left transition-colors duration-200',
    'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    'min-h-[88px] rounded-2xl bg-background/40 px-3 py-2.5 border-border/45 h-full w-full',
    tone === 'success' &&
      'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
    tone === 'watch' && 'border-[color:var(--status-watch)]/30',
    tone === 'critical' &&
      'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
  );
}

export function accountKpiIconToneClass(tone: AccountKpiTone = 'neutral'): string {
  if (tone === 'critical') return 'sq-tone-critical';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'watch') return 'sq-tone-watch';
  if (tone === 'info') return 'sq-tone-info';
  return 'bg-muted text-muted-foreground';
}

export function accountKpiValueClass(tone: AccountKpiTone = 'neutral'): string {
  return cn(
    'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em] truncate',
    tone === 'success' && 'text-[color:var(--status-positive)]',
    tone === 'critical' && 'text-[color:var(--status-critical)]',
    tone === 'watch' && 'text-[color:var(--status-watch)]',
  );
}
