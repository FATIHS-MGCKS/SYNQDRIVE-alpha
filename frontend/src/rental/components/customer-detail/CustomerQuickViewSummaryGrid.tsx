import { Calendar, Car, Gauge, Receipt } from 'lucide-react';
import { VehicleBookingSummaryCard } from '../vehicle-bookings/VehicleBookingSummaryCard';
import type { StatusTone } from '../../../components/patterns';
import { cqv } from './customer-quick-view-ui';
import { EM_DASH } from './customerDetailUtils';

interface CustomerQuickViewSummaryGridProps {
  totalBookings: number;
  totalKmDriven: number;
  revenueLabel: string;
  revenueSubdued: boolean;
  stressLabel: string;
  stressSubdued: boolean;
  stressTone?: StatusTone;
}

export function CustomerQuickViewSummaryGrid({
  totalBookings,
  totalKmDriven,
  revenueLabel,
  revenueSubdued,
  stressLabel,
  stressSubdued,
  stressTone,
}: CustomerQuickViewSummaryGridProps) {
  const kmLabel =
    totalKmDriven > 0 ? totalKmDriven.toLocaleString('de-DE') : EM_DASH;
  const kmUnit = totalKmDriven > 0 ? 'km' : undefined;

  return (
    <div className={cqv.summaryGrid}>
      <VehicleBookingSummaryCard
        label="Buchungen"
        value={String(totalBookings)}
        icon={<Calendar />}
        valueVariant="numeric"
        subdued={totalBookings === 0}
      />
      <VehicleBookingSummaryCard
        label="Kilometer"
        value={kmLabel}
        unit={kmUnit}
        icon={<Car />}
        valueVariant="numeric"
        subdued={totalKmDriven <= 0}
      />
      <VehicleBookingSummaryCard
        label="Umsatz"
        value={revenueLabel}
        icon={<Receipt />}
        valueVariant="numeric"
        subdued={revenueSubdued}
      />
      <VehicleBookingSummaryCard
        label="Fahrbelastung"
        value={stressLabel}
        icon={<Gauge />}
        valueVariant="status"
        status={stressTone}
        subdued={stressSubdued}
      />
    </div>
  );
}
