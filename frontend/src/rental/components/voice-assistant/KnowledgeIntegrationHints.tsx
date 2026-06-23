import { DataCard } from '../../../components/patterns/data-card';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { KnowledgeLinkStatus } from './voice-assistant-builder.types';

interface KnowledgeIntegrationHintsProps {
  title: string;
  description: string;
  items: KnowledgeLinkStatus[];
  onNavigate?: (target: string) => void;
}

function HintRow({ item }: { item: KnowledgeLinkStatus }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
        item.connected
          ? 'border-[color:var(--status-positive)]/20 bg-[color:var(--status-positive)]/[0.03]'
          : 'border-border/50 bg-muted/15',
      )}
    >
      <Icon
        name={item.loading ? 'loader-2' : item.connected ? 'check-circle-2' : 'link-2'}
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          item.loading && 'animate-spin text-muted-foreground',
          !item.loading && item.connected && 'text-[color:var(--status-positive)]',
          !item.loading && !item.connected && 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-foreground">{item.label}</p>
          {!item.loading && (
            <StatusChip tone={item.connected ? 'success' : 'neutral'} className="text-[9px]">
              {item.connected ? 'Available' : 'Not connected'}
            </StatusChip>
          )}
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  );
}

export function KnowledgeIntegrationHints({ title, description, items }: KnowledgeIntegrationHintsProps) {
  return (
    <DataCard title={title} description={description} className="rounded-2xl shadow-[var(--shadow-1)]">
      <div className="space-y-2">
        {items.map(item => (
          <HintRow key={item.label} item={item} />
        ))}
      </div>
    </DataCard>
  );
}
