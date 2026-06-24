import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { WhatsAppConfig, WhatsAppStats } from '../../../lib/api';
import {
  connectionStatusLabel,
  connectionStatusTone,
  resolveConnectionStatus,
} from './whatsapp.ops';

interface WhatsAppOperationsHeaderProps {
  config: WhatsAppConfig | null;
  stats: WhatsAppStats | null;
  isBusy: boolean;
  onConnect: () => void;
  onOpenTemplates: () => void;
  onRefresh: () => void;
}

export function WhatsAppOperationsHeader({
  config,
  stats,
  isBusy,
  onConnect,
  onOpenTemplates,
  onRefresh,
}: WhatsAppOperationsHeaderProps) {
  const status = resolveConnectionStatus(config);
  const tone = connectionStatusTone(status);

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
            WhatsApp Operations Center
          </h1>
          <StatusChip tone={tone}>
            {connectionStatusLabel(status)}
          </StatusChip>
        </div>
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Kundenkommunikation, Buchungsstatus, Übergabe/Rückgabe, Dokumente und AI-Assistenz in einem Kanal.
          SynqDrive steuert Versand und Freigabe — externe Agents liefern nur Kontext.
        </p>
        {config?.phoneNumber && (
          <p className="text-[11px] text-muted-foreground">
            {config.businessName ? `${config.businessName} · ` : ''}
            {config.phoneNumber}
            {stats?.unreadTotal ? ` · ${stats.unreadTotal} unread` : ''}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenTemplates}
          className="sq-press inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-all hover:bg-muted"
        >
          <Icon name="file-text" className="h-3.5 w-3.5" />
          Templates
        </button>
        <button
          type="button"
          onClick={onConnect}
          className="sq-press inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--brand)] px-3.5 py-2 text-[11px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-95"
        >
          <Icon name={config?.isConnected ? 'refresh-cw' : 'link'} className="h-3.5 w-3.5" />
          {config?.isConnected ? 'Configure' : 'Connect'}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isBusy}
          aria-label="Refresh"
          className={cn(
            'sq-press flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-all hover:bg-muted hover:text-foreground',
            isBusy && 'opacity-60',
          )}
        >
          <Icon name="refresh-cw" className={cn('h-4 w-4', isBusy && 'animate-spin')} />
        </button>
      </div>
    </header>
  );
}
