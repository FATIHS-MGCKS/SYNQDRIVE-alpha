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
  revisionsError: string | null;
  revisionsLoading: boolean;
};

const emptyLoad: VsiMasterIntelligenceLoadState = {
  overview: null,
  profile: null,
  revisions: null,
  revisionAsOf: null,
  capabilityExplanation: null,
  loading: false,
  error: null,
  revisionsError: null,
  revisionsLoading: false,
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'VSI data could not be loaded';
}

export function useVsiMasterIntelligenceData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  asOf: string | null;
}) {
  const [state, setState] = useState<VsiMasterIntelligenceLoadState>(emptyLoad);

  const loadRevisionsForLink = useCallback(
    async (orgId: string, vehicleId: string, linkId: string, asOf: string | null) => {
      setState((prev) => ({ ...prev, revisionsLoading: true, revisionsError: null }));
      try {
        const revisions = await api.admin.masterIntelligenceVsi.revisions(orgId, vehicleId, linkId, {
          limit: 20,
        });
        let revisionAsOf: MasterVsiRevisionAsOfDto | null = null;
        if (asOf) {
          try {
            revisionAsOf = await api.admin.masterIntelligenceVsi.revisionAsOf(
              orgId,
              vehicleId,
              linkId,
              asOf,
            );
          } catch {
            revisionAsOf = null;
          }
        }
        setState((prev) => ({
          ...prev,
          revisions,
          revisionAsOf,
          revisionsLoading: false,
          revisionsError: null,
        }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          revisions: null,
          revisionAsOf: null,
          revisionsLoading: false,
          revisionsError: errorMessage(e),
        }));
      }
    },
    [],
  );

  const load = useCallback(async () => {
    const { orgId, vehicleId, providerSourceLinkId, asOf } = input;
    if (!orgId || !vehicleId) {
      setState({ ...emptyLoad });
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      revisionsError: null,
      revisionsLoading: false,
    }));
    try {
      const overview = await api.admin.masterIntelligenceVsi.overview(orgId, vehicleId);
      let profile: MasterVsiProfileDetailDto | null = null;
      let capabilityExplanation: unknown | null = null;

      const linkId = providerSourceLinkId ?? overview.profiles[0]?.providerSourceLinkId ?? null;
      if (linkId) {
        try {
          profile = await api.admin.masterIntelligenceVsi.profile(orgId, vehicleId, linkId);
        } catch (e) {
          setState({
            ...emptyLoad,
            overview,
            loading: false,
            error: errorMessage(e),
          });
          return;
        }

        try {
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
        } catch {
          capabilityExplanation = null;
        }

        setState({
          overview,
          profile,
          revisions: null,
          revisionAsOf: null,
          capabilityExplanation,
          loading: false,
          error: null,
          revisionsError: null,
          revisionsLoading: true,
        });

        await loadRevisionsForLink(orgId, vehicleId, linkId, asOf);
        return;
      }

      setState({
        overview,
        profile,
        revisions: null,
        revisionAsOf: null,
        capabilityExplanation,
        loading: false,
        error: null,
        revisionsError: null,
        revisionsLoading: false,
      });
    } catch (e) {
      setState({
        ...emptyLoad,
        loading: false,
        error: errorMessage(e),
      });
    }
  }, [input, loadRevisionsForLink]);

  const refreshRevisions = useCallback(async () => {
    const { orgId, vehicleId, providerSourceLinkId, asOf } = input;
    if (!orgId || !vehicleId) return;
    const linkId =
      providerSourceLinkId ??
      state.overview?.profiles[0]?.providerSourceLinkId ??
      null;
    if (!linkId) return;
    await loadRevisionsForLink(orgId, vehicleId, linkId, asOf);
  }, [input, state.overview, loadRevisionsForLink]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load, refreshRevisions };
}
