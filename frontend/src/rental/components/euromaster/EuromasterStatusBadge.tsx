import { CheckCircle, Clock, Lock, XCircle, AlertTriangle, Wrench } from 'lucide-react';

interface Props {
  mode: string;
  size?: 'sm' | 'md';
  isDarkMode: boolean;
}

const MODE_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; colorClass: string }> = {
  Active: { label: 'Active', icon: CheckCircle, colorClass: 'text-emerald-500' },
  'Manual only': { label: 'Manual only', icon: Clock, colorClass: 'text-amber-500' },
  'Not assigned': { label: 'Not assigned', icon: XCircle, colorClass: 'text-gray-400' },
  Disabled: { label: 'Disabled', icon: XCircle, colorClass: 'text-gray-400' },
  'Authorization required': { label: 'Authorization required', icon: Lock, colorClass: 'text-amber-500' },
};

export function EuromasterStatusBadge({ mode, size = 'sm', isDarkMode }: Props) {
  const cfg = MODE_CONFIG[mode] ?? { label: mode, icon: AlertTriangle, colorClass: 'text-gray-400' };
  const Icon = cfg.icon;
  const isSmall = size === 'sm';

  return (
    <span className={`inline-flex items-center gap-1 ${isSmall ? 'text-[10px]' : 'text-xs'} font-medium ${cfg.colorClass}`}>
      <Icon className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {cfg.label}
    </span>
  );
}

interface ActionButtonProps {
  isDarkMode: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

export function EuromasterActionButton({
  isDarkMode,
  onClick,
  disabled = false,
  label = 'Euromaster',
  compact = false,
}: ActionButtonProps) {
  if (disabled) {
    return (
      <span className={`inline-flex items-center gap-1 ${compact ? 'px-2 py-0.5' : 'px-3 py-1'} text-[10px] font-semibold rounded-lg cursor-not-allowed ${
        isDarkMode ? 'bg-gray-700/50 text-gray-500' : 'bg-gray-100 text-gray-400'
      }`}>
        <Lock className="w-3 h-3" />
        {label}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 ${compact ? 'px-2 py-0.5' : 'px-3 py-1'} text-[10px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors`}
    >
      <Wrench className="w-3 h-3" />
      {label} →
    </button>
  );
}
