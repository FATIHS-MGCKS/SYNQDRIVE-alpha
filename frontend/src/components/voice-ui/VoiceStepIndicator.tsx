import { Check } from 'lucide-react';
import { cn } from '../ui/utils';
import { VOICE_FOCUS_RING, VOICE_PRESS_CLASS } from './voice-ui.tokens';
import type { VoiceStepItem } from './voice-ui.types';

export interface VoiceStepIndicatorProps {
  steps: VoiceStepItem[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
  layout?: 'horizontal' | 'vertical';
}

function stepState(index: number, currentIndex: number): 'complete' | 'current' | 'upcoming' {
  if (index < currentIndex) return 'complete';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

export function VoiceStepIndicator({
  steps,
  currentIndex,
  onStepClick,
  className,
  layout = 'horizontal',
}: VoiceStepIndicatorProps) {
  const isVertical = layout === 'vertical';

  return (
    <ol
      className={cn(
        isVertical ? 'space-y-2' : 'flex list-none gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="Progress"
    >
      {steps.map((step, index) => {
        const state = stepState(index, currentIndex);
        const clickable = Boolean(onStepClick) && state !== 'upcoming';

        const inner = (
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
              !isVertical && 'min-w-[9.5rem]',
              state === 'current' && 'surface-premium border-[color:var(--brand)]/30 shadow-[var(--shadow-1)]',
              state === 'complete' && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.03]',
              state === 'upcoming' && 'border-border/50 bg-muted/20',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums',
                state === 'current' && 'sq-tone-brand',
                state === 'complete' && 'sq-tone-success',
                state === 'upcoming' && 'bg-muted text-muted-foreground',
              )}
              aria-hidden
            >
              {state === 'complete' ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-foreground">{step.label}</p>
              {step.description && (
                <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{step.description}</p>
              )}
            </div>
          </div>
        );

        return (
          <li key={step.key} className={cn(isVertical && 'list-none', !isVertical && 'shrink-0')}>
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                className={cn('w-full rounded-xl text-left', VOICE_PRESS_CLASS, VOICE_FOCUS_RING)}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                {inner}
              </button>
            ) : (
              <div aria-current={state === 'current' ? 'step' : undefined}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
