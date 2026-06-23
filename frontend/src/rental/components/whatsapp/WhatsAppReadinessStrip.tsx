import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import type { ReadinessCheck, WhatsAppTab } from './whatsapp.ops';

interface WhatsAppReadinessStripProps {
  checks: ReadinessCheck[];
  onNavigate?: (tab: WhatsAppTab) => void;
}

const STATUS_ICON: Record<ReadinessCheck['status'], { icon: string; className: string }> = {
  ok: { icon: 'check-circle-2', className: 'text-[color:var(--status-positive)]' },
  warn: { icon: 'alert-triangle', className: 'text-[color:var(--status-watch)]' },
  error: { icon: 'x-circle', className: 'text-[color:var(--status-critical)]' },
  pending: { icon: 'clock', className: 'text-muted-foreground' },
};

export function WhatsAppReadinessStrip({ checks, onNavigate }: WhatsAppReadinessStripProps) {
  return (
    <div className="sq-card overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]">
      <div className="flex gap-3 overflow-x-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {checks.map(check => {
          const meta = STATUS_ICON[check.status];
          return (
            <div
              key={check.id}
              className="flex min-w-[168px] max-w-[220px] shrink-0 flex-col gap-1.5 rounded-xl border border-border/30 bg-muted/15 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <Icon name={meta.icon as 'check'} className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.className)} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-foreground">{check.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-muted-foreground">{check.detail}</p>
                </div>
              </div>
              {check.action && check.tab && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(check.tab!)}
                  className="sq-press self-start text-[9px] font-semibold text-[color:var(--brand)] hover:underline"
                >
                  {check.action}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
