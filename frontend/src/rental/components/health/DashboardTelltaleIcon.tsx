import { cn } from '../../../components/ui/utils';
import { resolveDashboardTelltaleIcon } from '../../lib/dashboard-warning-lights-display';
import { Icon } from '../ui/Icon';

export interface DashboardTelltaleIconProps {
  telltaleKey: string;
  className?: string;
}

/** Canonical dashboard telltale icon — specific SVG when mapped, generic warning otherwise. */
export function DashboardTelltaleIcon({ telltaleKey, className }: DashboardTelltaleIconProps) {
  const resolution = resolveDashboardTelltaleIcon(telltaleKey);
  if (resolution.kind === 'specific' && resolution.src) {
    return (
      <img
        src={resolution.src}
        alt=""
        aria-hidden
        className={cn('object-contain', className)}
      />
    );
  }
  return <Icon name={resolution.genericIconName} aria-hidden className={className} />;
}
