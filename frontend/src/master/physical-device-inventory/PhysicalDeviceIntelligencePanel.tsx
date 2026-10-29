import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../../components/ui/button';
import {
  navigateMasterIntelligenceCrossLink,
  emptyIntelligenceContext,
  mergeMasterIntelligenceContext,
} from '../intelligence/master-intelligence-url';
import { usePdiMasterIntelligenceData } from './usePdiMasterIntelligenceData';

type Props = {
  physicalDeviceId: string;
  organizationId?: string | null;
};

export function PhysicalDeviceIntelligencePanel({ physicalDeviceId, organizationId }: Props) {
  const { t, locale } = useLanguage();
  const { data, loading, error, refresh } = usePdiMasterIntelligenceData({
    physicalDeviceId,
    organizationId: organizationId ?? null,
  });

  const openVsi = () => {
    if (!data?.crossLinkContext.organizationId || !data.crossLinkContext.vehicleId) return;
    navigateMasterIntelligenceCrossLink(
      'vsi-intelligence',
      mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
        orgId: data.crossLinkContext.organizationId,
        vehicleId: data.crossLinkContext.vehicleId,
        providerSourceLinkId: data.crossLinkContext.providerSourceLinkId,
        physicalDeviceId: data.crossLinkContext.physicalDeviceId,
      }),
    );
  };

  const openApds = () => {
    if (!data?.crossLinkContext.organizationId || !data.crossLinkContext.vehicleId) return;
    navigateMasterIntelligenceCrossLink(
      'apds-intelligence',
      mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
        orgId: data.crossLinkContext.organizationId,
        vehicleId: data.crossLinkContext.vehicleId,
        providerSourceLinkId: data.crossLinkContext.providerSourceLinkId,
        physicalDeviceId: data.crossLinkContext.physicalDeviceId,
      }),
    );
  };

  const openVehicle = () => {
    if (!data?.crossLinkContext.vehicleId) return;
    navigateMasterIntelligenceCrossLink(
      'vehicles',
      mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
        orgId: data.crossLinkContext.organizationId,
        vehicleId: data.crossLinkContext.vehicleId,
        physicalDeviceId: data.crossLinkContext.physicalDeviceId,
      }),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('master.intelligence.pdi.loading' as never)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/40 p-3 text-xs">
        <p>{t('master.intelligence.pdi.error' as never)}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void refresh()}>
          {t('master.intelligence.vsi.retry' as never)}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium">{t('master.intelligence.pdi.section.identity' as never)}</p>
      <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.snapshotNotHistory' as never)}</p>
      <div className="grid gap-1 text-xs">
        <div>
          {t('master.physicalDeviceInventory.col.serial' as never)}: {data.identity.serialNumberMasked ?? '—'}
        </div>
        <div>IMEI: {data.identity.imeiMasked ?? '—'}</div>
        <div>
          {t('master.intelligence.pdi.evaluatedAt' as never)}: {formatTime(data.identity.identityEvaluatedAt)}
        </div>
        {data.identity.physicalR1Applicability === 'NOT_APPLICABLE' ? (
          <p className="text-amber-800 dark:text-amber-200">
            {t('master.intelligence.pdi.notApplicableR1' as never)}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.timeline' as never)}</p>
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
          {data.timeline.length === 0 ? (
            <li>{t('master.intelligence.pdi.emptyTimeline' as never)}</li>
          ) : (
            data.timeline.map((item) => (
              <li key={`${item.kind}-${item.at}-${item.label}`}>
                {formatTime(item.at)} · {item.label}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.episodes' as never)}</p>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.episodeNotPoll' as never)}</p>
        {data.connectionEpisodes.items.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('master.intelligence.pdi.noEpisodes' as never)}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {data.connectionEpisodes.items.map((ep) => (
              <li key={ep.idPrefix}>
                {formatTime(ep.openedAt)} · {ep.status} · {ep.openedReason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.drift' as never)}</p>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.noDriftHistory' as never)}</p>
        {data.driftHistory.liveObservation ? (
          <div className="mt-2 text-xs">
            {data.driftHistory.liveObservation.driftReasonCode} ·{' '}
            {data.driftHistory.liveObservation.confidence}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" size="sm" variant="outline" onClick={openVehicle} disabled={!data.crossLinkContext.vehicleId}>
          {t('master.intelligence.crossLink.vehicle' as never)}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openVsi} disabled={!data.crossLinkContext.vehicleId}>
          {t('master.intelligence.crossLink.vsi' as never)}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openApds} disabled={!data.crossLinkContext.vehicleId}>
          {t('master.intelligence.crossLink.apds' as never)}
        </Button>
      </div>
    </div>
  );
}
