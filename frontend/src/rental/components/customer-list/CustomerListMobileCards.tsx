import { ChevronRight } from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
} from '../../lib/entityMappers';
import type { CustomerListRow } from '../../lib/customer-list-ui';
import {
  customerVerificationBadgeTone,
  customerVerificationCardBadgeLabelDe,
  rentalClearanceBadgeTone,
  rentalClearanceTooltip,
} from '../../lib/customer-list-ui';
import { formatStressScore, stressToneToStatusTone } from '../../lib/scoreFormat';
import {
  customerRiskTone,
  customerStatusTone,
} from '../customer-detail/customer-detail-ui';

interface CustomerListMobileCardsProps {
  customers: CustomerListRow[];
  onSelect: (customer: CustomerListRow) => void;
  className?: string;
}

function avatarTone(status: CustomerListRow['status']): string {
  if (status === 'Active') return 'sq-tone-brand';
  if (status === 'Under Review') return 'sq-tone-warning';
  if (status === 'Suspended' || status === 'Blocked') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
}

function ContactLine({
  label,
  value,
  href,
}: {
  label: string;
  value?: string;
  href?: string;
}) {
  if (!value?.trim()) return null;
  const text = (
    <span className="block truncate text-[11px] text-muted-foreground" title={value}>
      {value}
    </span>
  );
  return (
    <div className="min-w-0">
      <span className="sr-only">{label}: </span>
      {href ? (
        <a
          href={href}
          className="block truncate text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title={value}
        >
          {value}
        </a>
      ) : (
        text
      )}
    </div>
  );
}

export function CustomerListMobileCards({
  customers,
  onSelect,
  className,
}: CustomerListMobileCardsProps) {
  return (
    <div className={cn('space-y-2 lg:hidden', className)}>
      {customers.map((customer) => {
        const stress = formatStressScore(customer.drivingStressScore, {
          hasEnoughData: customer.hasEnoughData ?? true,
          level: customer.stressLevel ?? undefined,
        });
        const clearance = customer.rentalClearance;
        const clearanceTitle = rentalClearanceTooltip(clearance?.reasons);

        return (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="sq-card w-full p-3 text-left transition-colors hover:bg-muted/25"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold uppercase',
                  avatarTone(customer.status),
                )}
                aria-hidden
              >
                {initials(customer.name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground"
                        title={customer.name}
                      >
                        {customer.name}
                      </p>
                      <div className="flex max-w-[52%] shrink-0 flex-wrap justify-end gap-1">
                        <StatusChip
                          tone={customerStatusTone(customer.status)}
                          className="text-[10px]"
                        >
                          {customerStatusUiLabelDe(customer.status)}
                        </StatusChip>
                        <StatusChip
                          tone={customerRiskTone(customer.riskLevel)}
                          className="text-[10px]"
                        >
                          {customerRiskUiLabelDe(customer.riskLevel)}
                        </StatusChip>
                      </div>
                    </div>

                    <div className="mt-1 space-y-0.5">
                      <ContactLine label="E-Mail" value={customer.email} href={`mailto:${customer.email}`} />
                      <ContactLine
                        label="Telefon"
                        value={customer.phone}
                        href={customer.phone ? `tel:${customer.phone.replace(/\s/g, '')}` : undefined}
                      />
                      {customer.displayAddress ? (
                        <p
                          className="line-clamp-2 text-[11px] leading-snug text-muted-foreground"
                          title={customer.displayAddress}
                        >
                          {customer.displayAddress}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  <StatusChip
                    tone={customerVerificationBadgeTone(customer.idVerificationStatus)}
                    className="text-[10px]"
                    title={customerVerificationCardBadgeLabelDe('ID', customer.idVerificationStatus)}
                  >
                    {customerVerificationCardBadgeLabelDe('ID', customer.idVerificationStatus)}
                  </StatusChip>
                  <StatusChip
                    tone={customerVerificationBadgeTone(customer.licenseVerificationStatus)}
                    className="text-[10px]"
                    title={customerVerificationCardBadgeLabelDe('DL', customer.licenseVerificationStatus)}
                  >
                    {customerVerificationCardBadgeLabelDe('DL', customer.licenseVerificationStatus)}
                  </StatusChip>
                  {clearance ? (
                    <StatusChip
                      tone={rentalClearanceBadgeTone(clearance.status)}
                      className="text-[10px]"
                      title={clearanceTitle}
                    >
                      {clearance.label}
                    </StatusChip>
                  ) : null}
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
