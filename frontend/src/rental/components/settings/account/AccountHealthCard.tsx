import { Activity, CheckCircle2, CircleDashed } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';

interface AccountHealthCardProps {
  accountHealth: AccountMeDto['accountHealth'];
  onImprove?: () => void;
}

export function AccountHealthCard({ accountHealth, onImprove }: AccountHealthCardProps) {
  return (
    <div className="sq-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">Account Health</span>
        <Activity className="w-4 h-4 text-muted-foreground/80" />
      </div>
      <p className="mt-2 font-mono text-[22px] font-bold tabular-nums text-foreground">
        {accountHealth.score}%
      </p>
      <p className="text-[12px] text-muted-foreground mt-1">
        {accountHealth.missingItems.length > 0
          ? `${accountHealth.missingItems.length} offen`
          : 'Vollständig'}
      </p>
      <div className="mt-auto pt-3 border-t border-border/50 space-y-1.5">
        {accountHealth.recommendations.slice(0, 2).map((rec) => (
          <p key={rec} className="text-[10px] text-muted-foreground leading-snug flex gap-1.5">
            <CircleDashed className="w-3 h-3 shrink-0 mt-0.5" />
            {rec}
          </p>
        ))}
        {accountHealth.score >= 80 && accountHealth.missingItems.length === 0 && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[var(--status-success)]" />
            Alle Kernpunkte erfüllt
          </p>
        )}
        {onImprove && accountHealth.missingItems.length > 0 && (
          <button
            type="button"
            onClick={onImprove}
            className="text-[10px] font-semibold text-[var(--brand)] hover:underline"
          >
            Profil vervollständigen
          </button>
        )}
      </div>
    </div>
  );
}
