import {
  ArrowLeft,
  FileUp,
  Mail,
  Phone,
  Plus,
  Shield,
  StickyNote,
} from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
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
  resolveQuickViewStatusAction,
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
  const statusShortcut = resolveQuickViewStatusAction(displayStatus);

  return (
    <div className={cdv.headerCard}>
      <div className={cdv.headerInner}>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Kunden
        </button>

        <div className="mt-2 min-w-0">
          <h1 className={customerDetailTitleClass()}>{displayName}</h1>
          <div className={cdv.metaRow}>
            <span className="font-mono tabular-nums">CID-{shortId}</span>
            <span aria-hidden className="text-border">
              |
            </span>
            <span>{displayType === 'Corporate' ? 'Firma' : 'Privat'}</span>
            <span aria-hidden className="text-border">
              |
            </span>
            <span>Kunde seit {formatDate(customerSince)}</span>
          </div>
          <div className={cdv.badgeRow}>
            <StatusChip tone={customerStatusTone(displayStatus)} dot>
              {customerStatusUiLabelDe(displayStatus)}
            </StatusChip>
            <StatusChip tone={customerRiskTone(displayRisk)} dot>
              Risiko: {customerRiskUiLabelDe(displayRisk)}
            </StatusChip>
            <StatusChip tone={customerVerificationTone(idVerificationUi)} dot>
              Ausweis: {customerVerificationUiLabelDe(idVerificationUi)}
            </StatusChip>
            <StatusChip tone={customerVerificationTone(licenseVerificationUi)} dot>
              FS: {customerVerificationUiLabelDe(licenseVerificationUi)}
            </StatusChip>
          </div>
        </div>

        <div className={cdv.actionsRow}>
          {onCreateBooking ? (
            <Button type="button" size="sm" variant="primary" onClick={onCreateBooking}>
              <Plus className="size-3.5" />
              Neue Buchung
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="neutral" onClick={onOpenDocuments}>
            <FileUp className="size-3.5" />
            Dokument hochladen
          </Button>
          <Button type="button" size="sm" variant="neutral" onClick={onAddNote}>
            <StickyNote className="size-3.5" />
            Notiz hinzufügen
          </Button>
          <Button type="button" size="sm" variant="warning" onClick={onOpenStatusModal}>
            Status ändern
          </Button>
          <Button type="button" size="sm" variant="warning" onClick={onOpenRiskModal}>
            <Shield className="size-3.5" />
            Risiko setzen
          </Button>
          {statusShortcut && onStatusShortcut ? (
            <Button
              type="button"
              size="sm"
              variant={statusShortcut.variant}
              disabled={statusShortcutSaving}
              onClick={() => onStatusShortcut(statusShortcut.nextStatus)}
            >
              {statusShortcutSaving ? 'Speichert…' : statusShortcut.label}
            </Button>
          ) : null}
          {phone ? (
            <Button type="button" size="sm" variant="neutral" asChild>
              <a href={`tel:${phone.replace(/\s/g, '')}`}>
                <Phone className="size-3.5" />
                Kontakt
              </a>
            </Button>
          ) : email ? (
            <Button type="button" size="sm" variant="neutral" asChild>
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
