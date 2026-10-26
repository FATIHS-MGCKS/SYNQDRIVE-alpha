import { cn } from '../ui/utils';
import { Skeleton } from '../ui/skeleton';
import { SkeletonCard, SkeletonMetricGrid, SkeletonRows } from '../patterns';
import { VOICE_PANEL_CLASS } from './voice-ui.tokens';

export interface VoiceSkeletonProps {
  variant?: 'hero' | 'metrics' | 'list' | 'card';
  className?: string;
}

/** Voice-shaped loading placeholders — no spinners on primary surfaces. */
export function VoiceSkeleton({ variant = 'card', className }: VoiceSkeletonProps) {
  if (variant === 'hero') {
    return (
      <div className={cn(VOICE_PANEL_CLASS, 'p-5', className)} aria-hidden>
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-2/3 max-w-sm" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'metrics') {
    return <SkeletonMetricGrid count={4} className={className} cardClassName="rounded-xl" />;
  }

  if (variant === 'list') {
    return <SkeletonRows rows={6} className={cn(VOICE_PANEL_CLASS, 'rounded-2xl p-4', className)} />;
  }

  return <SkeletonCard surface="premium" className={cn('rounded-2xl', className)} />;
}

export interface VoiceSkeletonGridProps {
  count?: number;
  className?: string;
}

export function VoiceSkeletonGrid({ count = 4, className }: VoiceSkeletonGridProps) {
  return <SkeletonMetricGrid count={count} className={className} cardClassName="rounded-xl" />;
}
