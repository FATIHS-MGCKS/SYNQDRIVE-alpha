import { StatusChip } from '../../../components/patterns';
import {
  riskCategoryLabel,
  riskSeverityTone,
  type VehicleBookingRiskItem,
} from '../../lib/vehicle-booking-risk.utils';
import { Icon } from '../ui/Icon';

interface VehicleBookingRiskChipsProps {
  items: VehicleBookingRiskItem[];
  className?: string;
  maxVisible?: number;
}

export function VehicleBookingRiskChips({
  items,
  className = '',
  maxVisible = 6,
}: VehicleBookingRiskChipsProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const hiddenCount = items.length - visible.length;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {visible.map((item) => (
        <RiskChip key={item.id} item={item} />
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-border/60 text-[9px] font-medium text-muted-foreground bg-muted/20">
          +{hiddenCount} weitere
        </span>
      )}
    </div>
  );
}

function RiskChip({ item }: { item: VehicleBookingRiskItem }) {
  return (
    <span
      className="inline-flex items-center gap-1 max-w-[220px] rounded-md border border-border/50 bg-background/40 px-2 py-0.5"
      title={[riskCategoryLabel(item.category), item.hint].filter(Boolean).join(' · ')}
    >
      <Icon name={item.icon} className="w-3 h-3 shrink-0 text-muted-foreground" aria-hidden />
      <StatusChip tone={riskSeverityTone(item.severity)} className="text-[9px] px-1 py-0 shrink-0">
        {item.label}
      </StatusChip>
    </span>
  );
}
