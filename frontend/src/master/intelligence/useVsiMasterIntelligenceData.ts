import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  MasterVsiFleetOverviewDto,
  MasterVsiProfileDetailDto,
  MasterVsiRevisionAsOfDto,
  MasterVsiRevisionHistoryPageDto,
} from './vsi-master-intelligence-api.types';

export type VsiMasterIntelligenceLoadState = {
  overview: MasterVsiFleetOverviewDto | null;
  profile: MasterVsiProfileDetailDto | null;
  revisions: MasterVsiRevisionHistoryPageDto | null;
  revisionAsOf: MasterVsiRevisionAsOfDto | null;
  capabilityExplanation: unknown | null;
  loading: boolean;
  error: string | null;
};

const emptyLoad: VsiMasterIntelligenceLoadState = {
  overview: null,
  profile: null,
  revisions: null,
  revisionAsOf: null,
  capabilityExplanation: null,
  loading: false,
  error: null,
};

export function useVsiMasterIntelligenceData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  asOf: string | null;
}) {
  const [state, setState] = useState<VsiMasterIntelligenceLoadState>(emptyLoad);

  const load = useCallback(async () => {
    const { orgId, vehicleId, providerSourceLinkId, asOf } = input;
    if (!orgId || !vehicleId) {
      setState({ ...emptyLoad });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const overview = await api.admin.masterIntelligenceVsi.overview(orgId, vehicleId);
      let profile: MasterVsiProfileDetailDto | null = null;
      let revisions: MasterVsiRevisionHistoryPageDto | null = null;
      let revisionAsOf: MasterVsiRevisionAsOfDto | null = null;
      let capabilityExplanation: unknown | null = null;

      const linkId = providerSourceLinkId ?? overview.profiles[0]?.providerSourceLinkId ?? null;
      if (linkId) {
        const [profileRes, revisionsRes] = await Promise.all([
          api.admin.masterIntelligenceVsi.profile(orgId, vehicleId, linkId),
          api.admin.masterIntelligenceVsi.revisions(orgId, vehicleId, linkId, { limit: 20 }),
        ]);
        profile = profileRes;
        revisions = revisionsRes;

        if (asOf) {
          revisionAsOf = await api.admin.masterIntelligenceVsi.revisionAsOf(
            orgId,
            vehicleId,
            linkId,
            asOf,
          );
        }

        capabilityExplanation = await api.admin.masterIntelligenceVsi.capabilityResolver(
          orgId,
          vehicleId,
          linkId,
          {
            consumerModule: 'apds',
            featureId: 'shadow_demand_profile_read',
            evaluationTime: profile.evaluatedAt,
          },
        );
      }

      setState({
        overview,
        profile,
        revisions,
        revisionAsOf,
        capabilityExplanation,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState({
        ...emptyLoad,
        loading: false,
        error: e instanceof Error ? e.message : 'VSI data could not be loaded',
      });
    }
  }, [input.orgId, input.vehicleId, input.providerSourceLinkId, input.asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
