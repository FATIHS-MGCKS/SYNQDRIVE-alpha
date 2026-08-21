import { Icon } from '../ui/Icon';
import type { BookingDetailDto } from '../../../lib/api';
import type { BookingActionMatrix } from './bookingDetailTypes';
import { EM_DASH, formatDateTime } from './bookingDetailUtils';
import { BookingStationPanel } from './BookingStationPanel';
import { bd } from './booking-detail-ui';
import { useLanguage } from '../../i18n/LanguageContext';
import { bookingsFormattingLocaleOrDefault } from '../bookings-customers/bookings-i18n';
import { resolveHandoverGateReason } from '../handover/handover-i18n';

interface BookingHandoverTabProps {
  detail: BookingDetailDto;
  matrix: BookingActionMatrix;
  onPickup: () => void;
  onReturn: () => void;
}

function HandoverSide({
  title,
  side,
  actionLabel,
  actionAllowed,
  actionReason,
  onAction,
  noProtocolLabel,
  formattingLocale,
  rowLabels,
}: {
  title: string;
  side: BookingDetailDto['handover']['pickup'];
  actionLabel: string;
  actionAllowed: boolean;
  actionReason?: string;
  onAction: () => void;
  noProtocolLabel: string;
  formattingLocale: string;
  rowLabels: {
    timestamp: string;
    staff: string;
    odometer: string;
    fuelSoc: string;
    fuelFull: string;
    damages: string;
    signature: string;
    signatureComplete: string;
    signatureIncomplete: string;
  };
}) {
  const disabledTitle = !actionAllowed ? actionReason : undefined;

  return (
    <div className={bd.card}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold">{title}</h3>
        <button
          type="button"
          disabled={!actionAllowed}
          title={disabledTitle}
          onClick={onAction}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
            actionAllowed ? 'sq-tone-brand' : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
          }`}
        >
          {actionLabel}
        </button>
      </div>
      {!side ? (
        <p className="text-xs text-muted-foreground">{noProtocolLabel}</p>
      ) : (
        <dl className="space-y-2 text-xs">
          <Row label={rowLabels.timestamp} value={formatDateTime(side.completedAt)} />
          <Row label={rowLabels.staff} value={side.performedByName ?? EM_DASH} />
          <Row
            label={rowLabels.odometer}
            value={`${side.odometerKm.toLocaleString(formattingLocale)} km`}
          />
          <Row
            label={rowLabels.fuelSoc}
            value={side.fuelFull ? rowLabels.fuelFull : `${side.fuelPercent} %`}
          />
          <Row label={rowLabels.damages} value={String(side.damageCount)} />
          <Row
            label={rowLabels.signature}
            value={side.signatureComplete ? rowLabels.signatureComplete : rowLabels.signatureIncomplete}
          />
        </dl>
      )}
    </div>
  );
}

export function BookingHandoverTab({ detail, matrix, onPickup, onReturn }: BookingHandoverTabProps) {
  const { t, locale, formattingLocale } = useLanguage();
  const fmtLocale = formattingLocale ?? bookingsFormattingLocaleOrDefault(locale);
  const pickupReason = resolveHandoverGateReason(locale, matrix.pickup);
  const returnReason = resolveHandoverGateReason(locale, matrix.return);

  const rowLabels = {
    timestamp: t('handover.tab.timestamp'),
    staff: t('handover.tab.staff'),
    odometer: t('handover.tab.odometer'),
    fuelSoc: t('handover.tab.fuelSoc'),
    fuelFull: t('handover.tab.fuelFull'),
    damages: t('handover.tab.damages'),
    signature: t('handover.tab.signature'),
    signatureComplete: t('handover.tab.signatureComplete'),
    signatureIncomplete: t('handover.tab.signatureIncomplete'),
  };

  return (
    <div className="space-y-4">
      {detail.stations && (
        <BookingStationPanel stations={detail.stations} />
      )}
      {detail.stations?.hasReturnDeviation && (
        <p className="text-xs px-3 py-2 rounded-lg border border-border sq-tone-warning">
          {t('bookings.handover.returnDeviation')}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <HandoverSide
        title={t('bookings.handover.pickupTitle')}
        side={detail.handover.pickup}
        actionLabel={
          detail.handover.pickup ? t('handover.tab.viewProtocol') : t('handover.tab.startPickup')
        }
        actionAllowed={detail.handover.pickup ? true : matrix.pickup.allowed}
        actionReason={pickupReason}
        onAction={onPickup}
        noProtocolLabel={t('bookings.handover.noProtocol')}
        formattingLocale={fmtLocale}
        rowLabels={rowLabels}
      />
      <HandoverSide
        title={t('bookings.handover.returnTitle')}
        side={detail.handover.return}
        actionLabel={
          detail.handover.return ? t('handover.tab.viewProtocol') : t('handover.tab.startReturn')
        }
        actionAllowed={detail.handover.return ? true : matrix.return.allowed}
        actionReason={returnReason}
        onAction={onReturn}
        noProtocolLabel={t('bookings.handover.noProtocol')}
        formattingLocale={fmtLocale}
        rowLabels={rowLabels}
      />
      {!detail.handover.pickup && !matrix.pickup.allowed && pickupReason && (
        <div className="lg:col-span-2 flex items-start gap-2 text-xs text-muted-foreground px-1">
          <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{pickupReason}</span>
        </div>
      )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
