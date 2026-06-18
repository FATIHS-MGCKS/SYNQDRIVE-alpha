import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { Icon } from '../ui/Icon';
import { buildVehicleInsightCards } from '../../lib/damage-insights';
import type { DamageVehicleInsights } from '../../lib/damage.types';

interface DamageInsightsSectionProps {
  insights: DamageVehicleInsights | null | undefined;
  statsUnavailable?: boolean;
}

export function DamageInsightsSection({
  insights,
  statsUnavailable,
}: DamageInsightsSectionProps) {
  const [open, setOpen] = useState(false);
  const cards = buildVehicleInsightCards(insights);

  if (statsUnavailable && !cards.length) {
    return (
      <div className="sq-card rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          Damage insights are temporarily unavailable. Queue metrics above still reflect loaded damages.
        </p>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="sq-card rounded-xl border border-border/60 px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground">Not enough data yet for damage insights.</p>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="sq-card rounded-xl border border-border/60 overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left sq-press hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="bar-chart-3" className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground">Damage insights</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {cards[0].label}: {cards[0].value}
                {cards.length > 1 ? ` · +${cards.length - 1} more` : ''}
              </p>
            </div>
          </div>
          <Icon
            name="chevron-down"
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border/50">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border/60 bg-muted/15 px-2.5 py-2"
              >
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {card.label}
                </p>
                <p className="text-[13px] font-semibold text-foreground mt-0.5">{card.value}</p>
                {card.hint && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{card.hint}</p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
