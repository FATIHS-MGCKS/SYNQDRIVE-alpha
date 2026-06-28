import { ChevronRight } from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
} from '../../lib/entityMappers';
import { formatStressScore, stressToneToStatusTone } from '../../lib/scoreFormat';
import {
  customerRiskTone,
  customerStatusTone,
} from '../customer-detail/customer-detail-ui';

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  hasEnoughData?: boolean;
  totalBookings: number;
  totalRevenue: string;
  lastTrip: string;
  idVerified: boolean;
}

interface CustomerListMobileCardsProps {
  customers: CustomerListRow[];
  onSelect: (customer: CustomerListRow) => void;
}

function avatarTone(status: CustomerListRow['status']): string {
  if (status === 'Active') return 'sq-tone-brand';
  if (status === 'Under Review') return 'sq-tone-warning';
  if (status === 'Suspended' || status === 'Blocked') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

export function CustomerListMobileCards({ customers, onSelect }: CustomerListMobileCardsProps) {
  return (
    <div className="space-y-2 lg:hidden">
      {customers.map((customer) => {
        const stress = formatStressScore(customer.drivingStressScore, {
          hasEnoughData: customer.hasEnoughData ?? true,
          level: customer.stressLevel ?? undefined,
        });
        return (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="sq-card w-full p-3 text-left transition-colors hover:bg-muted/25"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold uppercase ${avatarTone(customer.status)}`}
              >
                {customer.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">{customer.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {customer.email || customer.phone || '—'}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <StatusChip tone={customerStatusTone(customer.status)} className="text-[10px]">
                    {customerStatusUiLabelDe(customer.status)}
                  </StatusChip>
                  <StatusChip tone={customerRiskTone(customer.riskLevel)} className="text-[10px]">
                    {customerRiskUiLabelDe(customer.riskLevel)}
                  </StatusChip>
                  {!stress.isMissing ? (
                    <StatusChip tone={stressToneToStatusTone(stress.tone)} className="text-[10px]">
                      {stress.label}
                    </StatusChip>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] tabular-nums text-muted-foreground">
                  <span>{customer.totalBookings} Buch.</span>
                  <span className="truncate">{customer.totalRevenue}</span>
                  <span className="truncate text-right">{customer.lastTrip}</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
