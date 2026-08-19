import { ArrowLeft, Mail, Phone, StickyNote } from 'lucide-react';

import type { StatusTone } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  customerRiskUiLabel,
  customerStatusUiLabel,
  customerVerificationUiLabel,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { CustomerListRow } from './customerDetailTypes';
import {
  cdv,
  customerDetailTitleClass,
  customerRiskHeaderLabel,
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
  const { t, locale, formattingLocale } = useLanguage();
  const statusShortcut = resolveCustomerStatusAction(displayStatus, locale);
  const customerTypeLabel =
    displayType === 'Corporate' ? t('customers.type.corporate') : t('customers.type.individual');
  const customerSinceLabel = formatDate(customerSince, formattingLocale);
  const hasContact = Boolean(phone || email);

  return (
    <div className={cdv.headerCard}>
      <div className={cdv.headerInner}>
        <button type="button" onClick={onBack} className={cdv.backLink}>
          <ArrowLeft className="size-3.5" />
          {t('customers.detail.backToCustomers')}
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
              <span>{t('customers.detail.header.customerSince', { date: customerSinceLabel })}</span>
            </div>
          </div>
          <div className={cdv.heroStatusChip}>
            <StatusChip tone={customerStatusTone(displayStatus)} dot>
              {customerStatusUiLabel(displayStatus, locale)}
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
              {t('customers.detail.header.clearancePrefix')} {rentalClearanceLabel}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip
              tone={customerVerificationTone(idVerificationUi)}
              dot
              className={cdv.heroBadgeChip}
            >
              {t('customers.detail.decisions.idPrefix')} {customerVerificationUiLabel(idVerificationUi, locale)}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip tone={customerRiskHeaderTone(displayRisk)} dot className={cdv.heroBadgeChip}>
              {t('customers.detail.header.riskPrefix')} {customerRiskHeaderLabel(displayRisk, locale)}
            </StatusChip>
          </div>
          <div className={cdv.heroBadgeCell}>
            <StatusChip
              tone={customerVerificationTone(licenseVerificationUi)}
              dot
              className={cdv.heroBadgeChip}
            >
              {t('customers.detail.decisions.licensePrefix')} {customerVerificationUiLabel(licenseVerificationUi, locale)}
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
            {t('customers.detail.addNote')}
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
              {statusShortcutSaving ? t('customers.detail.noteModal.saving') : statusShortcut.label}
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
                  {t('customers.detail.header.contact')}
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
                  {t('customers.detail.header.contact')}
                </a>
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
