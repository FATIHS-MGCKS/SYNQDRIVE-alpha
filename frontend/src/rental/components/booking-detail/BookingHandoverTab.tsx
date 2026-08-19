import { Icon } from '../ui/Icon';
import type { BookingDetailDto } from '../../../lib/api';
import type { BookingActionMatrix } from './bookingDetailTypes';
import { EM_DASH, formatDateTime } from './bookingDetailUtils';
import { BookingStationPanel } from './BookingStationPanel';
import { bd } from './booking-detail-ui';
import { useLanguage } from '../../i18n/LanguageContext';
import { bookingsFormattingLocaleOrDefault } from '../bookings-customers/bookings-i18n';

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
}: {
  title: string;
  side: BookingDetailDto['handover']['pickup'];
  actionLabel: string;
  actionAllowed: boolean;
  actionReason?: string;
  onAction: () => void;
  noProtocolLabel: string;
  formattingLocale: string;
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
          <Row label="Zeitpunkt" value={formatDateTime(side.completedAt)} />
          <Row label="Mitarbeiter" value={side.performedByName ?? EM_DASH} />
          <Row label="Kilometerstand" value={`${side.odometerKm.toLocaleString(formattingLocale)} km`} />
          <Row
            label="Kraftstoff/SoC"
            value={side.fuelFull ? 'Voll' : `${side.fuelPercent} %`}
          />
          <Row label="Schäden" value={String(side.damageCount)} />
          <Row label="Signatur" value={side.signatureComplete ? 'Vollständig' : 'Unvollständig'} />
        </dl>
      )}
    </div>
  );
}

export function BookingHandoverTab({ detail, matrix, onPickup, onReturn }: BookingHandoverTabProps) {
  const { t, locale, formattingLocale } = useLanguage();
  const fmtLocale = formattingLocale ?? bookingsFormattingLocaleOrDefault(locale);

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
        actionLabel={detail.handover.pickup ? 'Protokoll anzeigen' : 'Pickup starten'}
        actionAllowed={detail.handover.pickup ? true : matrix.pickup.allowed}
        actionReason={matrix.pickup.reason}
        onAction={onPickup}
        noProtocolLabel={t('bookings.handover.noProtocol')}
        formattingLocale={fmtLocale}
      />
      <HandoverSide
        title={t('bookings.handover.returnTitle')}
        side={detail.handover.return}
        actionLabel={detail.handover.return ? 'Protokoll anzeigen' : 'Return starten'}
        actionAllowed={detail.handover.return ? true : matrix.return.allowed}
        actionReason={matrix.return.reason}
        onAction={onReturn}
        noProtocolLabel={t('bookings.handover.noProtocol')}
        formattingLocale={fmtLocale}
      />
      {!detail.handover.pickup && !matrix.pickup.allowed && matrix.pickup.reason && (
        <div className="lg:col-span-2 flex items-start gap-2 text-xs text-muted-foreground px-1">
          <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{matrix.pickup.reason}</span>
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
