import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { LegalDocumentDto, TenantOrganizationProfileDto, VoiceAssistantData } from '../../../lib/api';
import type { OrganizationRentalRulesDto, RentalRulesOverviewDto } from '../settings/rental-rules/rental-rules.types';
import type { Station } from '../../../lib/api';
import {
  assembleKnowledgeCenter,
  buildApprovedDocumentsSource,
  buildDepositSource,
  buildEmergencySource,
  buildFaqSource,
  buildOpeningHoursSource,
  buildOrganizationProfileSource,
  buildPaymentMethodsSource,
  buildPickupReturnSource,
  buildRentalRulesSource,
  buildRequirementsSource,
  buildStationsSource,
  buildTermsSource,
  VOICE_KNOWLEDGE_SOURCE_ORDER,
} from './voice-knowledge-center.ops';
import type { VoiceKnowledgeCenterSnapshot } from './voice-knowledge-center.types';

const EMPTY_CENTER: VoiceKnowledgeCenterSnapshot = {
  sources: [],
  gaps: [],
  connectedCount: 0,
  freshness: 'needs_attention',
};

export function useVoiceKnowledgeCenter(orgId: string | null, assistant: VoiceAssistantData | null) {
  const [center, setCenter] = useState<VoiceKnowledgeCenterSnapshot>(EMPTY_CENTER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setCenter(EMPTY_CENTER);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [
      profileRes,
      stationsRes,
      rulesOverviewRes,
      rulesDefaultsRes,
      legalRes,
    ] = await Promise.allSettled([
      api.organizations.getProfile(orgId),
      api.stations.list(orgId, { selectableOnly: true }),
      api.rentalRules.overview(orgId),
      api.rentalRules.getDefaults(orgId),
      api.legalDocuments.list(orgId),
    ]);

    const profileErr = profileRes.status === 'rejected' ? String(profileRes.reason) : undefined;
    const stationsErr = stationsRes.status === 'rejected' ? String(stationsRes.reason) : undefined;
    const rulesErr =
      rulesOverviewRes.status === 'rejected' ? String(rulesOverviewRes.reason) : undefined;
    const legalErr = legalRes.status === 'rejected' ? String(legalRes.reason) : undefined;

    const profile: TenantOrganizationProfileDto | null =
      profileRes.status === 'fulfilled' ? profileRes.value : null;
    const stations: Station[] = stationsRes.status === 'fulfilled' ? stationsRes.value : [];
    const overview: RentalRulesOverviewDto | null =
      rulesOverviewRes.status === 'fulfilled' ? rulesOverviewRes.value : null;
    const defaults: OrganizationRentalRulesDto | null =
      rulesDefaultsRes.status === 'fulfilled' ? rulesDefaultsRes.value : null;
    const legalDocs: LegalDocumentDto[] = legalRes.status === 'fulfilled' ? legalRes.value : [];

    const built = [
      buildOrganizationProfileSource(profile, profileErr),
      buildStationsSource(stations, stationsErr),
      buildOpeningHoursSource(assistant),
      buildFaqSource(assistant),
      buildRentalRulesSource(overview, rulesErr),
      buildRequirementsSource(defaults, overview, rulesErr),
      buildTermsSource(legalDocs, legalErr),
      buildPickupReturnSource('pickup', defaults),
      buildPickupReturnSource('return', defaults),
      buildDepositSource(defaults),
      buildPaymentMethodsSource(defaults),
      buildEmergencySource(assistant),
      buildApprovedDocumentsSource(legalDocs, legalErr),
    ];

    const ordered = VOICE_KNOWLEDGE_SOURCE_ORDER.map(
      id => built.find(s => s.id === id)!,
    );

    setCenter(assembleKnowledgeCenter(ordered));
    setLoading(false);
  }, [
    orgId,
    assistant?.businessHoursStart,
    assistant?.businessHoursEnd,
    assistant?.businessHoursTimezone,
    assistant?.knowledgeSnippets,
    assistant?.escalationPhone,
    assistant?.escalateOnRequest,
    assistant?.escalateOnSensitive,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { center, loading, error, reload: load };
}
