import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { PriceTariffCatalog } from '../../pricing/pricingTypes';
import type { RentalRulesOverviewDto } from '../settings/rental-rules/rental-rules.types';
import type { Station, VoiceAssistantData } from '../../../lib/api';
import type { VoiceKnowledgeLinks } from './voice-assistant-builder.types';

const NOT_CONNECTED = (label: string): VoiceKnowledgeLinks['stations'] => ({
  loading: false,
  connected: false,
  label,
  detail: 'Not connected yet — configure in Rental settings.',
});

function openingHoursStatus(assistant: VoiceAssistantData | null): VoiceKnowledgeLinks['openingHours'] {
  const hasHours = Boolean(
    assistant?.businessHoursStart?.trim() &&
    assistant?.businessHoursEnd?.trim(),
  );
  return {
    loading: false,
    connected: hasHours,
    label: 'Opening hours',
    detail: hasHours
      ? `${assistant!.businessHoursStart}–${assistant!.businessHoursEnd} (${assistant?.businessHoursTimezone ?? 'timezone not set'})`
      : 'Not configured — set business hours in Escalation tab.',
  };
}

const INITIAL: VoiceKnowledgeLinks = {
  stations: { loading: true, connected: false, label: 'Stations', detail: 'Checking…' },
  rentalRules: { loading: true, connected: false, label: 'Rental rules', detail: 'Checking…' },
  priceTariffs: { loading: true, connected: false, label: 'Price tariffs', detail: 'Checking…' },
  vehicleCategories: { loading: true, connected: false, label: 'Vehicle categories', detail: 'Checking…' },
  openingHours: { loading: false, connected: false, label: 'Opening hours', detail: 'Checking…' },
  serviceArea: {
    loading: false,
    connected: false,
    label: 'Service area',
    detail: 'Geographic coverage not linked to voice assistant yet.',
  },
  bookingPrerequisites: {
    loading: true,
    connected: false,
    label: 'Booking prerequisites',
    detail: 'Checking…',
  },
};

type KnowledgeSnapshot = {
  orgId: string | null;
  assistantKey: string;
  links: VoiceKnowledgeLinks;
};

function assistantKey(assistant: VoiceAssistantData | null): string {
  return [
    assistant?.businessHoursStart ?? '',
    assistant?.businessHoursEnd ?? '',
    assistant?.businessHoursTimezone ?? '',
  ].join('|');
}

function idleLinks(orgId: string | null, assistant: VoiceAssistantData | null): VoiceKnowledgeLinks {
  if (!orgId) {
    return {
      ...INITIAL,
      stations: NOT_CONNECTED('Stations'),
      rentalRules: NOT_CONNECTED('Rental rules'),
      priceTariffs: NOT_CONNECTED('Price tariffs'),
      vehicleCategories: NOT_CONNECTED('Vehicle categories'),
      openingHours: openingHoursStatus(assistant),
      bookingPrerequisites: NOT_CONNECTED('Booking prerequisites'),
    };
  }

  return {
    ...INITIAL,
    openingHours: openingHoursStatus(assistant),
  };
}

export function useVoiceKnowledgeLinks(orgId: string | null, assistant: VoiceAssistantData | null) {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>(() => ({
    orgId,
    assistantKey: assistantKey(assistant),
    links: idleLinks(orgId, assistant),
  }));
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    if (!orgId) {
      return undefined;
    }

    let cancelled = false;
    const currentAssistantKey = assistantKey(assistant);

    void (async () => {
      const [stationsRes, rulesRes, catalogRes, categoriesRes] = await Promise.allSettled([
        api.stations.list(orgId, { selectableOnly: true }),
        api.rentalRules.overview(orgId),
        api.pricing.catalog(orgId),
        api.rentalRules.listCategories(orgId),
      ]);

      if (cancelled) return;

      const stations: Station[] = stationsRes.status === 'fulfilled' ? stationsRes.value : [];
      const overview: RentalRulesOverviewDto | null =
        rulesRes.status === 'fulfilled' ? rulesRes.value : null;
      const catalog: PriceTariffCatalog | null =
        catalogRes.status === 'fulfilled' ? (catalogRes.value as PriceTariffCatalog) : null;
      const categories = categoriesRes.status === 'fulfilled' ? categoriesRes.value : [];

      const activeTariffGroups = (catalog?.groups ?? []).filter(g =>
        g.versions?.some(v => v.status === 'ACTIVE'),
      );

      setSnapshot({
        orgId,
        assistantKey: currentAssistantKey,
        links: {
          stations: {
            loading: false,
            connected: stations.length > 0,
            label: 'Stations',
            detail: stations.length > 0
              ? `${stations.length} station(s) available in fleet data`
              : 'No stations configured yet.',
            count: stations.length,
          },
          rentalRules: {
            loading: false,
            connected: Boolean(overview?.defaultsConfigured || (overview?.activeCategoryCount ?? 0) > 0),
            label: 'Rental rules',
            detail: overview?.defaultsConfigured
              ? `Defaults configured · ${overview.activeCategoryCount} active categor${overview.activeCategoryCount === 1 ? 'y' : 'ies'}`
              : 'Rental rules defaults not configured yet.',
            count: overview?.activeCategoryCount,
          },
          priceTariffs: {
            loading: false,
            connected: activeTariffGroups.length > 0,
            label: 'Price tariffs',
            detail: activeTariffGroups.length > 0
              ? `${activeTariffGroups.length} tariff group(s) with active pricing`
              : 'Price tariffs not connected yet.',
            count: activeTariffGroups.length,
          },
          vehicleCategories: {
            loading: false,
            connected: categories.length > 0,
            label: 'Vehicle categories',
            detail: categories.length > 0
              ? `${categories.length} rental vehicle categor${categories.length === 1 ? 'y' : 'ies'}`
              : 'No vehicle categories defined yet.',
            count: categories.length,
          },
          openingHours: openingHoursStatus(assistant),
          serviceArea: {
            loading: false,
            connected: false,
            label: 'Service area',
            detail: 'Geographic service area will sync from stations when integration is enabled.',
          },
          bookingPrerequisites: {
            loading: false,
            connected: Boolean(overview?.defaultsConfigured),
            label: 'Booking prerequisites',
            detail: overview?.defaultsConfigured
              ? 'Organization rental defaults are configured.'
              : 'Booking prerequisites not linked — configure rental rules defaults.',
          },
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, assistant, reloadToken]);

  if (!orgId) {
    return { links: idleLinks(orgId, assistant), reload };
  }

  if (snapshot.orgId !== orgId || snapshot.assistantKey !== assistantKey(assistant)) {
    return { links: idleLinks(orgId, assistant), reload };
  }

  return { links: snapshot.links, reload };
}
