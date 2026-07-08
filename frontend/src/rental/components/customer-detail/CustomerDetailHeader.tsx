import {
  ArrowLeft,
  FileUp,
  Mail,
  Phone,
  Plus,
  Shield,
  StickyNote,
} from 'lucide-react';

import type { StatusTone } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import {
  customerRiskUiLabelDe,
  customerStatusUiLabelDe,
  customerVerificationUiLabelDe,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { CustomerListRow } from './customerDetailTypes';
import {
  cdv,
  customerDetailTitleClass,
  customerRiskTone,
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
  onCreateBooking?: () => void;
  onOpenDocuments: () => void;
  onAddNote: () => void;
  onOpenStatusModal: () => void;
  onOpenRiskModal: () => void;
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
  onCreateBooking,
  onOpenDocuments,
  onAddNote,
  onOpenStatusModal,
  onOpenRiskModal,
  onStatusShortcut,
}: CustomerDetailHeaderProps) {
  const statusShortcut = resolveCustomerStatusAction(displayStatus);
  const customerTypeLabel = displayType === 'Corporate' ? 'Firma' : 'Privat';
  const customerSinceLabel = formatDate(customerSince);

  return (
    <div className={cdv.headerCard}>
      <div className={cdv.headerInner}>
        <button type="button" onClick={onBack} className={cdv.backLink}>
          <ArrowLeft className="size-3.5" />
          Kunden
        </button>

        <div className={cdv.heroTitleRow}>
          <div className={cdv.heroTitleBlock}>
            <h1 className={customerDetailTitleClass()}>{displayName}</h1>
            <div className={cdv.metaRow}>
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
          <StatusChip
            tone={rentalClearanceTone}
            dot
            title={rentalClearanceTitle ?? undefined}
            className="w-full justify-center sm:justify-start"
          >
            Mietfreigabe: {rentalClearanceLabel}
          </StatusChip>
          <StatusChip tone={customerRiskTone(displayRisk)} dot className="w-full justify-center sm:justify-start">
            Risiko: {customerRiskUiLabelDe(displayRisk)}
          </StatusChip>
          <StatusChip
            tone={customerVerificationTone(idVerificationUi)}
            dot
            className="w-full justify-center sm:justify-start"
          >
            Ausweis: {customerVerificationUiLabelDe(idVerificationUi)}
          </StatusChip>
          <StatusChip
            tone={customerVerificationTone(licenseVerificationUi)}
            dot
            className="w-full justify-center sm:justify-start"
          >
            FS: {customerVerificationUiLabelDe(licenseVerificationUi)}
          </StatusChip>
        </div>

        <div className={cdv.heroActionGrid}>
          {onCreateBooking ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              className={cdv.heroActionButton}
              onClick={onCreateBooking}
            >
              <Plus className="size-3.5" />
              Neue Buchung
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="neutral"
            className={cdv.heroActionButton}
            onClick={onOpenDocuments}
          >
            <FileUp className="size-3.5" />
            Dokument hochladen
          </Button>
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
          <Button
            type="button"
            size="sm"
            variant="warning"
            className={cdv.heroActionButton}
            onClick={onOpenStatusModal}
          >
            Status ändern
          </Button>
          <Button
            type="button"
            size="sm"
            variant="warning"
            className={cdv.heroActionButton}
            onClick={onOpenRiskModal}
          >
            <Shield className="size-3.5" />
            Risiko setzen
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
          {phone ? (
            <Button
              type="button"
              size="sm"
              variant="neutral"
              className={cn(cdv.heroActionButton, cdv.heroActionFull)}
              asChild
            >
              <a href={`tel:${phone.replace(/\s/g, '')}`}>
                <Phone className="size-3.5" />
                Kontakt
              </a>
            </Button>
          ) : email ? (
            <Button
              type="button"
              size="sm"
              variant="neutral"
              className={cn(cdv.heroActionButton, cdv.heroActionFull)}
              asChild
            >
              <a href={`mailto:${email}`}>
                <Mail className="size-3.5" />
                Kontakt
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
