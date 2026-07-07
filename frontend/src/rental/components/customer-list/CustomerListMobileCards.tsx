import type { ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileMinus2,
  Mail,
  MapPin,
  Phone,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { StatusChip, type StatusTone } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { CustomerListRow } from '../../lib/customer-list-ui';
import {
  customerVerificationCardBadgeLabelDe,
  formatCustomerAddressLines,
  rentalClearanceBadgeTone,
  rentalClearanceMobileLabel,
  rentalClearanceTooltip,
} from '../../lib/customer-list-ui';
import {
  customerRiskTone,
  customerStatusTone,
  customerVerificationTone,
} from '../customer-detail/customer-detail-ui';

interface CustomerListMobileCardsProps {
  customers: CustomerListRow[];
  onSelect: (customer: CustomerListRow) => void;
  className?: string;
}

const MOBILE_CHIP_CLASS =
  'h-7 rounded-full px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap';

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

function riskChipTone(risk: CustomerListRow['riskLevel']): StatusTone {
  if (risk === 'Not Assessed') return 'neutral';
  return customerRiskTone(risk);
}

function verificationChipTone(status: CustomerUiVerification | string | undefined): StatusTone {
  if (!status || status === 'Not Submitted') return 'noData';
  return customerVerificationTone(status);
}

function getVerificationChipMeta(prefix: 'ID' | 'DL', status?: string) {
  const ui = status as CustomerUiVerification | undefined;
  const tone = verificationChipTone(ui);
  const title = customerVerificationCardBadgeLabelDe(prefix, ui);
  const ariaLabel = title;

  let IconComponent: LucideIcon;
  switch (ui) {
    case 'Verified':
      IconComponent = CheckCircle2;
      break;
    case 'Rejected':
      IconComponent = XCircle;
      break;
    case 'Expired':
      IconComponent = AlertCircle;
      break;
    case 'Pending Review':
      IconComponent = Clock3;
      break;
    default:
      IconComponent = FileMinus2;
  }

  return {
    tone,
    icon: <IconComponent className="size-3 shrink-0" aria-hidden />,
    visibleLabel: prefix,
    title,
    ariaLabel,
  };
}

function ContactIconLine({
  icon: Icon,
  label,
  value,
  href,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  href?: string;
  children?: ReactNode;
}) {
  if (!children && !value?.trim()) return null;

  const valueClass = 'text-[12px] leading-snug text-muted-foreground';

  const content =
    children ??
    (href ? (
      <a
        href={href}
        className={cn(valueClass, 'block min-w-0 truncate hover:text-foreground')}
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        {value}
      </a>
    ) : (
      <span className={cn(valueClass, 'block min-w-0')} title={value}>
        {value}
      </span>
    ));

  return (
    <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <div className="min-w-0">
        <span className="sr-only">{label}</span>
        {content}
      </div>
    </div>
  );
}

function VerificationChip({ prefix, status }: { prefix: 'ID' | 'DL'; status?: string }) {
  const meta = getVerificationChipMeta(prefix, status);

  return (
    <StatusChip
      tone={meta.tone}
      icon={meta.icon}
      className={MOBILE_CHIP_CLASS}
      title={meta.title}
    >
      <span aria-label={meta.ariaLabel}>{meta.visibleLabel}</span>
    </StatusChip>
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
            className="sq-card w-full rounded-2xl p-3.5 text-left transition-colors hover:bg-muted/25 sm:p-4"
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
                  <p
                    className="min-w-0 flex-1 truncate pt-0.5 text-[13px] font-semibold leading-tight text-foreground"
                    title={customer.name}
                  >
                    {customer.name}
                  </p>

                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip
                      tone={customerStatusTone(customer.status)}
                      className={MOBILE_CHIP_CLASS}
                    >
                      {customerStatusUiLabelDe(customer.status)}
                    </StatusChip>
                    <VerificationChip prefix="ID" status={customer.idVerificationStatus} />
                    <VerificationChip prefix="DL" status={customer.licenseVerificationStatus} />
                    <ChevronRight
                      className="ml-0.5 size-4 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                  </div>
                </div>

                <div className="mt-2.5 flex items-start gap-2.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <ContactIconLine
                      icon={Mail}
                      label="Mail"
                      value={customer.email}
                      href={customer.email ? `mailto:${customer.email}` : undefined}
                    />
                    <ContactIconLine
                      icon={Phone}
                      label="Telefon"
                      value={customer.phone}
                      href={customer.phone ? `tel:${customer.phone.replace(/\s/g, '')}` : undefined}
                    />
                    {addressLines.hasAny ? (
                      <ContactIconLine icon={MapPin} label="Adresse">
                        <div title={customer.displayAddress}>
                          {addressLines.street ? (
                            <p className="text-[12px] leading-snug text-muted-foreground">
                              {addressLines.street}
                            </p>
                          ) : null}
                          {addressLines.locality ? (
                            <p className="pl-3 text-[12px] leading-snug text-muted-foreground">
                              {addressLines.locality}
                            </p>
                          ) : null}
                        </div>
                      </ContactIconLine>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusChip tone={riskChipTone(customer.riskLevel)} className={MOBILE_CHIP_CLASS}>
                      {customerRiskUiLabelDe(customer.riskLevel)}
                    </StatusChip>

                    {clearanceLabel ? (
                      <StatusChip
                        tone={rentalClearanceBadgeTone(customer.rentalClearance?.status)}
                        className={MOBILE_CHIP_CLASS}
                        title={clearanceTitle}
                      >
                        {clearanceLabel}
                      </StatusChip>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
