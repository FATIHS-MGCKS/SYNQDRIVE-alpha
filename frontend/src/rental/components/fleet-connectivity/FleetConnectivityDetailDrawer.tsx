import { ChevronDown, Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DetailDrawer, ErrorState, StatusChip } from '../../../components/patterns';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { api, type FleetConnectivityDetail } from '../../../lib/api';
import { formatOdometerKmFloor } from '../../../lib/formatVehicleDisplay';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { OverallStateChip } from './fleet-connectivity.badges';
import {
  capabilityAvailabilityLabel,
  capabilityFreshnessLabel,
  capabilitySignalLabel,
  coverageStateLabel,
  coverageStateTone,
  deviceKindLabel,
  formatLastTelemetry,
  physicalDeviceLabel,
  providerLinkLabel,
  providerSummaryLabel,
  reasonCodeHint,
  recommendedActionLabel,
  timelineEventLabel,
  vehicleTitle,
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
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

interface FleetConnectivityDetailDrawerProps {
  orgId: string | null;
  vehicleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FleetConnectivityDetailDrawer({
  orgId,
  vehicleId,
  open,
  onOpenChange,
}: FleetConnectivityDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<FleetConnectivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.vehicles.fleetConnectivityDetail(orgId, vehicleId);
      setDetail(res);
    } catch {
      setDetail(null);
      setError(t('fleetConnectivity.detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, vehicleId, t]);

  useEffect(() => {
    if (open && orgId && vehicleId) {
      void load();
    }
    if (!open) {
      setDetail(null);
      setError(null);
    }
  }, [open, orgId, vehicleId, load]);

  const v = detail?.vehicle;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      title={
        v ? (
          <span>
            {v.make} {v.model}
            {v.year ? ` ${v.year}` : ''}
          </span>
        ) : (
          t('fleetConnectivity.detail.title')
        )
      }
      description={
        v ? (
          <span className="text-[11px] tabular-nums">
            {v.licensePlate ?? '—'} · {vehicleTitle(v)}
          </span>
        ) : undefined
      }
      status={detail ? <OverallStateChip state={detail.overallState} t={t} /> : undefined}
      closeLabel={t('fleetConnectivity.detail.close')}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">{t('fleetConnectivity.detail.loading')}</span>
        </div>
      ) : error ? (
        <ErrorState
          title={t('fleetConnectivity.detail.loadError')}
          error={error}
          onRetry={() => void load()}
          retryLabel={t('fleetConnectivity.retry')}
        />
      ) : detail ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>{t('fleetConnectivity.detail.readOnlyNote')}</p>
          </div>

          <DetailSection title={t('fleetConnectivity.detail.section.currentState')}>
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
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
                  <StatusChip tone={detail.attentionState === 'CRITICAL' ? 'critical' : detail.attentionState === 'ACTION_REQUIRED' ? 'warning' : detail.attentionState === 'WATCH' ? 'watch' : 'neutral'}>
                    {t(
                      `fleetConnectivity.attention.${detail.attentionState}` as TranslationKey,
                    )}
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

          {detail.timeline.length > 0 ? (
            <DetailSection title={t('fleetConnectivity.detail.section.timeline')}>
              <ol className="space-y-2">
                {detail.timeline.map((event) => (
                  <li
                    key={event.id}
                    className="surface-premium rounded-xl px-3 py-2.5 text-[12px]"
                  >
                    <p className="font-medium text-foreground">
                      {timelineEventLabel(event.type, t)}
                    </p>
                    <p className="mt-0.5 text-muted-foreground tabular-nums">
                      {new Date(event.occurredAt).toLocaleString(
                        locale === 'de' ? 'de-DE' : 'en-GB',
                      )}
                    </p>
                    {event.type === 'DEVICE_RECONNECTED' &&
                    (event.processedAt || event.receivedAt) ? (
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
            <div className="surface-premium rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
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
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
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

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-left text-[12px] font-semibold text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]">
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
            </CollapsibleContent>
          </Collapsible>

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
        </div>
      ) : null}
    </DetailDrawer>
  );
}
