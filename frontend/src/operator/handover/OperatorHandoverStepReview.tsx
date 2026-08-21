import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { HandoverDialogBookingInfo, HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import { severityChipClass } from '../../rental/lib/technical-observations-ui';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import type { OperatorHandoverValidationIssue } from './operatorHandoverPayload';
import { collectTechnicalObservationsForPayload } from './operatorHandoverTechnicalObservations';
import {
  labelOperatorObservationCategory,
  labelOperatorObservationSeverity,
  oh,
  resolveOperatorValidationMessage,
} from './operator-handover-i18n';

interface Props {
  kind: HandoverDialogKind;
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
  issues: OperatorHandoverValidationIssue[];
}

export function OperatorHandoverStepReview({ kind, booking, form, issues }: Props) {
  const { locale, t } = useLanguage();
  const primaryLabel =
    kind === 'PICKUP'
      ? t('handover.protocol.confirmPickupActivate')
      : t('handover.protocol.confirmReturnComplete');

  const observationPayload = collectTechnicalObservationsForPayload(kind, form.state);
  const manualDrafts = form.state.technicalObservationDrafts;
  const autoWarningCount = Math.max(0, observationPayload.length - manualDrafts.length);

  const rows = [
    { label: t('handover.protocol.vehicle'), value: `${booking.vehicleName} · ${booking.plate}` },
    { label: t('handover.protocol.customer'), value: booking.customerName },
    {
      label: t('handover.protocol.odometer'),
      value: `${form.state.odometerKm || '—'} ${t('handover.protocol.kmUnit')}`,
    },
    {
      label: t('handover.protocol.fuelSoc'),
      value: form.state.fuelFull
        ? oh(locale, 'handover.operator.condition.fuelFull')
        : `${form.state.fuelPercent}%`,
    },
    {
      label: oh(locale, 'handover.operator.review.damagesMarked'),
      value: String(form.state.selectedDamageIds.size),
    },
    {
      label: oh(locale, 'handover.operator.review.observations'),
      value:
        observationPayload.length === 0
          ? oh(locale, 'handover.operator.review.observationsNone')
          : autoWarningCount > 0
            ? oh(locale, 'handover.operator.review.observationsWithWarning', {
                count: observationPayload.length,
              })
            : String(observationPayload.length),
    },
    {
      label: oh(locale, 'handover.operator.review.documentsConfirmed'),
      value: form.state.checks.documentsAcknowledged ? t('common.yes') : t('common.no'),
    },
    {
      label: oh(locale, 'handover.operator.review.customerSignature'),
      value: form.state.customerSigData
        ? oh(locale, 'handover.operator.review.captured')
        : oh(locale, 'handover.operator.review.missing'),
    },
    {
      label: oh(locale, 'handover.operator.review.staffSignature'),
      value: form.state.staffSigData
        ? oh(locale, 'handover.operator.review.captured')
        : oh(locale, 'handover.operator.review.missing'),
    },
    {
      label: oh(locale, 'handover.operator.review.staff'),
      value: form.state.staffName || form.state.staffId || '—',
    },
  ];

  const statusLabel =
    kind === 'PICKUP'
      ? t('handover.protocol.statusPickup')
      : t('handover.protocol.statusReturn');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {oh(locale, 'handover.operator.review.intro', { status: statusLabel })}
      </p>

      <div className="rounded-2xl border border-border/60 surface-premium divide-y divide-border/40">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium text-right">{row.value}</span>
          </div>
        ))}
      </div>

      {observationPayload.length > 0 && (
        <div className="rounded-2xl border border-border/60 surface-premium p-4 space-y-2">
          <p className="text-sm font-semibold">
            {oh(locale, 'handover.operator.review.observationsSection')}
          </p>
          <ul className="space-y-2">
            {observationPayload.map((obs, idx) => (
              <li
                key={`${obs.description}-${idx}`}
                className="rounded-xl border border-border/50 bg-background/50 px-3 py-2"
              >
                <p className="text-sm font-medium leading-snug">{obs.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {obs.category && (
                    <span className="rounded-md bg-muted px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
                      {labelOperatorObservationCategory(locale, obs.category)}
                    </span>
                  )}
                  {obs.severity && (
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold ${severityChipClass(obs.severity)}`}
                    >
                      {labelOperatorObservationSeverity(locale, obs.severity)}
                    </span>
                  )}
                  {obs.blocksRental && (
                    <span className="font-semibold text-[color:var(--status-critical)]">
                      {oh(locale, 'handover.operator.review.blocksRental')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--status-critical)]">
            <AlertTriangle className="h-4 w-4" />
            {oh(locale, 'handover.operator.review.openIssues')}
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {issues.map((i) => (
              <li key={`${i.field}-${i.messageKey}`}>
                {resolveOperatorValidationMessage(locale, i)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-sm font-semibold text-foreground">{primaryLabel}</p>
    </div>
  );
}
