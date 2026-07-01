import { getStressTone, type StressLevel } from '../../lib/scoreFormat';

const STROKE: Record<ReturnType<typeof getStressTone>, string> = {
  success: 'color-mix(in srgb, var(--success) 75%, transparent)',
  neutral: 'color-mix(in srgb, var(--brand) 55%, var(--muted-foreground))',
  warning: 'color-mix(in srgb, var(--warning) 80%, transparent)',
  critical: 'color-mix(in srgb, var(--destructive) 75%, transparent)',
  muted: 'var(--border)',
};

interface StressDonutProps {
  score: number;
  level: StressLevel;
  size?: number;
  className?: string;
}

export function StressDonut({ score, level, size = 80, className }: StressDonutProps) {
  const tone = getStressTone(level);
  const pct = Math.min(100, Math.max(0, score));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div
      className={`relative shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="7"
          opacity={0.55}
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[15px] font-bold tabular-nums leading-none text-foreground">
          {Math.round(score)}
        </span>
        <span className="mt-0.5 text-[8px] font-medium text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
