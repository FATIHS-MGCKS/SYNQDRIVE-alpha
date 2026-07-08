import { ArrowLeft, Mail, Phone, StickyNote } from 'lucide-react';

import type { StatusTone } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import {
  customerStatusUiLabelDe,
  customerVerificationUiLabelDe,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { CustomerListRow } from './customerDetailTypes';
import {
  cdv,
  customerDetailTitleClass,
  customerRiskHeaderLabelDe,
  customerRiskHeaderTone,
  customerStatusTone,
  customerVerificationTone,
  resolveCustomerStatusAction,
} from './customer-detail-ui';
import { formatDate } from './customerDetailUtils';

interface CustomerDetailHeaderProps {
  displayName: string;
  shortId: string;
  displayType: CustomerListRow['type'];
  customerSince?: string | null;
  displayStatus: CustomerListRow['status'];
  displayRisk: CustomerListRow['riskLevel'];
  idVerificationUi: CustomerUiVerification;
  licenseVerificationUi: CustomerUiVerification;
  rentalClearanceLabel: string;
  rentalClearanceTone: StatusTone;
  rentalClearanceTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  statusShortcutSaving?: boolean;
  onBack: () => void;
  onAddNote: () => void;
  onStatusShortcut?: (next: CustomerListRow['status']) => void;
}

export function CustomerDetailHeader({
  displayName,
  shortId,
  displayType,
  customerSince,
  displayStatus,
  displayRisk,
  idVerificationUi,
  licenseVerificationUi,
  rentalClearanceLabel,
  rentalClearanceTone,
  rentalClearanceTitle,
  phone,
  email,
  statusShortcutSaving,
  onBack,
  onAddNote,
  onStatusShortcut,
}: CustomerDetailHeaderProps) {
  const statusShortcut = resolveCustomerStatusAction(displayStatus);
  const customerTypeLabel = displayType === 'Corporate' ? 'Firma' : 'Privat';
  const customerSinceLabel = formatDate(customerSince);
  const hasContact = Boolean(phone || email);

  return (
    <div className={cdv.headerCard}>
      <div className={cdv.headerInner}>
        <button type="button" onClick={onBack} className={cdv.backLink}>
          <ArrowLeft className="size-3.5" />
          Kunden
        </button>

        <div className={cdv.heroTopRow}>
          <div className={cdv.heroTitleBlock}>
            <h1 className={customerDetailTitleClass()}>{displayName}</h1>
            <div className={cdv.heroMetaRow}>
              <span className="font-mono tabular-nums">CID-{shortId}</span>
              <span aria-hidden className={cdv.metaSeparator}>
                •
              </span>
              <span>{customerTypeLabel}</span>
              <span aria-hidden className={cdv.metaSeparator}>
                •
              </span>
              <span>Kunde seit {customerSinceLabel}</span>
            </div>
          </div>
          <div className={cdv.heroStatusChip}>
            <StatusChip tone={customerStatusTone(displayStatus)} dot>
              {customerStatusUiLabelDe(displayStatus)}
            </StatusChip>
          </div>
        </div>

        <div className={cdv.heroBadgeGrid}>
          <div className={cdv.heroBadgeCell}>
            <StatusChip
              tone={rentalClearanceTone}
              dot
              title={rentalClearanceTitle ?? undefined}
              className={cdv.heroBadgeChip}
            >
              Mietfreigabe: {rentalClearanceLabel}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip
              tone={customerVerificationTone(idVerificationUi)}
              dot
              className={cdv.heroBadgeChip}
            >
              Ausweis: {customerVerificationUiLabelDe(idVerificationUi)}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip tone={customerRiskHeaderTone(displayRisk)} dot className={cdv.heroBadgeChip}>
              Risiko: {customerRiskHeaderLabelDe(displayRisk)}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip
              tone={customerVerificationTone(licenseVerificationUi)}
              dot
              className={cdv.heroBadgeChip}
            >
              FS: {customerVerificationUiLabelDe(licenseVerificationUi)}
            </StatusChip>
          </div>
        </div>

        <div className={cdv.heroActionGrid}>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            className={cdv.heroActionButton}
            onClick={onAddNote}
          >
            <StickyNote className="size-3.5" />
            Notiz hinzufügen
          </Button>
          {statusShortcut && onStatusShortcut ? (
            <Button
              type="button"
              size="sm"
              variant={statusShortcut.variant}
              className={cdv.heroActionButton}
              disabled={statusShortcutSaving}
              onClick={() => onStatusShortcut(statusShortcut.nextStatus)}
            >
              {statusShortcutSaving ? 'Speichert…' : statusShortcut.label}
            </Button>
          ) : null}
          {hasContact ? (
            phone ? (
              <Button
                type="button"
                size="sm"
                variant="neutral"
                className={cn(cdv.heroActionButton, cdv.heroActionFullRow)}
                asChild
              >
                <a href={`tel:${phone.replace(/\s/g, '')}`}>
                  <Phone className="size-3.5" />
                  Kontakt
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="neutral"
                className={cn(cdv.heroActionButton, cdv.heroActionFullRow)}
                asChild
              >
                <a href={`mailto:${email}`}>
                  <Mail className="size-3.5" />
                  Kontakt
                </a>
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
