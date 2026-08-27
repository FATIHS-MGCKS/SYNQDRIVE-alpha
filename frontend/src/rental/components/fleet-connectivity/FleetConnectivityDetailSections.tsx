import { ChevronDown, Info } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import type { FleetConnectivityDetail } from '../../../lib/api';
import { formatOdometerKmFloor } from '../../../lib/formatVehicleDisplay';
import type { TranslationKey } from '../../i18n/translations/en';
import { OverallStateChip } from './fleet-connectivity.badges';
import {
  attentionTone,
  capabilityAvailabilityLabel,
  capabilityFreshnessLabel,
  capabilitySignalLabel,
  coverageStateLabel,
  coverageStateTone,
  deviceKindLabel,
  formatInterruptionDuration,
  formatLastTelemetry,
  physicalDeviceLabel,
  physicalDevicePresentationTone,
  providerLinkLabel,
  providerLinkPresentationTone,
  providerSummaryLabel,
  reasonCodeHint,
  recommendedActionLabel,
  telemetryFreshnessLabel,
  telemetryFreshnessTone,
  timelineEventLabel,
  type FleetConnectivityTranslator,
} from './fleet-connectivity.presentation';

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-labelledby={title}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px] sm:grid-cols-[minmax(0,32%)_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

function interruptionDimensionLabel(
  detail: FleetConnectivityDetail,
  t: FleetConnectivityTranslator,
  locale: string,
): string {
  const episode = detail.activeEpisode;
  if (!episode?.open) {
    return t('fleetConnectivity.detail.noActiveInterruption');
  }

  const since = episode.openedAt
    ? new Date(episode.openedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

  return t('fleetConnectivity.detail.activeInterruption', {
    since,
    duration: formatInterruptionDuration(episode.durationMs, locale),
  });
}

export interface FleetConnectivityDetailSectionsProps {
  detail: FleetConnectivityDetail;
  t: FleetConnectivityTranslator;
  locale: string;
  showSupportButton?: boolean;
}

export function FleetConnectivityDetailSections({
  detail,
  t,
  locale,
  showSupportButton = true,
}: FleetConnectivityDetailSectionsProps) {
  return (
    <div className="space-y-6" data-testid="fleet-connectivity-detail-sections">
      <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>{t('fleetConnectivity.detail.readOnlyNote')}</p>
      </div>

      <DetailSection title={t('fleetConnectivity.detail.section.currentState')}>
        <div className="surface-premium p-3 space-y-2.5">
          <DetailRow
            label={t('fleetConnectivity.detail.overallState')}
            value={<OverallStateChip state={detail.overallState} t={t} />}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.lastTelemetry')}
            value={formatLastTelemetry(detail.lastTelemetryAt, t, locale)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.attention')}
            value={
              <StatusChip tone={attentionTone(detail.attentionState)}>
                {t(`fleetConnectivity.attention.${detail.attentionState}` as TranslationKey)}
              </StatusChip>
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.recommendation')}
            value={recommendedActionLabel(detail.recommendedAction, t)}
          />
          {detail.primaryReasonCode ? (
            <DetailRow
              label={t('fleetConnectivity.detail.primaryHint')}
              value={reasonCodeHint(detail.primaryReasonCode, t)}
            />
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title={t('fleetConnectivity.detail.section.dimensions')}>
        <div className="surface-premium p-3 space-y-2.5">
          <DetailRow
            label={t('fleetConnectivity.detail.dimension.telemetry')}
            value={
              <StatusChip tone={telemetryFreshnessTone(detail.telemetryState)}>
                {telemetryFreshnessLabel(detail.telemetryState, t)}
              </StatusChip>
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.dimension.providerLink')}
            value={
              <StatusChip tone={providerLinkPresentationTone(detail.providerLinkState)}>
                {providerLinkLabel(detail.providerLinkState, t)}
              </StatusChip>
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.dimension.physicalDevice')}
            value={
              <StatusChip tone={physicalDevicePresentationTone(detail.physicalDeviceState)}>
                {physicalDeviceLabel(detail.physicalDeviceState, t)}
              </StatusChip>
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.dimension.interruption')}
            value={
              <StatusChip tone={detail.activeEpisode?.open ? 'critical' : 'neutral'}>
                {interruptionDimensionLabel(detail, t, locale)}
              </StatusChip>
            }
          />
        </div>
      </DetailSection>

      {detail.timeline.length > 0 ? (
        <DetailSection title={t('fleetConnectivity.detail.section.timeline')}>
          <ol className="space-y-2">
            {detail.timeline.map((event) => (
              <li key={event.id} className="surface-premium px-3 py-2.5 text-[12px]">
                <p className="font-medium text-foreground">
                  {timelineEventLabel(event.type, t)}
                </p>
                <p className="mt-0.5 text-muted-foreground tabular-nums">
                  {new Date(event.occurredAt).toLocaleString(
                    locale === 'de' ? 'de-DE' : 'en-GB',
                  )}
                </p>
                {event.type === 'DEVICE_RECONNECTED' && (event.processedAt || event.receivedAt) ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {event.processedAt
                      ? `${t('fleetConnectivity.detail.recoveryProcessedAt')}: ${new Date(event.processedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB')}`
                      : null}
                    {event.processedAt && event.receivedAt ? ' · ' : null}
                    {event.receivedAt
                      ? `${t('fleetConnectivity.detail.recoveryReceivedAt')}: ${new Date(event.receivedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB')}`
                      : null}
                  </p>
                ) : null}
                {event.reasonCode ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {reasonCodeHint(event.reasonCode, t)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </DetailSection>
      ) : null}

      <DetailSection title={t('fleetConnectivity.detail.section.dataAvailability')}>
        <div className="surface-premium p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip tone={coverageStateTone(detail.dataCoverageState)}>
              {coverageStateLabel(detail.dataCoverageState, t)}
            </StatusChip>
            {detail.capabilities.coveragePercent != null ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {detail.capabilities.freshSignalCount}/{detail.capabilities.expectedSignalCount}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {detail.capabilities.signals.map((signal) => (
              <div
                key={signal.key}
                className="rounded-xl border border-border/60 px-2.5 py-2 space-y-1"
              >
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {capabilitySignalLabel(signal.key, t)}
                </p>
                <p className="text-[12px] font-medium">
                  {capabilityAvailabilityLabel(signal.availability, t)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {capabilityFreshnessLabel(signal.freshness, t)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </DetailSection>

      <DetailSection title={t('fleetConnectivity.detail.section.integration')}>
        <div className="surface-premium p-3 space-y-2.5">
          <DetailRow
            label={t('fleetConnectivity.detail.provider')}
            value={providerSummaryLabel(detail.provider.providerLabel, t)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.deviceKind')}
            value={deviceKindLabel(detail.provider.deviceKind, t)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.authorization')}
            value={providerLinkLabel(detail.provider.authorizationState, t)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.consent')}
            value={
              detail.provider.consentGranted
                ? t('fleetConnectivity.detail.consentGranted')
                : t('fleetConnectivity.detail.consentMissing')
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.triggerStatus')}
            value={
              detail.provider.triggerConfigured
                ? t('fleetConnectivity.detail.triggerActive')
                : t('fleetConnectivity.detail.triggerInactive')
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.lastFetch')}
            value={
              detail.provider.lastSuccessfulFetchAt
                ? new Date(detail.provider.lastSuccessfulFetchAt).toLocaleString(
                    locale === 'de' ? 'de-DE' : 'en-GB',
                  )
                : '—'
            }
          />
        </div>
      </DetailSection>

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex w-full min-h-[44px] items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-left text-[12px] font-semibold text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]">
          {t('fleetConnectivity.detail.section.technical')}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2.5 rounded-xl border border-border/50 bg-muted/20 p-3">
          <DetailRow
            label={t('fleetConnectivity.detail.physicalDevice')}
            value={physicalDeviceLabel(detail.physicalDeviceState, t)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.odometer')}
            value={formatOdometerKmFloor(detail.odometerKm)}
          />
          <DetailRow
            label={t('fleetConnectivity.detail.location')}
            value={
              detail.hasLocation
                ? t('fleetConnectivity.detail.locationAvailable')
                : t('fleetConnectivity.detail.locationUnavailable')
            }
          />
          <DetailRow
            label={t('fleetConnectivity.detail.calculatedAt')}
            value={new Date(detail.timestamps.calculatedAt).toLocaleString(
              locale === 'de' ? 'de-DE' : 'en-GB',
            )}
          />
          {detail.timestamps.reconnectedSince ? (
            <DetailRow
              label={t('fleetConnectivity.detail.reconnectedSince')}
              value={new Date(detail.timestamps.reconnectedSince).toLocaleString(
                locale === 'de' ? 'de-DE' : 'en-GB',
              )}
            />
          ) : null}
          {detail.activeEpisode?.open ? (
            <DetailRow
              label={t('fleetConnectivity.detail.openEpisode')}
              value={t('fleetConnectivity.detail.episodeOpen')}
            />
          ) : null}
          {detail.activeEpisode?.episodeId ? (
            <DetailRow
              label={t('fleetConnectivity.detail.episodeId')}
              value={detail.activeEpisode.episodeId}
            />
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      {showSupportButton ? (
        <SupportContextButton
          kind="fleet-connectivity"
          className="w-full"
          contextData={{
            vehicleId: detail.vehicle.vehicleId,
            licensePlate: detail.vehicle.licensePlate,
            connectionStatus: detail.overallState,
            lastSeen: detail.lastTelemetryAt,
            provider: detail.provider.providerLabel,
          }}
        />
      ) : null}
    </div>
  );
}
