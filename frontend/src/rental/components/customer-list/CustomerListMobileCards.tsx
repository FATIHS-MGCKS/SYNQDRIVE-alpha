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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { cn } from '../../../components/ui/utils';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
  customerVerificationUiLabelDe,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { CustomerListRow } from '../../lib/customer-list-ui';
import {
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

const CONTACT_VALUE_CLASS = 'text-[11px] leading-[1.25] text-muted-foreground';

const TOOLTIP_CONTENT_CLASS =
  'max-w-[220px] border border-border/60 bg-popover px-2.5 py-2 text-popover-foreground shadow-md';

interface TooltipCopy {
  title: string;
  status?: string;
  description: string;
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

function riskChipTone(risk: CustomerListRow['riskLevel']): StatusTone {
  if (risk === 'Not Assessed') return 'neutral';
  return customerRiskTone(risk);
}

function verificationChipTone(status: CustomerUiVerification | string | undefined): StatusTone {
  if (!status || status === 'Not Submitted') return 'noData';
  return customerVerificationTone(status);
}

function verificationStatusLabelDe(ui: CustomerUiVerification | string | undefined): string {
  const base = customerVerificationUiLabelDe(ui);
  return base === 'In Prüfung' ? 'Prüfung offen' : base;
}

function getVerificationIcon(ui: CustomerUiVerification | string | undefined): LucideIcon {
  switch (ui) {
    case 'Verified':
      return CheckCircle2;
    case 'Rejected':
      return XCircle;
    case 'Expired':
      return AlertCircle;
    case 'Pending Review':
      return Clock3;
    default:
      return FileMinus2;
  }
}

function renderVerificationTooltip(prefix: 'ID' | 'DL', status?: string): TooltipCopy {
  const ui = status as CustomerUiVerification | undefined;
  const statusLabel = verificationStatusLabelDe(ui);
  const doc = prefix === 'ID' ? 'Ausweisdokument' : 'Führerschein';

  switch (ui) {
    case 'Verified':
      return {
        title: `${prefix}-Status`,
        status: 'Verifiziert',
        description: `${doc} erfolgreich geprüft.`,
      };
    case 'Pending Review':
      return {
        title: `${prefix}-Status`,
        status: statusLabel,
        description: 'Das Dokument wurde eingereicht und wird geprüft.',
      };
    case 'Rejected':
      return {
        title: `${prefix}-Status`,
        status: 'Abgelehnt',
        description: `Das eingereichte ${prefix === 'ID' ? 'Ausweisdokument' : 'Führerscheindokument'} wurde nicht akzeptiert.`,
      };
    case 'Expired':
      return {
        title: `${prefix}-Status`,
        status: 'Abgelaufen',
        description: `Das ${prefix === 'ID' ? 'Dokument ist' : 'Dokument ist'} nicht mehr gültig.`,
      };
    default:
      return {
        title: `${prefix}-Status`,
        status: statusLabel,
        description:
          prefix === 'ID'
            ? 'Es wurde noch kein Ausweisdokument eingereicht.'
            : 'Es wurde noch kein Führerscheindokument eingereicht.',
      };
  }
}

function renderRiskTooltip(risk: CustomerListRow['riskLevel']): TooltipCopy {
  if (risk === 'Not Assessed') {
    return {
      title: 'Risikobewertung',
      status: 'Keine Risikobewertung',
      description:
        'Es liegt derzeit noch keine Risikobewertung für diesen Kunden vor. Sobald eine Bewertung durchgeführt wurde, wird der Risikostatus hier angezeigt.',
    };
  }

  return {
    title: 'Risikobewertung',
    status: customerRiskUiLabelDe(risk),
    description: 'Operative Risikoeinstufung für diesen Kunden.',
  };
}

function renderClearanceTooltip(customer: CustomerListRow): TooltipCopy {
  const clearance = customer.rentalClearance;
  const label = rentalClearanceMobileLabel(clearance);
  const reasons = rentalClearanceTooltip(clearance?.reasons);

  if (!clearance || !label) {
    return {
      title: 'Mietfreigabe',
      status: 'Keine Mietfreigabe',
      description:
        'Der Kunde ist aktuell nicht für eine Mietfreigabe freigegeben. Prüfe Verifikation, Dokumente oder Freigabestatus.',
    };
  }

  if (reasons) {
    return {
      title: 'Mietfreigabe',
      status: label,
      description: reasons,
    };
  }

  if (clearance.status === 'CLEARED') {
    return {
      title: 'Mietfreigabe',
      status: label,
      description: 'Der Kunde ist für eine Mietfreigabe freigegeben.',
    };
  }

  if (clearance.status === 'REVIEW_REQUIRED') {
    return {
      title: 'Mietfreigabe',
      status: label,
      description: 'Es fehlen noch Prüfungen oder Hinweise vor der vollständigen Freigabe.',
    };
  }

  if (clearance.status === 'PENDING') {
    return {
      title: 'Mietfreigabe',
      status: label,
      description: 'Der Kunde ist nur eingeschränkt freigegeben.',
    };
  }

  return {
    title: 'Mietfreigabe',
    status: label,
    description:
      'Der Kunde ist aktuell nicht für eine Mietfreigabe freigegeben. Prüfe Verifikation, Dokumente oder Freigabestatus.',
  };
}

function ChipTooltip({
  copy,
  children,
}: {
  copy: TooltipCopy;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className={TOOLTIP_CONTENT_CLASS}>
        <p className="text-[11px] font-semibold leading-tight">{copy.title}</p>
        {copy.status ? (
          <p className="mt-0.5 text-[11px] font-medium leading-tight">{copy.status}</p>
        ) : null}
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{copy.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ContactIconLine({
  icon: Icon,
  label,
  value,
  href,
  truncate = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  href?: string;
  truncate?: boolean;
  children?: ReactNode;
}) {
  if (!children && !value?.trim()) return null;

  const content =
    children ??
    (href ? (
      <a
        href={href}
        className={cn(
          CONTACT_VALUE_CLASS,
          'block min-w-0 hover:text-foreground',
          truncate && 'truncate',
        )}
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        {value}
      </a>
    ) : (
      <span
        className={cn(CONTACT_VALUE_CLASS, 'block min-w-0', truncate && 'truncate')}
        title={value}
      >
        {value}
      </span>
    ));

  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-1.5">
      <Icon className="mt-px size-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <div className="min-w-0">
        <span className="sr-only">{label}</span>
        {content}
      </div>
    </div>
  );
}

function VerificationChip({ prefix, status }: { prefix: 'ID' | 'DL'; status?: string }) {
  const ui = status as CustomerUiVerification | undefined;
  const tone = verificationChipTone(ui);
  const IconComponent = getVerificationIcon(ui);
  const ariaLabel = `${prefix}: ${verificationStatusLabelDe(ui)}`;

  return (
    <ChipTooltip copy={renderVerificationTooltip(prefix, status)}>
      <StatusChip tone={tone} className={MOBILE_CHIP_CLASS}>
        <span className="inline-flex items-center gap-1" aria-label={ariaLabel}>
          <span>{prefix}</span>
          <IconComponent className="size-3 shrink-0" aria-hidden />
        </span>
      </StatusChip>
    </ChipTooltip>
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

        return (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="surface-premium w-full rounded-2xl p-3.5 text-left transition-colors hover:bg-muted/25 sm:p-4"
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
                  <div className="min-w-0 flex-1 space-y-1">
                    <ContactIconLine
                      icon={Mail}
                      label="Mail"
                      value={customer.email}
                      href={customer.email ? `mailto:${customer.email}` : undefined}
                      truncate
                    />
                    <ContactIconLine
                      icon={Phone}
                      label="Telefon"
                      value={customer.phone}
                      href={customer.phone ? `tel:${customer.phone.replace(/\s/g, '')}` : undefined}
                    />
                    {addressLines.hasAny ? (
                      <div className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-1.5">
                        <MapPin
                          className="mt-px size-3 shrink-0 text-muted-foreground/70"
                          aria-hidden
                        />
                        <div className="min-w-0" title={customer.displayAddress}>
                          <span className="sr-only">Adresse</span>
                          {addressLines.street ? (
                            <p className={CONTACT_VALUE_CLASS}>{addressLines.street}</p>
                          ) : null}
                          {addressLines.locality ? (
                            <p className={CONTACT_VALUE_CLASS}>{addressLines.locality}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <ChipTooltip copy={renderRiskTooltip(customer.riskLevel)}>
                      <StatusChip
                        tone={riskChipTone(customer.riskLevel)}
                        className={MOBILE_CHIP_CLASS}
                      >
                        {customerRiskUiLabelDe(customer.riskLevel)}
                      </StatusChip>
                    </ChipTooltip>

                    {clearanceLabel ? (
                      <ChipTooltip copy={renderClearanceTooltip(customer)}>
                        <StatusChip
                          tone={rentalClearanceBadgeTone(customer.rentalClearance?.status)}
                          className={MOBILE_CHIP_CLASS}
                        >
                          {clearanceLabel}
                        </StatusChip>
                      </ChipTooltip>
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
