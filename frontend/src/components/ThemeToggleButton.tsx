import { Monitor, Moon, Sun } from 'lucide-react';
import { themePreferenceLabel, type ThemePreference } from '../lib/theme';
import { cn } from './ui/utils';

interface ThemeToggleButtonProps {
  preference: ThemePreference;
  onCycle: () => void;
  className?: string;
  iconClassName?: string;
}

export function ThemeToggleButton({
  preference,
  onCycle,
  className,
  iconClassName = 'h-4 w-4',
}: ThemeToggleButtonProps) {
  const label = themePreferenceLabel(preference);
  const Icon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={onCycle}
      className={cn(
        'sq-press flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 ease-out hover:bg-muted hover:text-foreground',
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Icon className={cn(iconClassName, 'transition-transform duration-300 ease-out')} />
    </button>
  );
}
