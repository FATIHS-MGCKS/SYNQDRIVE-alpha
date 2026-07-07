import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileMinus2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
} from '../../lib/entityMappers';
import type { CustomerListRow } from '../../lib/customer-list-ui';
import {
  customerRiskMobilePillClass,
  formatCustomerAddressLines,
  getVerificationBadgeMeta,
  rentalClearanceMobileLabel,
  rentalClearanceMobilePillClass,
  rentalClearanceTooltip,
  type VerificationIconKind,
} from '../../lib/customer-list-ui';
import { customerStatusTone } from '../customer-detail/customer-detail-ui';

interface CustomerListMobileCardsProps {
  customers: CustomerListRow[];
  onSelect: (customer: CustomerListRow) => void;
  className?: string;
}

const VERIFICATION_ICONS: Record<VerificationIconKind, LucideIcon> = {
  verified: CheckCircle2,
  rejected: XCircle,
  'not-submitted': FileMinus2,
  pending: Clock3,
  expired: AlertCircle,
};

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

function MobilePill({
  label,
  className,
  title,
}: {
  label: string;
  className: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight',
        className,
      )}
      title={title}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function VerificationIconBadge({ prefix, status }: { prefix: 'ID' | 'DL'; status?: string }) {
  const meta = getVerificationBadgeMeta(prefix, status);
  const Icon = VERIFICATION_ICONS[meta.kind];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
        meta.pillClass,
      )}
      title={meta.title}
      aria-label={meta.ariaLabel}
    >
      <span className="text-muted-foreground">{prefix}:</span>
      <Icon className={cn('size-3 shrink-0', meta.iconClass)} aria-hidden />
    </span>
  );
}

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value?: string;
  href?: string;
}) {
  if (!value?.trim()) return null;

  const valueNode = href ? (
    <a
      href={href}
      className="min-w-0 truncate text-[12px] leading-snug text-muted-foreground hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
      title={value}
    >
      {value}
    </a>
  ) : (
    <span className="min-w-0 truncate text-[12px] leading-snug text-muted-foreground" title={value}>
      {value}
    </span>
  );

  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
      <span className="pt-px text-[12px] font-semibold leading-snug text-foreground/85">{label}</span>
      <div className="min-w-0">{valueNode}</div>
    </div>
  );
}

function AddressRows({
  addressLines,
  fallbackTitle,
}: {
  addressLines: ReturnType<typeof formatCustomerAddressLines>;
  fallbackTitle?: string;
}) {
  if (!addressLines.hasAny) return null;

  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
      <span className="pt-px text-[12px] font-semibold leading-snug text-foreground/85">Adresse:</span>
      <div className="min-w-0 space-y-0.5" title={fallbackTitle}>
        {addressLines.street ? (
          <p className="truncate text-[12px] leading-snug text-muted-foreground">{addressLines.street}</p>
        ) : null}
        {addressLines.locality ? (
          <p className="truncate pl-3 text-[12px] leading-snug text-muted-foreground">{addressLines.locality}</p>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerListMobileCards({
  customers,
  onSelect,
  className,
}: CustomerListMobileCardsProps) {
  return (
    <div className={cn('space-y-2.5 lg:hidden', className)}>
      {customers.map((customer) => {
        const addressLines = formatCustomerAddressLines(customer);
        const clearanceLabel = rentalClearanceMobileLabel(customer.rentalClearance);
        const clearanceTitle = rentalClearanceTooltip(customer.rentalClearance?.reasons);

        return (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="sq-card w-full rounded-2xl p-3.5 text-left transition-colors hover:bg-muted/25"
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

              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px] font-semibold leading-tight text-foreground"
                    title={customer.name}
                  >
                    {customer.name}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    <ContactRow
                      label="Mail:"
                      value={customer.email}
                      href={customer.email ? `mailto:${customer.email}` : undefined}
                    />
                    <ContactRow
                      label="Tel:"
                      value={customer.phone}
                      href={customer.phone ? `tel:${customer.phone.replace(/\s/g, '')}` : undefined}
                    />
                    <AddressRows
                      addressLines={addressLines}
                      fallbackTitle={customer.displayAddress}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex max-w-[148px] flex-wrap items-center justify-end gap-1">
                    <StatusChip tone={customerStatusTone(customer.status)} className="text-[10px]">
                      {customerStatusUiLabelDe(customer.status)}
                    </StatusChip>
                    <VerificationIconBadge prefix="ID" status={customer.idVerificationStatus} />
                    <VerificationIconBadge prefix="DL" status={customer.licenseVerificationStatus} />
                  </div>

                  <MobilePill
                    label={customerRiskUiLabelDe(customer.riskLevel)}
                    className={customerRiskMobilePillClass(customer.riskLevel)}
                  />

                  {clearanceLabel ? (
                    <MobilePill
                      label={clearanceLabel}
                      className={rentalClearanceMobilePillClass(customer.rentalClearance?.status)}
                      title={clearanceTitle}
                    />
                  ) : null}
                </div>
              </div>

              <ChevronRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
